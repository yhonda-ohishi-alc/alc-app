# web

アルコールチェッカーシステムの Web フロントエンド。Cloudflare Pages にデプロイ。

## 技術スタック

- Nuxt 4 + PWA (`@vite-pwa/nuxt`)
- `@vladmandic/human` - 顔認証
- WebRTC (`getUserMedia`) - カメラ
- WebSerial API - NFC Bridge / FC-1200 接続
- Tailwind CSS

## 主な機能

- NFC カード読み取り (Rust NFC Bridge 経由)
- 顔認証による本人確認 (human.js)
- FC-1200 アルコール測定 (WASM プロトコル処理)
- WebRTC リアルタイム映像 (CF Durable Objects シグナリング)
- 管理者ダッシュボード
- PWA オフライン対応

## デプロイ

```bash
npx wrangler pages deploy
```
