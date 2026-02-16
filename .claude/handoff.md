## 未コミットの変更
- JWT 認証切替 (Phase 2 of auth plan) の全ファイルが未コミット・未ステージ
  - 新規: `useAuth.ts`, `auth.global.ts`, `login.vue`, `google-auth.client.ts`, `useAuth.test.ts`
  - 変更: `api.ts`, `types/index.ts`, `nuxt.config.ts`, `app.vue`, `index.vue`, `dashboard.vue`, `maintenance.vue`, `setup.ts`, `api.test.ts`
- テスト: 67 テスト全パス (`npm test` in `web/`)
- 未 push のコミット 1 件: `595d91e` Phase 6 完了

## 次にやること
1. **JWT 認証フロントエンド変更をコミット** — 上記の未コミットファイルをまとめてコミット
2. **`git push`** — Phase 6 + JWT auth コミットをリモートに反映
3. **Cloudflare Pages にデプロイ** — `cd web && npm run build && npx wrangler pages deploy dist`
4. **Backend (rust-alc-api) に JWT 認証を実装** — `rust-alc-api/` は別リポジトリ。以下のファイルが作成/変更済み (ローカルのみ):
   - 新規: `migrations/003_create_users.sql`, `src/auth/mod.rs`, `src/auth/google.rs`, `src/auth/jwt.rs`
   - 変更: `Cargo.toml`, `main.rs`, `models.rs`, `routes/auth.rs`, `routes/mod.rs`, `middleware/auth.rs`
   - `cargo check` 通過済み (warning のみ)
5. **Backend デプロイ** — Cloud Run に再デプロイ + 環境変数追加 (`GOOGLE_CLIENT_ID`, `JWT_SECRET`)
6. **GCP Console** — OAuth 2.0 クライアント ID を作成し、`NUXT_PUBLIC_GOOGLE_CLIENT_ID` を Cloudflare Pages に設定
7. **実機テスト** — FC-1200 + NFC リーダー実機で測定フロー動作確認
8. **postgres パスワード変更** — `postgres-temp-2024` を本番用に変更

## 注意点
- JWT 認証の計画書: `.claude/plans/ticklish-spinning-toast.md`
- Backend の auth コードは `rust-alc-api/` (別リポジトリ、`.gitignore` 済み) にあるので、別リポジトリでコミット・push が必要
- Frontend の `import.meta.client` は vitest で動かないため `typeof window !== 'undefined'` に統一済み
- テスト: Vitest 67 テスト全パス (59 既存 + 8 新規 auth テスト)
