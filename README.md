# 座席表作成

オーケストラの座席表を作るためのWebアプリです。

- **イベント**（例: 第50回定期演奏会）を複数持てる
- イベントに**メンバー**を1人ずつ登録する
- イベントに**曲**を追加するとき、その曲を弾くメンバーを選ぶ
- 曲ごとの**座席表**で、名前入りの丸をドラッグして並び替える
  - 丸は必ず真円（`width` = `height` = 72px + `border-radius: 50%`）
  - 行数の既定値は `max(floor(人数 / 6), 4)`。画面の +/− で変更できる（人数はできるだけ均等に振り分ける）
  - 2行目以降を半人分ずらす「ジグザグ」表示で、後ろの列の人が前の列の隙間から見える
- 席の配置は曲ごとに Cloudflare D1 に保存される（行の人数は固定ではなく、誰かを別の行へ動かしても他の人の配置は変わらない）
- 閲覧も編集も誰でも可（認証なし）

## 構成

| 役割 | 技術 |
|---|---|
| フロントエンド | React + TypeScript + Vite（`src/`） |
| API | Cloudflare Pages Functions（`functions/api/`） |
| データベース | Cloudflare D1（SQLite） |
| 並び替え | dnd-kit |

共有ヘルパーは `shared/` に置いています。`functions/` の中に置くとルートとして扱われてしまうためです。

## ローカルで動かす

```bash
npm install
npm run types      # worker-configuration.d.ts を生成（型チェック用）
npm run db:local   # ローカルのD1にスキーマを適用
npm run cf:dev     # http://localhost:8788 で起動（APIとフロントをまとめて配信）
```

フロントだけをホットリロードで開発したいときは、2つのターミナルで:

```bash
npm run dev        # Vite (http://localhost:5173) — /api は下の wrangler にプロキシする設定が必要
npm run cf:dev     # wrangler pages dev (http://localhost:8788)
```

> `npm run cf:dev` は `dist/` を配信します。フロントの変更を反映するには `npm run build` を実行してください。
> Vite のホットリロードを使いたい場合は `npx wrangler pages dev -- npm run dev` のプロキシモードが便利です。

ローカルのD1データは `.wrangler/state/` に保存されます。消したいときは `.wrangler` ディレクトリを削除してください。

## Cloudflare へのデプロイ

初回だけ、以下の順で実行します。

```bash
# 0. ログイン（Cloudflareアカウントが必要）
npx wrangler login

# 1. D1データベースを作成 → 表示された database_id を wrangler.jsonc に貼る
npx wrangler d1 create otoha-members

# 2. 本番のD1にスキーマを適用
npm run db:remote

# 3. ビルドしてデプロイ（最後に公開URLが表示される）
npm run deploy
```

2回目以降のデプロイは `npm run deploy` だけです。

> 書き込み時だけ「D1のbindingが見つからない」エラーになる場合は、Cloudflareのダッシュボードで
> Pagesプロジェクト → Settings → Bindings → Add → D1（binding名は `DB`）を追加して再デプロイしてください。

## 主なコマンド

| コマンド | 内容 |
|---|---|
| `npm run cf:dev` | ローカルでAPI＋フロントを起動 |
| `npm run dev` | Viteの開発サーバのみ |
| `npm run build` | 本番ビルド（`dist/`） |
| `npm run deploy` | ビルドしてCloudflare Pagesへデプロイ |
| `npm run db:local` / `db:remote` | スキーマ適用（ローカル / 本番） |
| `npm run typecheck` | フロントとFunctionsの型チェック |
| `npm run types` | `worker-configuration.d.ts` を再生成 |

## API

| Method | Path | 内容 |
|---|---|---|
| GET / POST | `/api/events` | イベント一覧（曲数・人数つき） / 作成 |
| GET / PATCH / DELETE | `/api/events/:id` | イベント取得 / 改名 / 削除 |
| GET / POST | `/api/events/:id/members` | メンバー一覧 / 追加 |
| PATCH / DELETE | `/api/members/:id` | メンバー改名 / 削除 |
| GET / POST | `/api/events/:id/songs` | 曲一覧 / 作成（`rows` で出演者の配置を指定） |
| GET / PATCH / DELETE | `/api/songs/:id` | 曲取得 / 変更 / 削除 |
| PUT | `/api/songs/:id/seats` | 席の配置を保存（`rows`） |

**`rows` は「行の配列」**です。`[[1,2,3],[4,5],[6,7,8]]` なら1行目に3人、2行目に2人、3行目に3人。
行の人数は固定ではなく、`PUT /api/songs/:id/seats` は毎回まるごと置き換えます（何度実行しても同じ結果になります）。
