# アルコールチェッカーアプリ (alc-app) 実装計画

## Context

2023年12月のアルコールチェック義務化に対応する業務用アルコール検知システム。
タニタ FC-1200 (ALBLO) を RS232C シリアル通信で制御し、NFC による乗務員識別、
vladmandic/human による顔認証を組み合わせた本人確認付きアルコール測定を実現する。

## システム構成

```
┌──────────────────────────────────────────────────────────┐
│                       Windows PC                          │
│                                                           │
│  ┌──────────────┐  WebSerial   ┌───────────────────────┐  │
│  │  Rust App     │◄──────────►│       Browser          │  │
│  │  (NFC Bridge) │  (COM: NFC) │       (CF Pages)       │  │
│  └──┬───────────┘              │                        │  │
│     │ Serial                   │  WebSerial (COM: ALC)  │  │
│     ▼                          │         │              │  │
│  ┌─────┐                      │  WebRTC  │  human.js   │  │
│  │ NFC │                      │ (Camera) │  (顔認証)    │  │
│  └─────┘                      └────┬─────┼─────────────┘  │
│                                    │     │                 │
│                              WebRTC│     ▼                 │
│                            シグナリング  ┌────────┐          │
│                                    │  │FC-1200 │          │
│                                    │  └────────┘          │
└────────────────────────────────────┼──────────────────────┘
                                    │ HTTPS / WebRTC
                     ┌──────────────┴──────────────┐
                     ▼                              ▼
          ┌─────────────────────┐     ┌──────────────────────┐
          │   Cloudflare        │     │   GCP                 │
          │  ┌───────────────┐  │     │  ┌────────────────┐   │
          │  │ Pages          │  │     │  │ Cloud Run       │   │
          │  │ (フロントエンド) │  │     │  │ (Rust API)      │   │
          │  └───────────────┘  │     │  └───────┬────────┘   │
          │  ┌───────────────┐  │     │  ┌───────┴────────┐   │
          │  │ Durable Objects│  │     │  │ Cloud SQL       │   │
          │  │ (WebRTC       │  │     │  │ PostgreSQL+RLS  │   │
          │  │  シグナリング)  │  │     │  └────────────────┘   │
          │  └───────────────┘  │     │  ┌────────────────┐   │
          └─────────────────────┘     │  │ Cloud Storage   │   │
                                      │  │ (顔写真)        │   │
                                      │  └────────────────┘   │
                                      └──────────────────────┘
```

## 測定フロー

1. 乗務員が NFC カードをタッチ → Rust が ID 読み取り → WebSerial でブラウザに送信
2. ブラウザが WebRTC でカメラ起動 → human.js で顔認証（本人確認）
3. 顔認証 OK → FC-1200 電源 ON → ブラウザが WebSerial で FC-1200 と直接 RS232C 通信
4. FC-1200 ウォーミングアップ → 吹きかけ → 測定結果取得（ブラウザ側でプロトコル処理）
5. 結果（顔写真 + アルコール値 + NFC ID + タイムスタンプ）を Cloudflare API に送信
6. ダッシュボードで管理者が履歴確認

---

## コンポーネント別実装計画

### 1. Rust NFC ブリッジ (`rust-nfc-bridge/`) ※別リポジトリ管理

**役割**: NFC リーダーのシリアル通信を処理し、仮想シリアルポートでブラウザに公開（NFCのみ）

**技術スタック**:
- `tokio` - 非同期ランタイム
- `tokio-serial` / `serialport` - NFC リーダーのシリアルポート通信
- `serde` / `serde_json` - JSON シリアライズ

**ファイル構成**:
```
rust-nfc-bridge/
├── Cargo.toml
├── src/
│   ├── main.rs              # エントリポイント、仮想シリアルポート公開
│   ├── nfc/
│   │   ├── mod.rs
│   │   └── reader.rs        # NFC リーダー通信
│   └── models.rs            # 共通データ型
```

**WebSerial メッセージ設計** (NFC ブリッジ → ブラウザ):

ブラウザが WebSerial API で Rust アプリの仮想シリアルポートに接続し、
JSON 行（改行区切り）で NFC 読み取り結果を受信する。

```json
// Rust → Browser (シリアル出力)
{ "type": "nfc_read", "employee_id": "12345678" }
{ "type": "nfc_error", "error": "read_failed" }
```

---

### 2. FC-1200 プロトコル WASM (`fc1200-wasm/`)

**役割**: FC-1200 RS232C プロトコルを Rust で実装し、WASM にコンパイルしてソースを秘匿する。
ブラウザが WebSerial API でシリアルポートに接続し、WASM モジュール経由でプロトコル処理を行う。

**技術スタック**:
- `wasm-pack` - Rust → WASM ビルド
- `wasm-bindgen` - JS ⇔ WASM バインディング

**ファイル構成**:
```
fc1200-wasm/
├── Cargo.toml
├── src/
│   ├── lib.rs               # WASM エントリポイント (wasm-bindgen)
│   ├── protocol.rs          # RS232C プロトコル実装
│   ├── commands.rs          # コマンド定義 (RQCN, MSWM, RS 等)
│   └── state_machine.rs     # 測定ステートマシン
├── pkg/                     # wasm-pack ビルド出力 → npm パッケージとして web/ から参照
```

**WASM 公開 API** (`wasm-bindgen`):
```rust
// ブラウザから呼び出す関数
#[wasm_bindgen]
pub fn create_session() -> Fc1200Session;

#[wasm_bindgen]
impl Fc1200Session {
    /// シリアルから受信したバイト列を処理し、状態遷移イベントを返す
    pub fn feed(&mut self, data: &[u8]) -> JsValue;  // → JSON イベント

    /// FC-1200 に送信すべきバイト列を取得（CNOK, RSOK 等）
    pub fn get_response(&mut self) -> Option<Vec<u8>>;

    /// 現在の状態を取得
    pub fn state(&self) -> String;
}
```

ブラウザ側の利用イメージ (`web/src/hooks/useFc1200Serial.ts`):
```typescript
import init, { create_session } from 'fc1200-wasm';
// WebSerial で受信 → session.feed(data) → イベント取得
// session.get_response() → WebSerial で送信
```

**FC-1200 プロトコル** (docs/131225 PDF に基づく):

通信設定:
- ボーレート: 9600bps
- データビット: 8
- パリティ: なし
- ストップビット: 1
- フロー制御: なし

測定モード ステートマシン:
```
Idle
→ WaitingConnection  (電源ON, FC-1200から RQCN,FC-1200,B 受信待ち)
→ Connected          (CNOK 送信)
→ WarmingUp          (UT受信 → カウントダウン → MSWM 受信)
→ BlowWaiting        (MSBL 受信)
→ Measuring          (吹きかけ中)
→ ResultReceived     (MSEN → RS,RRR,NNNNN 受信 → RSOK 送信)
→ Idle
```

FC-1200 コマンド一覧:
| 方向 | コマンド | 意味 |
|------|---------|------|
| FC→PC | `RQCN,FC-1200,B<CRLF>` | 通信確認要求 |
| PC→FC | `CNOK<CRLF>` | 接続OK |
| PC→FC | `CNNG<CRLF>` | 接続NG |
| FC→PC | `UT,TTTTTT,DDD<CRLF>` | 総使用時間(秒), 経過日数 |
| FC→PC | `MSWM<CRLF>` | ウォーミング完了 |
| FC→PC | `MSBL<CRLF>` | 吹きかけ待ち |
| FC→PC | `MSTO<CRLF>` | 吹きかけタイムアウト |
| FC→PC | `MSEN<CRLF>` | 吹きかけ終了 |
| FC→PC | `RS,RRR,NNNNN<CRLF>` | 通常測定結果 (R.RR mg/L, 使用回数) |
| FC→PC | `RSOV,NNNNN<CRLF>` | OVER表示結果 |
| FC→PC | `RSERBL,NNNNN<CRLF>` | 吹きかけエラー |
| PC→FC | `RSOK<CRLF>` | 結果受取OK |
| PC→FC | `RSNG<CRLF>` | 結果受取NG（再送信要求） |

メモリ取込モード:
| 方向 | コマンド | 意味 |
|------|---------|------|
| PC→FC | `RQCN,FC-1200,B<CRLF>` | 通信確認 |
| PC→FC | `RQDD<CRLF>` | データ取込要求 |
| FC→PC | `IIIIIIII,YYMMDDHHMMSS,RRR<CRLF>` | メモリデータ (ID, 日時, 結果) |
| PC→FC | `DDOK<CRLF>` | 取込完了 → FC側メモリ消去 |

日付更新モード:
| 方向 | コマンド | 意味 |
|------|---------|------|
| PC→FC | `DT,YYMMDDHHMM<CRLF>` | 日付更新 |
| FC→PC | `DTOK<CRLF>` / `DTNG<CRLF>` | OK / NG |

センサ寿命確認モード:
| 方向 | コマンド | 意味 |
|------|---------|------|
| PC→FC | `RQUT<CRLF>` | 寿命読込要求 |
| FC→PC | `UT,TTTTTT,DDD<CRLF>` | 総使用時間, 経過日数 |
| PC→FC | `UTOK<CRLF>` | 受取OK |

---

### 3. Web フロントエンド (`web/`) - Nuxt PWA

**技術スタック**:
- Framework: Nuxt 4 + PWA (`@vite-pwa/nuxt`)
- 顔認証: `@vladmandic/human`
- カメラ: WebRTC (`getUserMedia`)
- WebRTC シグナリング: Cloudflare Durable Objects
- NFC通信: WebSerial API (Rust NFC Bridge の仮想シリアルポート)
- FC-1200通信: WebSerial API + WASM (プロトコル処理は fc1200-wasm で秘匿)
- API通信: GCP Cloud Run バックエンド
- スタイリング: Tailwind CSS

**ファイル構成**:
```
web/
├── package.json
├── nuxt.config.ts             # Nuxt 設定 + PWA 設定
├── wrangler.toml              # Cloudflare Pages 設定
├── pages/
│   ├── index.vue              # 測定画面（メイン）
│   └── dashboard.vue          # 管理者ダッシュボード
├── components/
│   ├── NfcStatus.vue          # NFC 読み取り状態表示
│   ├── FaceAuth.vue           # 顔認証コンポーネント
│   ├── AlcMeasurement.vue     # アルコール測定状態・結果表示
│   ├── CameraPreview.vue      # カメラプレビュー (WebRTC)
│   └── ResultCard.vue         # 測定結果カード
├── composables/
│   ├── useNfcSerial.ts        # NFC Bridge WebSerial 接続
│   ├── useFc1200Serial.ts     # FC-1200 WebSerial + WASM 接続
│   ├── useFaceAuth.ts         # human.js 顔認証ロジック
│   ├── useCamera.ts           # WebRTC カメラ制御
│   └── useWebRtc.ts           # WebRTC + Durable Objects シグナリング
├── lib/
│   ├── human-config.ts        # human.js 設定
│   ├── face-db.ts             # 顔埋め込みDB (IndexedDB)
│   ├── fc1200.ts              # fc1200-wasm ラッパー (WASM 初期化 + WebSerial 連携)
│   └── api.ts                 # GCP バックエンド API クライアント
├── public/
│   └── manifest.json          # PWA マニフェスト
├── server/
│   └── api/                   # Nuxt サーバールート (必要に応じて)
└── types/
    └── index.ts
```

**PWA 対応**:
- オフライン時に直前の測定結果をキャッシュ表示
- Service Worker でバックグラウンド同期（オフライン測定 → オンライン復帰時に送信）
- ホーム画面追加対応（キオスクモード想定）

**顔認証フロー** (`@vladmandic/human`):
1. 事前登録: 管理者が乗務員の顔を撮影 → `human.detect()` で顔記述子(embedding)を取得 → IndexedDB + GCP に保存
2. 認証時: NFC タッチ → カメラ起動 → `human.detect()` → embedding 比較 → 類似度閾値で判定
3. 認証成功時にスナップショット撮影 → 測定記録に添付

**WebRTC (Cloudflare Durable Objects)**:
- Durable Objects が WebRTC シグナリングサーバーとして機能
- 管理者がダッシュボードからリアルタイムで測定現場の映像を確認可能
- 測定時のカメラ映像を P2P で管理者端末にストリーミング

---

### 4. Cloudflare Durable Objects (`cf-signaling/`)

**役割**: WebRTC シグナリングサーバー。測定端末と管理者ダッシュボード間のリアルタイム映像中継。

**技術スタック**:
- Cloudflare Workers + Durable Objects
- **Hibernatable WebSockets API** (必須) - アイドル時に DO を休止しコスト削減

**ファイル構成**:
```
cf-signaling/
├── package.json
├── wrangler.toml
├── src/
│   ├── index.ts              # Worker エントリポイント
│   └── signaling-room.ts     # Durable Object (Hibernatable WebSocket)
```

**Hibernatable WebSockets 実装**:
```typescript
export class SignalingRoom extends DurableObject {
  // Hibernatable WebSockets: acceptWebSocket で hibernate 対応
  async fetch(request: Request): Promise<Response> {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);  // ← hibernate 対応の accept
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // hibernate から復帰時に呼ばれるハンドラ
  async webSocketMessage(ws: WebSocket, message: string) {
    // SDP Offer/Answer, ICE Candidate を他の接続に中継
  }

  async webSocketClose(ws: WebSocket) {
    // 切断処理
  }
}
```

**シグナリングフロー**:
1. 測定端末が DO ルームに WebSocket 接続 → SDP Offer 送信
2. 管理者ダッシュボードが同じルームに接続 → SDP Answer 返信
3. ICE Candidate を相互交換 → P2P 映像ストリーム確立
4. シグナリング完了後、DO は自動的に **hibernate** → コスト発生なし

---

### 5. バックエンド API (`rust-alc-api/`) ※別リポジトリ管理

**技術スタック**:
- Rust (Axum フレームワーク)
- GCP Cloud Run (デプロイ先)
- PostgreSQL + RLS (Row Level Security によるマルチテナント対応)
- GCP Cloud Storage (顔写真ストレージ)

**ファイル構成**:
```
rust-alc-api/
├── Cargo.toml
├── Dockerfile               # Cloud Run 用コンテナ
├── src/
│   ├── main.rs              # Axum サーバー起動
│   ├── routes/
│   │   ├── mod.rs
│   │   ├── measurements.rs  # 測定結果 CRUD API
│   │   ├── employees.rs     # 乗務員管理 API
│   │   └── auth.rs          # 認証 API
│   ├── db/
│   │   ├── mod.rs
│   │   └── pool.rs          # SQLx PostgreSQL 接続プール
│   ├── middleware/
│   │   └── auth.rs          # 認証ミドルウェア + RLS セッション設定
│   └── models.rs            # データモデル
├── migrations/
│   ├── 001_create_tables.sql
│   └── 002_enable_rls.sql
```

**PostgreSQL スキーマ + RLS**:
```sql
-- テナント（事業所）
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 乗務員
CREATE TABLE employees (
  id TEXT PRIMARY KEY,              -- NFC カード ID (8桁)
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  face_descriptor BYTEA,            -- 顔埋め込みベクトル
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 測定結果
CREATE TABLE measurements (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id TEXT NOT NULL REFERENCES employees(id),
  alcohol_value REAL NOT NULL,      -- mg/L
  result_type TEXT NOT NULL,        -- 'normal' | 'over' | 'error'
  face_photo_url TEXT,              -- Cloud Storage URL
  device_use_count INTEGER,
  measured_at TIMESTAMPTZ NOT NULL
);

-- RLS 有効化
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー（current_setting でテナントID を制御）
CREATE POLICY tenant_isolation_employees ON employees
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY tenant_isolation_measurements ON measurements
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

**API エンドポイント**:
| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/measurements` | 測定結果を保存 |
| GET | `/api/measurements` | 測定履歴一覧（フィルタ対応） |
| GET | `/api/measurements/:id` | 測定詳細 |
| POST | `/api/employees` | 乗務員登録 |
| GET | `/api/employees` | 乗務員一覧 |
| PUT | `/api/employees/:id/face` | 顔データ更新 |
| POST | `/api/upload/face-photo` | 顔写真アップロード (Cloud Storage) |

---

## 実装順序

### Phase 1a: Rust NFC ブリッジ
1. Cargo プロジェクト作成、依存関係設定
2. NFC リーダーシリアル通信実装
3. 仮想シリアルポート公開（WebSerial API 対応）

### Phase 1b: FC-1200 プロトコル WASM
1. Cargo プロジェクト作成 (wasm-pack + wasm-bindgen)
2. RS232C プロトコル実装（コマンドパーサー + ステートマシン）
3. WASM ビルド → npm パッケージ出力

### Phase 2: GCP バックエンド (Rust API)
1. Cargo プロジェクト作成 (Axum)
2. PostgreSQL スキーマ作成 + RLS ポリシー設定
3. API エンドポイント実装
4. Cloud Storage 顔写真アップロード
5. Dockerfile 作成、Cloud Run デプロイ

### Phase 3a: Cloudflare Durable Objects (WebRTC シグナリング)
1. Workers + DO プロジェクト作成
2. シグナリングルーム実装
3. デプロイ・動作確認

### Phase 3b: Web フロントエンド (Nuxt PWA)
1. Nuxt 4 プロジェクト作成 + PWA 設定
2. WebSerial composable 実装（NFC: Rust ブリッジ接続）
3. WebSerial composable 実装（FC-1200: 直接接続 + WASM プロトコル処理）
4. human.js 顔認証実装
5. WebRTC + DO シグナリング実装
6. 測定画面 UI
7. ダッシュボード画面
8. Cloudflare Pages デプロイ

### Phase 4: 結合テスト
1. NFC → 顔認証 → 測定の E2E フロー確認
2. エラーケース（タイムアウト、吹きかけ失敗等）
3. ダッシュボード表示確認

---

## 検証方法

1. **Rust NFC Bridge**: NFC リーダーモックでの仮想シリアルポート動作確認
2. **Web FC-1200**: ブラウザ WebSerial で FC-1200 直接接続 → プロトコル処理テスト
3. **Web 顔認証**: human.js で顔登録・認証フロー動作確認
4. **API**: ローカル PostgreSQL + `cargo run` でエンドポイント検証
5. **E2E**: 実機 FC-1200 + NFC リーダー接続で全フロー通し確認
