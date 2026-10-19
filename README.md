# 小柳ロウ 配信スケジュール

YouTube の配信枠を 30 分ごとに取得し、週・月のカレンダーで見る静的サイトです。

## 公開

GitHub の Settings → Pages で、Build and deployment の Source を GitHub Actions にします。公開先は `https://<ユーザー名>.github.io/aomania-oshikatsu/` です。

## 配信の自動取得

リポジトリの Secrets に `YOUTUBE_API_KEY` を追加します。値は Google Cloud で作った YouTube Data API v3 の API キーです。キーが無いあいだは、同梱のサンプルデータで画面を確認できます。

キーを入れたあと、Actions の `fetch` を手動実行すると取得が始まります。以降は 30 分ごとに動きます。
