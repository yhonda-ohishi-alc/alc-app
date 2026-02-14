# 実装計画 (詳細)

> 顔認証を最優先とし、ハードウェア非依存な部分から段階的に実装する。
> 各タスクの複雑度: **L** = Low / **M** = Medium / **H** = High

---

## 依存関係グラフ

```
Phase 1: Web 基盤 + 顔認証 (ハードウェア不要)
    │
    ├── Phase 2: FC-1200 WASM (プロトコル実装)
    │       │
    │       └── Phase 3b: Web FC-1200 統合
    │
    ├── Phase 3a: Rust NFC ブリッジ
    │       │
    │       └── Phase 3b: Web NFC 統合
    │
    ├── Phase 4: バックエンド API + DB
    │       │
    │       └── Phase 5b: Web API 統合
    │
    └── Phase 5a: WebRTC シグナリング (cf-alc-signaling)
            │
            └── Phase 5b: Web WebRTC 統合

Phase 6: 結合テスト + デプロイ
```

---

## Phase 1: Web 基盤 + 顔認証 ✅

**目標**: Nuxt 4 プロジェクトを構築し、顔認証フローを単独で動作させる。
**ハードウェア依存**: なし (カメラのみ)

### 1-1. Nuxt 4 プロジェクト初期化 **[L]**

```
web/
├── package.json
├── nuxt.config.ts
├── tsconfig.json
├── app/
│   ├── app.vue
│   ├── pages/
│   ├── components/
│   ├── composables/
│   └── utils/
├── public/
│   └── manifest.json
└── tailwind.config.ts
```

- [x] `npx nuxi init` で Nuxt 4 プロジェクト作成
- [x] Tailwind CSS 導入 (`@nuxtjs/tailwindcss`)
- [x] PWA 設定 (`@vite-pwa/nuxt`)
- [x] TypeScript 型定義 (`app/types/index.ts`)

### 1-2. human.js セットアップ **[M]**

- [x] `@vladmandic/human` インストール
- [x] `app/utils/human-config.ts` — モデル設定
  - face detection: blazeface (軽量)
  - face description: embedding 抽出用
  - body/hand/gesture: 無効化 (不要)
- [x] `app/composables/useFaceDetection.ts` — human.js 初期化 + 顔検出
  - `load()` — モデルロード (初回のみ)
  - `detect(video)` — 顔検出 + embedding 取得
  - `isReady` — ロード状態

### 1-3. 顔認証コア実装 **[H]**

- [x] `app/utils/face-db.ts` — IndexedDB による顔 embedding ストレージ
  - `saveFaceDescriptor(employeeId, descriptor)` — 登録
  - `getFaceDescriptor(employeeId)` — 取得
  - `getAllDescriptors()` — 全件取得
  - `deleteFaceDescriptor(employeeId)` — 削除
- [x] `app/composables/useFaceAuth.ts` — 顔認証ロジック
  - `register(employeeId, video)` — 顔登録 (embedding 保存)
  - `verify(employeeId, video)` — 1:1 照合 (NFC ID → 本人確認)
  - `identify(video)` — 1:N 識別 (NFC なしでの識別)
  - `similarity(a, b)` — コサイン類似度計算
  - `THRESHOLD` — 認証閾値 (0.5〜0.6 で調整)

### 1-4. カメラ制御 **[M]**

- [x] `app/composables/useCamera.ts`
  - `start(facingMode)` — カメラ起動 (`getUserMedia`)
  - `stop()` — カメラ停止
  - `takeSnapshot()` — スナップショット撮影 (Canvas → Blob)
  - `stream` — MediaStream ref
  - `videoRef` — video 要素 ref

### 1-5. 顔認証 UI **[M]**

- [x] `app/components/CameraPreview.vue` — カメラプレビュー + 顔検出オーバーレイ
- [x] `app/components/FaceAuth.vue` — 顔認証コンポーネント
  - 状態表示: 検出中 → 照合中 → 成功/失敗
  - 認証成功時にスナップショット自動撮影
- [x] `app/pages/index.vue` — 測定画面 (まず顔認証のみ)
- [x] `app/pages/register.vue` — 顔登録画面

### Milestone 1 チェックポイント
> ブラウザでカメラ起動 → 顔検出 → 登録 → 認証が動作する

---

## Phase 2: FC-1200 プロトコル WASM (`fc1200-wasm/`) ✅

**目標**: FC-1200 RS232C プロトコルを Rust で実装し、WASM にコンパイル。
**注意**: `src/`, `Cargo.toml`, `Cargo.lock` は `.gitignore` 済み (ソース秘匿)

### 2-1. Rust WASM プロジェクト作成 **[L]**

- [x] `cargo init --lib fc1200-wasm`
- [x] `Cargo.toml` に `wasm-bindgen`, `serde`, `serde_json` 追加
- [x] wasm-pack ビルド確認 (`wasm-pack build --target web`)

### 2-2. プロトコルパーサー **[M]**

- [x] `src/commands.rs` — コマンド定義
  - FC→PC: `RQCN`, `UT`, `MSWM`, `MSBL`, `MSTO`, `MSEN`, `RS`, `RSOV`, `RSERBL`
  - PC→FC: `CNOK`, `CNNG`, `RSOK`, `RSNG`, `RQDD`, `DDOK`, `DT`, `RQUT`, `UTOK`
  - パーサー: CRLF 区切りでバイト列 → コマンド enum に変換
- [x] `src/protocol.rs` — シリアライズ/デシリアライズ
  - `parse(bytes) → Option<Command>` — 受信バイト列のパース
  - `serialize(command) → Vec<u8>` — 送信バイト列の生成

### 2-3. ステートマシン **[H]**

- [x] `src/state_machine.rs` — 測定モードのステートマシン
  ```
  Idle → WaitingConnection → Connected → WarmingUp
  → BlowWaiting → Measuring → ResultReceived → Idle
  ```
  - 各状態遷移でイベントを発行 (JSON)
  - タイムアウト処理
  - エラーハンドリング (MSTO, RSERBL)

### 2-4. WASM バインディング **[M]**

- [x] `src/lib.rs` — wasm-bindgen エントリポイント
  ```rust
  #[wasm_bindgen]
  pub fn create_session() -> Fc1200Session;
  impl Fc1200Session {
      pub fn feed(&mut self, data: &[u8]) -> JsValue;
      pub fn get_response(&mut self) -> Option<Vec<u8>>;
      pub fn state(&self) -> String;
  }
  ```
- [x] `wasm-pack build --target web` → `pkg/` 出力
- [x] ユニットテスト (Rust 側)

### Milestone 2 チェックポイント
> Rust テストで全コマンドのパース + ステートマシン遷移が正しく動作する
> `pkg/` に npm パッケージが生成される

---

## Phase 3a: Rust NFC ブリッジ (`rust-nfc-bridge/`) ※別リポジトリ ✅

**目標**: NFC リーダーの読み取りを WebSocket 経由でブラウザに公開。
**変更**: 当初の仮想 COM ポート案から WebSocket (`ws://127.0.0.1:9876`) に変更。PC/SC API で NFC リーダーと通信。

### 3a-1. Rust プロジェクト作成 **[L]**

- [x] `cargo init rust-nfc-bridge`
- [x] 依存関係: `tokio`, `pcsc`, `tokio-tungstenite`, `serde_json`

### 3a-2. NFC リーダー通信 **[M]**

- [x] `src/nfc/reader.rs` — PC/SC API で NFC リーダーと通信
  - リーダー検出 + 接続
  - カード読み取り (UID — MIFARE & FeliCa)
  - ポーリングループ

### 3a-3. WebSocket サーバー公開 **[H]**

- [x] `src/ws/server.rs` — WebSocket サーバー (ws://127.0.0.1:9876)
  - NFC 読み取り結果を JSON ブロードキャスト
  - `{ "type": "nfc_read", "employee_id": "AABBCCDD" }`
  - `{ "type": "nfc_error", "error": "..." }`
  - `{ "type": "status", "readers": [...], "connected": true }`
- [x] `src/events.rs` — NfcEvent enum (serde tag = "type")
- [x] `src/config.rs` — CLI 設定 (port, polling interval, cooldown)

### Milestone 3a チェックポイント
> Windows で NFC カードタッチ → 仮想 COM ポートに JSON 出力される

---

## Phase 3b: Web ハードウェア統合 (`web/`) ✅

**目標**: NFC + FC-1200 を Web フロントエンドに統合。
**変更**: NFC は WebSerial ではなく WebSocket で接続 (rust-nfc-bridge が WebSocket サーバー)

### 3b-1. NFC WebSocket 接続 **[M]**

- [x] `app/composables/useNfcWebSocket.ts` (**useNfcSerial から変更**)
  - `connect()` — WebSocket で NFC Bridge (`ws://127.0.0.1:9876`) に接続
  - `disconnect()` — 切断
  - `onRead(callback)` — NFC 読み取りイベント
  - `isConnected` — 接続状態
  - 自動再接続 (3秒間隔, 最大10回)
- [x] `app/components/NfcStatus.vue` — NFC 接続状態 + 読み取り結果表示

### 3b-2. FC-1200 WebSerial + WASM 接続 **[H]**

- [x] `app/utils/fc1200.ts` — WASM 初期化ラッパー
  - `initFc1200Wasm()` — WASM ロード (動的インポート, SSR 安全)
  - `createFc1200Session()` — セッション作成
- [x] `app/composables/useFc1200Serial.ts`
  - `connect(baudRate: 9600)` — WebSerial で FC-1200 に直接接続
  - `disconnect()` — 切断
  - `startMeasurement()` — 測定開始 (WASM ステートマシン駆動)
  - `state` — 現在の測定状態 ref
  - `result` — 測定結果 ref
  - 受信ループ: `reader.read()` → `session.feed(data)` → イベント処理
  - 送信: `session.get_response()` → `writer.write(bytes)`
- [x] `app/components/AlcMeasurement.vue` — 測定状態 + 結果表示
  - ウォームアップ中 / 吹きかけ待ち / 測定中 / 結果表示

### 3b-3. 測定フロー統合 **[H]**

- [x] `app/pages/index.vue` を更新 — 全フロー統合
  ```
  NFC タッチ → 顔認証 → FC-1200 測定 → 結果表示
  ```
- [x] `app/components/ResultCard.vue` — 測定結果カード
  - 顔写真 + アルコール値 + NFC ID + タイムスタンプ

### Milestone 3 チェックポイント
> NFC カードタッチ → 顔認証 → FC-1200 測定 → 結果表示の一連のフローが動作する

---

## Phase 4: バックエンド API (`rust-alc-api/`) ※別リポジトリ ✅

**目標**: 測定結果の永続化 + マルチテナント対応 API。

### 4-1. Rust Axum プロジェクト作成 **[L]**

- [x] `cargo init rust-alc-api`
- [x] 依存関係: `axum`, `tokio`, `sqlx`, `serde`, `tower-http`
- [x] `Dockerfile` (Cloud Run 用)

### 4-2. PostgreSQL スキーマ + RLS **[M]**

- [x] `migrations/001_create_tables.sql`
  - `tenants` — 事業所テーブル
  - `employees` — 乗務員テーブル (NFC ID, 顔 embedding)
  - `measurements` — 測定結果テーブル
- [x] `migrations/002_enable_rls.sql`
  - RLS ポリシー (tenant_id ベースのアイソレーション)
  - `current_setting('app.current_tenant_id')` で制御

### 4-3. API エンドポイント実装 **[H]**

- [x] `src/db/pool.rs` — SQLx 接続プール
- [x] `src/middleware/auth.rs` — 認証 + RLS セッション設定
- [x] `src/routes/measurements.rs`
  - `POST /api/measurements` — 測定結果保存
  - `GET /api/measurements` — 履歴一覧 (フィルタ対応)
  - `GET /api/measurements/:id` — 詳細
- [x] `src/routes/employees.rs`
  - `POST /api/employees` — 乗務員登録
  - `GET /api/employees` — 一覧
  - `PUT /api/employees/:id/face` — 顔データ更新
- [x] `src/routes/auth.rs` — 認証 API

### 4-4. Cloud Storage 連携 **[M]**

- [x] `POST /api/upload/face-photo` — 顔写真アップロード
  - GCP Cloud Storage に保存
  - Signed URL 発行

### 4-5. デプロイ **[M]**

- [ ] Cloud SQL (PostgreSQL) インスタンス作成
- [ ] Cloud Run デプロイ設定
- [ ] 環境変数 / Secret Manager 設定

### Milestone 4 チェックポイント
> API で乗務員登録 → 測定結果保存 → 履歴取得ができる

---

## Phase 5a: WebRTC シグナリング (`cf-alc-signaling/`)

**目標**: Cloudflare Durable Objects で WebRTC シグナリングサーバーを構築。

### 5a-1. Workers + DO プロジェクト作成 **[L]**

```
cf-alc-signaling/
├── package.json
├── wrangler.toml
├── tsconfig.json
└── src/
    ├── index.ts
    └── signaling-room.ts
```

- [ ] `npm init` + `wrangler` セットアップ
- [ ] `wrangler.toml` — Durable Objects バインディング設定

### 5a-2. シグナリングルーム実装 **[H]**

- [ ] `src/signaling-room.ts` — Hibernatable WebSockets 実装
  ```typescript
  export class SignalingRoom extends DurableObject {
    async fetch(request: Request): Promise<Response>
    async webSocketMessage(ws: WebSocket, message: string)
    async webSocketClose(ws: WebSocket)
  }
  ```
  - `ctx.acceptWebSocket()` で hibernate 対応
  - SDP Offer/Answer 中継
  - ICE Candidate 中継
  - ルーム参加者管理 (測定端末 / 管理者)
- [ ] `src/index.ts` — Worker エントリポイント
  - URL パスからルーム ID を取得
  - Durable Object にルーティング

### 5a-3. デプロイ **[L]**

- [ ] `npx wrangler deploy`
- [ ] 動作確認 (WebSocket 接続テスト)

### Milestone 5a チェックポイント
> 2 つのクライアントが WebSocket 接続 → SDP/ICE 交換 → P2P 接続確立

---

## Phase 5b: Web 統合 (API + WebRTC)

### 5b-1. API クライアント **[M]**

- [ ] `app/utils/api.ts` — GCP バックエンド API クライアント
  - 認証トークン管理
  - 測定結果送信
  - 乗務員データ取得/同期
  - 顔写真アップロード

### 5b-2. WebRTC 実装 **[H]**

- [ ] `app/composables/useWebRtc.ts`
  - `connect(roomId)` — DO シグナリングサーバーに WebSocket 接続
  - `startStreaming(stream)` — カメラ映像の P2P 送信
  - `onRemoteStream(callback)` — リモート映像受信
  - SDP Offer/Answer 処理
  - ICE Candidate 交換
  - 再接続ロジック

### 5b-3. ダッシュボード **[M]**

- [ ] `app/pages/dashboard.vue` — 管理者ダッシュボード
  - 測定履歴一覧 (API から取得)
  - フィルタ (日付, 乗務員, 結果)
  - リアルタイム映像プレビュー (WebRTC)
- [ ] `app/components/MeasurementHistory.vue` — 履歴テーブル
- [ ] `app/components/RemoteCamera.vue` — リモートカメラビュー

### 5b-4. PWA オフライン対応 **[M]**

- [ ] Service Worker 設定 (workbox via @vite-pwa/nuxt)
- [ ] オフライン時に直前の測定結果をキャッシュ表示
- [ ] バックグラウンド同期 (オフライン測定 → オンライン復帰時に API 送信)

### Milestone 5 チェックポイント
> 測定結果が API に保存される
> 管理者ダッシュボードで履歴確認 + リアルタイム映像が見れる

---

## Phase 6: 結合テスト + デプロイ

### 6-1. E2E テスト **[H]**

- [ ] NFC → 顔認証 → FC-1200 測定 → API 保存 → ダッシュボード表示
- [ ] エラーケース
  - NFC 読み取り失敗
  - 顔認証失敗 (別人 / 検出不可)
  - 吹きかけタイムアウト (MSTO)
  - 吹きかけエラー (RSERBL)
  - ネットワーク断 → オフライン測定 → 復帰後同期
- [ ] WebRTC 映像品質確認

### 6-2. デプロイ **[M]**

- [ ] Cloudflare Pages (`web/`) デプロイ設定
- [ ] Cloudflare Workers (`cf-alc-signaling/`) デプロイ
- [ ] GCP Cloud Run (`rust-alc-api/`) デプロイ
- [ ] DNS / ドメイン設定

### 6-3. 運用準備 **[L]**

- [ ] ログ / モニタリング設定
- [ ] FC-1200 センサ寿命確認機能 (`RQUT` コマンド)
- [ ] メモリ取込モード (`RQDD` コマンド) — バックアップ用

---

## タスク数サマリー

| Phase | 内容 | 状態 | 依存 |
|-------|------|------|------|
| **1** | Web 基盤 + 顔認証 | ✅ 完了 | なし |
| **2** | FC-1200 WASM | ✅ 完了 | なし |
| **3a** | Rust NFC ブリッジ | ✅ 完了 | なし |
| **3b** | Web ハードウェア統合 | ✅ 完了 | 1, 2, 3a |
| **4** | バックエンド API | ✅ 完了 | なし |
| **5a** | WebRTC シグナリング | 未着手 | なし |
| **5b** | Web 統合 (API + WebRTC) | 未着手 | 1, 4, 5a |
| **6** | 結合テスト + デプロイ | 未着手 | 全て |

## 並行実装が可能な組み合わせ

```
同時着手 OK:
  Phase 1 (Web 顔認証) ← 最優先
  Phase 2 (FC-1200 WASM)
  Phase 3a (NFC ブリッジ)
  Phase 4 (バックエンド API)
  Phase 5a (WebRTC シグナリング)

上記完了後:
  Phase 3b (Web ハードウェア統合) ← Phase 1, 2, 3a に依存
  Phase 5b (Web API + WebRTC 統合) ← Phase 1, 4, 5a に依存

最後:
  Phase 6 (結合テスト) ← 全てに依存
```
