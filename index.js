import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client, Collection, GatewayIntentBits, InteractionType } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { fileURLToPath } from 'url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================================
// 環境変数チェック (起動時に即座に検証)
// ==============================================
const token    = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId  = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    console.error('[FATAL] 必須の環境変数が設定されていません:');
    if (!token)    console.error('  - DISCORD_TOKEN');
    if (!clientId) console.error('  - CLIENT_ID');
    if (!guildId)  console.error('  - GUILD_ID');
    process.exit(1);
}

// ==============================================
// Express サーバー (Keep-Alive & ヘルスチェック用)
// ==============================================
const app  = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());

app.get('/', (_req, res) => {
    res.status(200).send('Discord Bot is running!');
});

app.get('/ping', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime())
    });
});

app.get('/health', (_req, res) => {
    const isReady = client.isReady();
    res.status(isReady ? 200 : 503).json({
        status: isReady ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        bot_status: client.ws.status,
        bot_tag: isReady ? client.user.tag : 'not ready'
    });
});

// ==============================================
// Keep-Alive (Koyeb無料枠でスリープを防止)
// ==============================================
function startKeepAlive() {
    const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : null;

    if (!appUrl) {
        console.warn('[Keep-Alive] ⚠ APP_URL が未設定です。スリープ防止機能は無効です。');
        console.warn('[Keep-Alive] .env に APP_URL=https://your-app-name.koyeb.app を設定してください。');
        return;
    }

    const pingUrl = `${appUrl}/ping`;

    const sendPing = async () => {
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 10_000);

        try {
            const res = await fetch(pingUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'DiscordBot-KeepAlive/1.0',
                    'Cache-Control': 'no-cache'
                }
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                console.log(`[Keep-Alive] ✓ ${new Date().toLocaleString('ja-JP')} | Status: ${res.status}`);
            } else {
                console.warn(`[Keep-Alive] ⚠ レスポンスエラー | Status: ${res.status}`);
            }
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                console.error('[Keep-Alive] ✗ タイムアウト (10秒)');
            } else {
                console.error('[Keep-Alive] ✗ エラー:', err.message);
            }
        }
    };

    // 即座に1回送信後、50秒ごとに送信
    // (Koyebの無料枠はリクエストがないとスリープするため短めに設定)
    sendPing();
    setInterval(sendPing, 50_000);

    console.log(`[Keep-Alive] ✓ 有効化 | 送信先: ${pingUrl} | 間隔: 50秒`);
}

// ==============================================
// Discord Client
// ==============================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
    ]
});

client.commands = new Collection();

// ==============================================
// コマンドファイル読み込み (commands/ フォルダ)
// ==============================================
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = await import(`file://${filePath}`);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                console.log(`[INFO] コマンド読み込み完了: /${command.data.name}`);
            } else {
                console.warn(`[WARNING] ${file} に "data" または "execute" がありません。スキップします。`);
            }
        } catch (err) {
            console.error(`[ERROR] コマンド読み込みエラー (${file}):`, err);
        }
    }
} else {
    console.warn('[WARNING] commands/ ディレクトリが見つかりません。');
}

// ==============================================
// ハンドラー読み込み (handlers/ フォルダ)
// ==============================================
let handleButtonInteraction  = null;
let handleCommandInteraction = null;
let handleBanMessage         = null;
let initializeBanList        = null;

const handlersPath = path.join(__dirname, 'handlers');

if (!fs.existsSync(handlersPath)) {
    console.error('[FATAL] handlers/ ディレクトリが見つかりません。');
} else {
    // buttonHandler
    try {
        const mod = await import(`file://${path.join(handlersPath, 'buttonHandler.js')}`);
        handleButtonInteraction = mod.handleButtonInteraction;
        console.log('[INFO] buttonHandler 読み込み完了');
    } catch (err) {
        console.error('[ERROR] buttonHandler 読み込みエラー:', err);
    }

    // commandHandler
    try {
        const mod = await import(`file://${path.join(handlersPath, 'commandHandler.js')}`);
        handleCommandInteraction = mod.handleCommandInteraction;
        console.log('[INFO] commandHandler 読み込み完了');
    } catch (err) {
        console.error('[ERROR] commandHandler 読み込みエラー:', err);
    }

    // banHandler
    try {
        const mod = await import(`file://${path.join(handlersPath, 'banHandler.js')}`);
        handleBanMessage  = mod.handleBanMessage;
        initializeBanList = mod.initializeBanList;
        console.log('[INFO] banHandler 読み込み完了');
    } catch (err) {
        console.error('[ERROR] banHandler 読み込みエラー:', err);
    }
}

// ==============================================
// スラッシュコマンド デプロイ
// ==============================================
async function deployCommands() {
    const commands = [];

    if (!fs.existsSync(commandsPath)) {
        console.warn('[WARNING] commands/ ディレクトリが見つかりません。デプロイをスキップします。');
        return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

    for (const file of commandFiles) {
        try {
            const command = await import(`file://${path.join(commandsPath, file)}`);
            if (command.data) {
                commands.push(command.data.toJSON());
            }
        } catch (err) {
            console.error(`[ERROR] コマンド定義の読み込みエラー (${file}):`, err);
        }
    }

    if (commands.length === 0) {
        console.log('[INFO] デプロイするコマンドがありません。');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log(`[INFO] ${commands.length}個のスラッシュコマンドをデプロイ中...`);
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );
        console.log('[SUCCESS] スラッシュコマンドのデプロイ完了。');
    } catch (err) {
        console.error('[ERROR] スラッシュコマンドのデプロイ失敗:', err);
    }
}

// ==============================================
// Bot Ready イベント
// ==============================================
client.once('ready', async () => {
    console.log('='.repeat(60));
    console.log(`[SUCCESS] ログイン完了: ${client.user.tag}`);
    console.log(`[INFO]    Bot ID: ${client.user.id}`);
    console.log(`[INFO]    参加サーバー数: ${client.guilds.cache.size}`);
    console.log('='.repeat(60));

    // Expressサーバー起動
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[SUCCESS] Webサーバー起動完了 | ポート: ${PORT}`);
        console.log(`[INFO]    ヘルスチェック: /health  Ping: /ping`);
    });

    // スラッシュコマンドをデプロイ
    await deployCommands();

    // BANリスト初期化
    if (initializeBanList) {
        console.log('[INFO] BANリストを初期化中...');
        await initializeBanList(client);
    } else {
        console.warn('[WARNING] initializeBanList が利用できません。banHandler を確認してください。');
    }

    // Keep-Alive 開始
    startKeepAlive();

    console.log('[SUCCESS] ✓ Bot初期化完了。全システム稼働中。');
});

// ==============================================
// インタラクション イベント
// ==============================================
client.on('interactionCreate', async interaction => {
    try {
        // スラッシュコマンド
        if (interaction.type === InteractionType.ApplicationCommand) {
            if (handleCommandInteraction) {
                await handleCommandInteraction(interaction);
            } else {
                console.error('[ERROR] commandHandler が読み込まれていません。');
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'システムエラーが発生しました。管理者に連絡してください。',
                        ephemeral: true
                    });
                }
            }
            return;
        }

        // ボタン
        if (interaction.isButton()) {
            if (handleButtonInteraction) {
                await handleButtonInteraction(interaction);
            } else {
                console.error('[ERROR] buttonHandler が読み込まれていません。');
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'システムエラーが発生しました。管理者に連絡してください。',
                        flags: 64
                    });
                }
            }
            return;
        }

    } catch (err) {
        console.error('[ERROR] インタラクション処理中に予期しないエラー:', err);
        try {
            const errMsg = {
                content: 'エラーが発生しました。しばらく後にもう一度お試しください。',
                flags: 64
            };
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(errMsg);
            } else {
                await interaction.followUp(errMsg);
            }
        } catch (replyErr) {
            console.error('[ERROR] エラー返信にも失敗:', replyErr);
        }
    }
});

// ==============================================
// メッセージ イベント (BANシステム)
// ==============================================
client.on('messageCreate', async message => {
    if (!handleBanMessage) return;
    try {
        await handleBanMessage(message);
    } catch (err) {
        console.error('[ERROR] BANメッセージ処理エラー:', err);
    }
});

// ==============================================
// エラーハンドリング
// ==============================================
client.on('error', err => {
    console.error('[ERROR] Discordクライアントエラー:', err);
});

client.on('warn', msg => {
    console.warn('[WARN] Discord警告:', msg);
});

client.on('shardDisconnect', (event, shardId) => {
    console.warn(`[WARN] Shard ${shardId} が切断されました。自動再接続を待機中...`);
});

client.on('shardReconnecting', shardId => {
    console.log(`[INFO] Shard ${shardId} が再接続中...`);
});

client.on('shardResume', (shardId, replayedEvents) => {
    console.log(`[INFO] Shard ${shardId} 再接続完了。リプレイイベント数: ${replayedEvents}`);
});

process.on('unhandledRejection', err => {
    console.error('[ERROR] 未処理のPromise拒否:', err);
});

process.on('uncaughtException', err => {
    console.error('[ERROR] 未キャッチの例外:', err);
    // Koyebが自動的に再起動するためプロセスを終了
    process.exit(1);
});

process.on('SIGINT', () => {
    console.log('\n[INFO] SIGINT受信。シャットダウン中...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[INFO] SIGTERM受信。シャットダウン中...');
    client.destroy();
    process.exit(0);
});

// ==============================================
// ログイン
// ==============================================
console.log('[INFO] Discordへログイン中...');
client.login(token).catch(err => {
    console.error('[FATAL] Discordログイン失敗:', err);
    process.exit(1);
});