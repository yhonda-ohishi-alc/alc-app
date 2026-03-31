# alc-app - アルコールチェッカーシステム

業務用アルコール検知システム。タニタ FC-1200 + NFC + 顔認証による本人確認付きアルコール測定。

**リポジトリ**: https://github.com/yhonda-ohishi-alc/alc-app (public)

## プロジェクト構成

| フォルダ | 説明 | リポジトリ |
|---------|------|----------|
| `web/` | Nuxt 4 PWA フロントエンド (Cloudflare Workers) | このリポジトリ |
| `fc1200-wasm/` | FC-1200 RS232C プロトコル WASM (ソース秘匿) | このリポジトリ |
| `cf-alc-signaling/` | WebRTC シグナリング (Cloudflare Durable Objects + Hibernatable WS) | このリポジトリ |
| `~/rust/rust-nfc-bridge/` | NFC リーダー → 仮想シリアルポート (Windows) | 別リポジトリ (symlink: alc-app) |
| `~/rust/rust-alc-api/` | バックエンド API (GCP Cloud Run + PostgreSQL RLS) | 別リポジトリ (symlink: alc-app) |
| `plan/` | 実装計画ドキュメント | このリポジトリ |
| `docs/` | 仕様書 (FC-1200 RS232C 通信フロー等) | このリポジトリ |

## 技術スタック

- **フロントエンド**: Nuxt 4, Tailwind CSS, @vladmandic/human, WebSerial API, WebRTC
- **FC-1200 プロトコル**: Rust → WASM (wasm-pack, wasm-bindgen)
- **シグナリング**: Cloudflare Workers + Durable Objects (Hibernatable WebSockets)
- **NFC ブリッジ**: Rust (tokio, serialport)
- **バックエンド API**: Rust (Axum), GCP Cloud Run
- **データベース**: PostgreSQL + Row Level Security
- **ストレージ**: Cloudflare R2 (顔写真)

## デプロイ

- **web (Cloudflare Workers)**: `cd web && npm run deploy` — `nuxt build && wrangler deploy`
  - URL: https://alc-app.m-tama-ramu.workers.dev
- **cf-alc-signaling (Cloudflare Workers)**: `cd cf-alc-signaling && wrangler deploy`
  - URL: https://alc-signaling.m-tama-ramu.workers.dev
  - シークレット不要 (現在 STUN P2P のみ。TURN は後日対応予定)
- **rust-alc-api (GCP Cloud Run)**: 別リポジトリで管理
- **rust-nfc-bridge**: `v*` タグ push で GitHub Actions が自動リリース (Windows ビルド + MSI 作成 + GitHub Release にアップロード)
  - 手順: `Cargo.toml` の version を上げる → commit & push → `gh release create v0.x.x` → Actions が MSI を追加

## 遠隔点呼 WebRTC (2026-03-04 実装)

運転者キオスク ↔ 運行管理者間の P2P ビデオ通話。STUN のみ (TURN は後日)。

| ファイル | 役割 |
|---------|------|
| `web/app/components/TenkoVideoCall.vue` | PiP ビデオ通話 UI (ミュート・カメラOFF ボタン、接続状態バッジ) |
| `web/app/components/TenkoKiosk.vue` | `remoteMode` prop → セッション開始後 WebRTC 接続 + ビデオオーバーレイ |
| `web/app/components/TenkoRemoteAdminView.vue` | 管理者側: アクティブセッション一覧 + クリックで通話開始 |
| `web/app/pages/index.vue` | 「遠隔点呼」タブ追加 (`?tab=remote`) |
| `web/app/pages/dashboard.vue` | 点呼管理グループに「遠隔点呼」タブ追加 |
| `web/app/composables/useWebRtc.ts` | `connect(signalingUrl, roomId)` — Room ID = tenko_session_id |
| `cf-alc-signaling/src/signaling-room.ts` | Durable Object: device/admin 2ピア間で SDP/ICE をリレー |

**接続フロー**: `nuxt.config.ts` の `NUXT_PUBLIC_SIGNALING_URL` に signaling Worker URL を設定。

## バージョニング

- **semver patch のみ** — バージョンアップは常に patch (例: 0.2.1 → 0.2.2)。minor/major は上げない。

## テスト

### テスト実行

```bash
npm test                # 全テスト (vitest run)
npm run test:watch      # ウォッチモード
npm run test:coverage   # カバレッジ付き
node scripts/check_coverage_100.mjs  # 100% リグレッション検出
```

### テスト環境

- **フレームワーク**: Vitest 4 + `@nuxt/test-utils` (Nuxt 環境)
- **DOM**: happy-dom (`@nuxt/test-utils` 経由)
- **IndexedDB**: `fake-indexeddb`
- **fc1200-wasm**: `tests/mocks/fc1200-wasm.ts` でモック (CI に wasm-pack 不要)
- `import.meta.client` は `@nuxt/test-utils` が自動で `true` に設定
- Nuxt auto-import (`useRoute`, `useState`, `ref` 等) も自動解決

### カバレッジ

- **Provider**: `@vitest/coverage-v8`
- **100% 達成ファイル**: `coverage_100.toml` で管理、CI でリグレッション検出
- **レポート**: `web/coverage/` (`.gitignore` 済み)

### テストパターン

- **pure utils**: モック不要、直接テスト (`license.ts`, `face-approval.ts`)
- **composables**: `vi.mock('~/utils/api')` で API モック、`vi.resetModules()` でモジュールキャッシュリセット
- **ブラウザ API** (WebSerial, BLE, NFC): `(navigator as any).serial = { ... }` でモック
- **Android bridge**: `(window as any).Android = { ... }` でモック
- **Nuxt auto-import のモック**: `mockNuxtImport('useRoute', () => mockFn)` (`@nuxt/test-utils/runtime`)
- **useState 共有ステート**: `beforeEach` でリセットすること (テスト間で値が共有される)

### 型同期 (ts-rs)

Rust バックエンドの models.rs → TypeScript 型を自動生成:
```bash
cd ~/rust/rust-alc-api
bash scripts/sync-types.sh
# → web/app/types/generated/ に 91 ファイル生成
```

- `types/generated/` は git 管理 (CI で差分チェック可能)
- `types/index.ts` から `Backend` namespace で参照: `import { Backend } from '~/types'`
- フロント固有型 (`FaceAuthResult`, `Fc1200State` 等) は `types/index.ts` に手動定義

### CI

- **GitHub Actions**: `.github/workflows/test.yml`
  - `npm ci` → `vitest run --coverage` → `check_coverage_100.mjs` → artifact アップロード
  - fc1200-wasm は CI でスタブ化 (ダミー package.json + index.js)
  - トリガー: push/PR to main (`web/**` パス変更時)

## 重要な注意事項

- **リポジトリは public** — 機密情報のコミットに注意
- `docs/*.pdf` (FC-1200 通信仕様 = **Tanita Confidential**) は `.gitignore` 済み — **絶対にコミットしない**
- `fc1200-wasm/src/`, `Cargo.toml`, `Cargo.lock` は `.gitignore` 済み — WASM にコンパイルしてプロトコル実装を秘匿
- `rust-nfc-bridge/` と `rust-alc-api/` は `~/rust/` に移動済み（各プロジェクト内に `alc-app` symlink あり）
- Durable Objects の WebRTC 実装は **Hibernatable WebSockets API** が必須
