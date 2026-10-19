# 小柳ロウ 配信スケジュール

YouTube の配信枠を 30 分ごとに取得し、週・月のカレンダーで見る静的サイトです。

## 公開

GitHub の Settings → Pages で、Build and deployment の Source を GitHub Actions にします。公開先は `https://<ユーザー名>.github.io/aomania-oshikatsu/` です。

## 配信の自動取得

リポジトリの Secrets に `YOUTUBE_API_KEY` を追加します。値は Google Cloud で作った YouTube Data API v3 の API キーです。

キーを入れたあと、Actions の `fetch` を手動実行すると取得が始まります。取得結果はサイトへ公開されます。以降は 30 分ごとに動きます。

## メモの保存

サイトにトークンの入力画面は出ません。追加と削除は `public/data/manual.json` に保存され、開いた人全員が同じメモを見ます。

1. GitHub の Settings → Developer settings → Personal access tokens → Fine-grained tokens を開く。
2. Repository access で `S0iRu/aomania-oshikatsu` だけを選ぶ。
3. Permissions の Actions を Read and write にする。
4. リポジトリの Settings → Secrets and variables → Actions に、名前 `MEMO_TOKEN` でそのトークンを追加する。
5. Actions の `pages` を再実行する。
