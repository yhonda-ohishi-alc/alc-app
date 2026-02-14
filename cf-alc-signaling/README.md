# cf-signaling

Cloudflare Durable Objects による WebRTC シグナリングサーバー。
測定端末と管理者ダッシュボード間のリアルタイム映像中継を行う。

## 技術スタック

- Cloudflare Workers + Durable Objects
- Hibernatable WebSockets API (必須)

## 仕組み

1. 測定端末が DO ルームに WebSocket 接続 → SDP Offer 送信
2. 管理者ダッシュボードが同じルームに接続 → SDP Answer 返信
3. ICE Candidate を相互交換 → P2P 映像ストリーム確立
4. シグナリング完了後、DO は自動的に hibernate → コスト発生なし

## デプロイ

```bash
npx wrangler deploy
```
