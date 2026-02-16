## 未コミットの変更
- なし (working tree clean)

## 次にやること
1. **Backend (rust-alc-api) に JWT 認証を実装・コミット・push** — 別リポジトリ。以下のファイルが作成/変更済み (ローカルのみ):
   - 新規: `migrations/003_create_users.sql`, `src/auth/mod.rs`, `src/auth/google.rs`, `src/auth/jwt.rs`
   - 変更: `Cargo.toml`, `main.rs`, `models.rs`, `routes/auth.rs`, `routes/mod.rs`, `middleware/auth.rs`
   - `cargo check` 通過済み (warning のみ)
2. **Backend デプロイ** — Cloud Run に再デプロイ + 環境変数追加 (`GOOGLE_CLIENT_ID`, `JWT_SECRET`)
3. **GCP Console** — OAuth 2.0 クライアント ID を作成し、`NUXT_PUBLIC_GOOGLE_CLIENT_ID` を Cloudflare Pages に設定
4. **実機テスト** — FC-1200 + NFC リーダー実機で測定フロー動作確認
5. **postgres パスワード変更** — `postgres-temp-2024` を本番用に変更

## 注意点
- Frontend JWT 認証は実装・コミット・push・デプロイ済み (commit `0fdedc7`)
- Backend の auth コードは `rust-alc-api/` (別リポジトリ、`.gitignore` 済み) にあるので、別リポジトリでコミット・push が必要
- Frontend の `import.meta.client` は vitest で動かないため `typeof window !== 'undefined'` に統一済み
