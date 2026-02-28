# Hinansaba Discord Bot

このボットは避難鯖（Hinansaba）向けのDiscordボットです。認証システム、BAN管理、統計表示、ウェブ検索などの機能を備えています。

## 🚀 特徴

- **認証システム**: ユーザーがボタンを押して申請し、管理者が承認することでロールを付与します。
- **BAN管理**: 特定のチャンネルにユーザーIDを投稿するだけでBANが可能。解除も簡単です。
- **ウェブ検索**: `/search` コマンドでGoogle検索結果を表示します。
- **統計情報**: `/stats` コマンドでボットの稼働状況を確認できます。
- **自動復旧**: ログイン失敗時のリトライ機能を搭載。
- **24/7 稼働**: Koyebなどのプラットフォームでスリープを防ぐためのKeep-alive機能を内蔵。

## 🛠 セットアップ

### 必要条件

- Node.js 22 以上
- Discord Bot トークン
- Discord アプリケーション ID

### インストール

1. リポジトリをクローンまたはダウンロードします。
2. 依存関係をインストールします。
   ```bash
   npm install
   ```
3. `.env.example` を `.env` にコピーし、必要な項目を記入します。
   ```bash
   cp .env.example .env
   ```

### 環境変数の設定

| 変数名 | 説明 |
| :--- | :--- |
| `DISCORD_TOKEN` | Discordボットのトークン |
| `CLIENT_ID` | ボットのアプリケーションID |
| `GUILD_ID` | ボットを導入するサーバーのID |
| `VERIFICATION_CHANNEL_ID` | `/setup-verify` を実行する認証チャンネルID |
| `MODERATION_CHANNEL_ID` | 管理者が認証申請を承認/拒否するチャンネルID |
| `BAN_CHANNEL_ID` | BAN管理を行うチャンネルID |
| `ADMIN_ROLE_ID` | 管理操作（承認やBAN）が可能なロールID |
| `VERIFIED_ROLE_ID` | 認証後に付与されるロールID |
| `APP_URL` | (オプション) Koyeb等のURL (例: `https://app-name.koyeb.app`) |

### コマンドの登録

スラッシュコマンドをDiscordに登録するには以下のコマンドを実行します。
```bash
npm run deploy
```

### ボットの起動

```bash
npm start
```

## 🌐 Koyeb へのデプロイ

このボットは **Dockerを使わずに** Koyebにデプロイ可能です。

1. Koyebで新しいサービスを作成し、GitHubリポジトリを選択します。
2. Buildpackを使用してデプロイするように設定します。
3. インスタンスタイプを選択し、環境変数をすべて設定します。
4. ポート `8080` を公開するように設定します（Health Check用）。
5. `APP_URL` に Koyeb から割り当てられた URL を設定すると、Keep-alive機能が有効になります。

## 📄 ライセンス

ISC License
