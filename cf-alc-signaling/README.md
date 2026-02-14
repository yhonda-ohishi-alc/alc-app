# cf-alc-signaling

Cloudflare Durable Objects による WebRTC シグナリングサーバー。
測定端末と管理者ダッシュボード間のリアルタイム映像中継を行う。

## 技術スタック

- Cloudflare Workers + Durable Objects
- Hibernatable WebSockets API (必須)
- TypeScript

## 仕組み

1. 測定端末が DO ルームに WebSocket 接続 → SDP Offer 送信
2. 管理者ダッシュボードが同じルームに接続 → SDP Answer 返信
3. ICE Candidate を相互交換 → P2P 映像ストリーム確立
4. シグナリング完了後、DO は自動的に hibernate → コスト発生なし

## API

### `GET /health`
ヘルスチェック。`ok` を返す。

### `GET /room/:roomId?role=device|admin` (WebSocket)
シグナリングルームに WebSocket 接続。

- `role=device` — 測定端末 (SDP Offer 送信側)
- `role=admin` — 管理者ダッシュボード (SDP Answer 送信側)

### メッセージプロトコル

```jsonc
// Device → Server → Admin
{ "type": "sdp_offer", "sdp": "v=0..." }

// Admin → Server → Device
{ "type": "sdp_answer", "sdp": "v=0..." }

// 双方向
{ "type": "ice_candidate", "candidate": { "candidate": "...", "sdpMid": "0", "sdpMLineIndex": 0 } }

// Keep-alive
{ "type": "ping" }  →  { "type": "pong" }

// サーバー通知
{ "type": "peer_joined", "role": "device|admin" }
{ "type": "peer_left", "role": "device|admin" }
{ "type": "error", "message": "..." }
```

## 開発

```bash
npm install
npm run dev     # localhost:8787
```

## デプロイ

```bash
npm run deploy
```
