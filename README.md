# 小柳ロウ 配信スケジュール

YouTube の配信枠を 30 分ごとに取得し、週・月のカレンダーで見る静的サイトです。

## 公開

GitHub の Settings → Pages で、Build and deployment の Source を GitHub Actions にします。公開先は `https://<ユーザー名>.github.io/aomania-oshikatsu/` です。

## 配信の自動取得

リポジトリの Secrets に `YOUTUBE_API_KEY` を追加します。値は Google Cloud で作った YouTube Data API v3 の API キーです。

キーを入れたあと、Actions の `fetch` を手動実行すると取得が始まります。取得結果はサイトへ公開されます。以降は 30 分ごとに動きます。

## メモの保存

メモの追加と削除は、このリポジトリの `public/data/manual.json` に保存されます。サイトを開いただけの人は見るだけです。書き込むブラウザには、次のトークンを一度入れます。

1. GitHub の Settings → Developer settings → Personal access tokens → Fine-grained tokens を開く。
2. Repository access で `S0iRu/aomania-oshikatsu` だけを選ぶ。
3. Permissions の Contents を Read and write にする。
4. 作ったトークンを、サイトで追加または削除を押したときの入力欄に貼る。

トークンはコードにもリポジトリにも置かず、入力したブラウザの中だけに残します。
