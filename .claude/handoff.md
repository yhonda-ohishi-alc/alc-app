## 未コミットの変更
- `web/app/composables/useNfcWebSocket.ts` — `nfc_debug` イベントハンドラ追加（デプロイ済み）
- `web/app/types/index.ts` — `NfcDebugEvent` 型追加（デプロイ済み）

## 次にやること
1. **USB 切断音の原因特定** — ブラウザ console に APDU ステップログ (`nfc_debug`) が出る状態。どのステップの後に USB 切断音が鳴るか確認し、該当コマンドを特定する。候補は `CMD_SELECT_END` (Step 7)
2. **特定後: 該当 APDU コマンドの削除または代替** — `rust-nfc-bridge/src/nfc/license.rs` で修正
3. **デバッグログの削除** — 原因特定後、`nfc_debug` イベント送信を削除（または feature flag 化）
4. **Backend (rust-alc-api) に JWT 認証を実装・コミット・push** — 別リポジトリ
5. **Backend デプロイ** — Cloud Run に再デプロイ + 環境変数追加
6. **postgres パスワード変更** — `postgres-temp-2024` を本番用に変更

## 注意点
- `rust-nfc-bridge` は v0.2.9 がリリース済み。主な変更:
  - `Arc<Context>` で PCSC コンテキスト永続化
  - `std::mem::forget(card)` で SCardDisconnect を防止
  - `skip_read` フラグでカードが載っている間の再読み取りスキップ
  - APDU ステップごとの `nfc_debug` WebSocket イベント送信
- これらの修正でも USB 切断音は解消されていない。APDU コマンド自体が原因の可能性が高い
