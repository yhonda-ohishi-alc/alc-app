# alc-app - アルコールチェッカーシステム

業務用アルコール検知システム。タニタ FC-1200 + NFC + 顔認証による本人確認付きアルコール測定。

**リポジトリ**: https://github.com/yhonda-ohishi-alc/alc-app (public)

## プロジェクト構成

| フォルダ | 説明 | リポジトリ |
|---------|------|----------|
| `web/` | Nuxt 4 PWA フロントエンド (Cloudflare Pages) | このリポジトリ |
| `fc1200-wasm/` | FC-1200 RS232C プロトコル WASM (ソース秘匿) | このリポジトリ |
| `cf-alc-signaling/` | WebRTC シグナリング (Cloudflare Durable Objects + Hibernatable WS) | このリポジトリ |
| `rust-nfc-bridge/` | NFC リーダー → 仮想シリアルポート (Windows) | 別リポジトリ |
| `rust-alc-api/` | バックエンド API (GCP Cloud Run + PostgreSQL RLS) | 別リポジトリ |
| `plan/` | 実装計画ドキュメント | このリポジトリ |
| `docs/` | 仕様書 (FC-1200 RS232C 通信フロー等) | このリポジトリ |

## 技術スタック

- **フロントエンド**: Nuxt 4, Tailwind CSS, @vladmandic/human, WebSerial API, WebRTC
- **FC-1200 プロトコル**: Rust → WASM (wasm-pack, wasm-bindgen)
- **シグナリング**: Cloudflare Workers + Durable Objects (Hibernatable WebSockets)
- **NFC ブリッジ**: Rust (tokio, serialport)
- **バックエンド API**: Rust (Axum), GCP Cloud Run
- **データベース**: PostgreSQL + Row Level Security
- **ストレージ**: GCP Cloud Storage (顔写真)

## デプロイ

- **web (Cloudflare Pages)**: `cd web && npm run deploy` — ビルド + `wrangler pages deploy dist` (プロジェクト名: `alc-app`)
- **cf-alc-signaling (Cloudflare Workers)**: `cd cf-alc-signaling && wrangler deploy`
- **rust-alc-api (GCP Cloud Run)**: 別リポジトリで管理

## 重要な注意事項

- **リポジトリは public** — 機密情報のコミットに注意
- `docs/*.pdf` (FC-1200 通信仕様 = **Tanita Confidential**) は `.gitignore` 済み — **絶対にコミットしない**
- `fc1200-wasm/src/`, `Cargo.toml`, `Cargo.lock` は `.gitignore` 済み — WASM にコンパイルしてプロトコル実装を秘匿
- `rust-nfc-bridge/` と `rust-alc-api/` は `.gitignore` 済み (別リポジトリ管理)
- Durable Objects の WebRTC 実装は **Hibernatable WebSockets API** が必須
