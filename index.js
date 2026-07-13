import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, Collection, GatewayIntentBits, InteractionType } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { fileURLToPath } from 'url';
import express from 'express';
import { DisTube } from 'distube';
import { YtDlpPlugin } from '@distube/yt-dlp';
import { SpotifyPlugin } from '@distube/spotify';
import { SoundCloudPlugin } from '@distube/soundcloud';
import ffmpegPath from 'ffmpeg-static';
import { buildNowPlayingEmbed, buildNowPlayingComponents, buildDisabledComponents, refreshNowPlayingPanel, toFriendlyErrorMessage } from './utils/musicUI.js';
import { isMusicButton, handleMusicButtonInteraction } from './handlers/musicButtonHandler.js';
import { execSync } from 'node:child_process';

// ==============================================
// ffmpeg パス解決
// システムffmpegを優先使用（ffmpeg-staticは古い場合がある）
// ==============================================
function resolveFfmpegPath() {
    // 1. 環境変数で指定があれば最優先
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        console.log(`[INFO] 環境変数のffmpegを使用: ${process.env.FFMPEG_PATH}`);
        return process.env.FFMPEG_PATH;
    }
    // 2. システムffmpegを検索 (Windows: where / Linux・macOS: which)
    try {
        const findCmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
        const sysFfmpeg = execSync(findCmd, { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0].trim();
        if (sysFfmpeg && fs.existsSync(sysFfmpeg)) {
            console.log(`[INFO] システムffmpegを使用: ${sysFfmpeg}`);
            return sysFfmpeg;
        }
    } catch {}
    // 3. フォールバック: ffmpeg-static
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
        console.log(`[INFO] ffmpeg-staticを使用: ${ffmpegPath}`);
        return ffmpegPath;
    }
    console.warn('[WARNING] ffmpegが見つかりません。音声再生に問題が発生する可能性があります。');
    return 'ffmpeg';
}
const resolvedFfmpegPath = resolveFfmpegPath();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==============================================
// Deno PATH設定 (yt-dlpのn-challenge解決に必須)
// yt-dlpは子プロセスでDenoを探し出すため、
// 親プロセスのPATHにDenoのパスを含める必要がある
// (Windows: %USERPROFILE%\.deno\bin / Linux・macOS: $HOME/.deno/bin)
// ==============================================
const denoBinPath = path.join(os.homedir(), '.deno', 'bin');
const pathSeparator = process.platform === 'win32' ? ';' : ':';
if (!process.env.PATH.includes(denoBinPath)) {
    process.env.PATH = `${denoBinPath}${pathSeparator}${process.env.PATH}`;
    console.log(`[INFO] DenoをPATHに追加: ${denoBinPath}`);
}

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
        GatewayIntentBits.GuildVoiceStates, // VC再生に必須
    ]
});

client.commands = new Collection();

// ==============================================
// DisTube (音楽再生システム) セットアップ
// YouTube / Spotify / SoundCloud に対応
// Spotifyは直接オーディオを取得できないため、
// トラック情報を解決して同名曲をYouTube上で検索・再生する
// ==============================================

// yt-dlp設定ファイルの存在チェック
// Windows: %APPDATA%\yt-dlp\config / Linux・macOS: ~/.config/yt-dlp/config
const ytdlpConfigPath = process.platform === 'win32'
    ? path.join(process.env.APPDATA || '', 'yt-dlp', 'config')
    : path.join(os.homedir(), '.config', 'yt-dlp', 'config');
if (fs.existsSync(ytdlpConfigPath)) {
    console.log(`[INFO] yt-dlp設定ファイルを検出: ${ytdlpConfigPath}`);
} else {
    console.warn('[WARNING] yt-dlp設定ファイルが見つかりません。YouTube再生が不安定になる可能性があります。');
    console.warn(`[WARNING] 作成先: ${ytdlpConfigPath}`);
}

// Deno (yt-dlpのn-challenge解決に必須) の存在チェック
try {
    const denoExeName = process.platform === 'win32' ? 'deno.exe' : 'deno';
    const denoExe = path.join(os.homedir(), '.deno', 'bin', denoExeName);
    const denoVersion = execSync(`"${denoExe}" --version`, { encoding: 'utf-8', timeout: 5000 }).split('\n')[0];
    console.log(`[INFO] Deno検出: ${denoVersion}（YouTube n-challenge解決に使用）`);
} catch {
    console.warn('[WARNING] Denoが見つかりません。YouTube再生が大幅に遅くなる可能性があります。');
    console.warn('[WARNING] インストール: irm https://deno.land/install.ps1 | iex');
    console.warn('[WARNING] 参照: https://github.com/yt-dlp/yt-dlp/wiki/EJS');
}

// ==============================================
// 実際にBotが使用するyt-dlpバイナリのバージョンをログ出力
// (.env の YTDLP_DIR / YTDLP_FILENAME で system yt-dlp を指すよう
//  設定している場合、その実体を明示的に確認するための診断ログ)
// ==============================================
try {
    if (process.env.YTDLP_DISABLE_DOWNLOAD === 'true' && process.env.YTDLP_DIR) {
        const defaultYtdlpName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
        const usedYtdlp = path.join(process.env.YTDLP_DIR, process.env.YTDLP_FILENAME || defaultYtdlpName);
        if (fs.existsSync(usedYtdlp)) {
            const ver = execSync(`"${usedYtdlp}" --version`, { encoding: 'utf-8', timeout: 5000 }).trim();
            console.log(`[INFO] Bot実行時のyt-dlp: ${usedYtdlp} (v${ver})`);
        } else {
            console.warn(`[WARNING] YTDLP_DIR/YTDLP_FILENAME で指定されたyt-dlpが見つかりません: ${usedYtdlp}`);
        }
    } else {
        console.log('[INFO] yt-dlpはプラグイン管理のバイナリを使用します（YTDLP_DISABLE_DOWNLOAD未設定）。');
    }
} catch (err) {
    console.warn('[WARNING] yt-dlpバージョン確認に失敗:', err.message);
}

const distube = new DisTube(client, {
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false,
    savePreviousSongs: true,
    nsfw: false,
    joinNewVoiceChannel: true,
    ffmpeg: {
        path: resolvedFfmpegPath,
        args: {
            // 入力ストリームへの接続が途切れても自動で再接続を試みる。
            // 特にreconnect_streamedはシーク不可なHTTPストリーム(googlevideo等)で
            // 必須のオプション。これが無いと接続瞬断時にffmpegがそのままクラッシュする。
            input: {
                reconnect: '1',
                reconnect_streamed: '1',
                reconnect_on_network_error: '1',
                reconnect_delay_max: '5'
            }
        }
    },
    plugins: [
        new SpotifyPlugin(
            process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
                ? {
                      api: {
                          clientId: process.env.SPOTIFY_CLIENT_ID,
                          clientSecret: process.env.SPOTIFY_CLIENT_SECRET
                      }
                  }
                : undefined
        ),
        new SoundCloudPlugin(),
        new YtDlpPlugin({
            // .env で YTDLP_DISABLE_DOWNLOAD=true を設定している場合、
            // プラグインは自前でバイナリを管理せず、
            // YTDLP_DIR / YTDLP_FILENAME で指定した既存のyt-dlpをそのまま使う。
            // これにより `pip install -U yt-dlp` で更新したバージョンと、
            // Botが実際に使うバージョンを一致させる。
            update: process.env.YTDLP_DISABLE_DOWNLOAD === 'true' ? false : true,
            ytdlpOptions: {
                // opus/webm(itag=251等)のデコードで特定動画がクラッシュする事例があるため、
                // より枯れているAAC(m4a)系フォーマットを優先的に選択する。
                format: 'bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio'
            }
        })
    ]
});

client.distube = distube;

// ==============================================
// 再生パネルの自動更新（リアルタイム性向上）
// 曲の再生中、数秒おきにプログレスバー等を再描画する。
// ボタン/コマンド操作による即時更新とは独立して動く保険的な仕組みで、
// 万一取りこぼしても次のtickで自然に追いつく。
// ==============================================
const NOW_PLAYING_REFRESH_MS = 10_000;
const nowPlayingIntervals = new Map(); // guildId -> IntervalID

function getGuildIdFromQueue(queue) {
    return queue?.textChannel?.guild?.id ?? queue?.voiceChannel?.guild?.id ?? null;
}

function stopNowPlayingInterval(guildId) {
    if (!guildId) return;
    const timer = nowPlayingIntervals.get(guildId);
    if (timer) {
        clearInterval(timer);
        nowPlayingIntervals.delete(guildId);
    }
}

function startNowPlayingInterval(queue) {
    const guildId = getGuildIdFromQueue(queue);
    if (!guildId) return;

    // 曲が変わるたびに古いタイマーは必ず止めてから新しく張り直す（二重更新防止）
    stopNowPlayingInterval(guildId);

    const timer = setInterval(async () => {
        // キューが既に破棄されている、または一時停止中は何もしない
        // (一時停止中に更新すると表示上の時間だけが進んでしまうため)
        if (!queue || queue.stopped || !queue.songs?.length || queue.paused) return;
        await refreshNowPlayingPanel(queue);
    }, NOW_PLAYING_REFRESH_MS);

    nowPlayingIntervals.set(guildId, timer);
}

distube.on('playSong', async (queue, song) => {
    const embed = buildNowPlayingEmbed(queue, song);
    const components = buildNowPlayingComponents(queue);

    // 直前のパネルが残っていれば、誤操作防止のためボタンを無効化しておく
    if (queue.nowPlayingMessage) {
        await queue.nowPlayingMessage.edit({ components: buildDisabledComponents(components) }).catch(() => {});
    }

    const sent = await queue.textChannel?.send({ embeds: [embed], components }).catch(() => null);
    queue.nowPlayingMessage = sent ?? null;

    startNowPlayingInterval(queue);
});

distube.on('addSong', (queue, song) => {
    queue.textChannel?.send(`✅ キューに追加しました: **${song.name}** - \`${song.formattedDuration}\``).catch(() => {});
});

distube.on('addList', (queue, playlist) => {
    queue.textChannel?.send(`✅ プレイリスト **${playlist.name}** (${playlist.songs.length}曲) をキューに追加しました。`).catch(() => {});
});

distube.on('finish', async queue => {
    stopNowPlayingInterval(getGuildIdFromQueue(queue));
    if (queue.nowPlayingMessage) {
        await queue.nowPlayingMessage.edit({ components: buildDisabledComponents(buildNowPlayingComponents(queue)) }).catch(() => {});
    }
    queue.textChannel?.send('🏁 キューの再生が終了しました。').catch(() => {});
});

distube.on('empty', queue => {
    stopNowPlayingInterval(getGuildIdFromQueue(queue));
    queue.textChannel?.send('👋 ボイスチャンネルに誰もいなくなったため退出します。').catch(() => {});
});

distube.on('disconnect', queue => {
    stopNowPlayingInterval(getGuildIdFromQueue(queue));
    queue.textChannel?.send('🔌 ボイスチャンネルから切断しました。').catch(() => {});
});

// ==============================================
// 再生エラー処理
// FFMPEG_EXITEDのような一過性の可能性があるクラッシュは、
// いきなり諦めずに同じ曲を1回だけ自動リトライしてから、
// それでもダメな場合のみ次の曲へスキップする。
// (同一曲の連続リトライ回数はメモリ上のMapで管理)
// ==============================================
const retryCounts = new Map();
const MAX_RETRIES = 1;

distube.on('error', async (error, queue, song) => {
    console.error('[ERROR] DisTube エラー:', error);

    const channel = queue?.textChannel;
    if (!channel) return;

    const friendlyMessage = toFriendlyErrorMessage(error);
    const failedSongLabel = song?.name ? `**${song.name}**\n` : '';

    const songKey = song?.id ?? song?.url;
    const isRetryableCrash = error?.errorCode === 'FFMPEG_EXITED';
    const currentRetries = songKey ? (retryCounts.get(songKey) ?? 0) : MAX_RETRIES;

    if (isRetryableCrash && songKey && currentRetries < MAX_RETRIES && queue?.voiceChannel) {
        retryCounts.set(songKey, currentRetries + 1);
        channel.send(`${failedSongLabel}⚠️ 再生中に問題が発生しました。もう一度だけ自動で再試行します…`).catch(() => {});

        try {
            await distube.play(queue.voiceChannel, song, {
                textChannel: queue.textChannel,
                member: song.member
            });
            return;
        } catch (retryErr) {
            console.error('[ERROR] リトライも失敗:', retryErr);
            // リトライも失敗した場合は下の通常のスキップ処理へフォールスルー
        }
    }

    if (songKey) retryCounts.delete(songKey);

    if (queue && queue.songs.length > 1) {
        channel.send(`${failedSongLabel}${friendlyMessage}\n➡️ 次の曲へ自動的にスキップします。`).catch(() => {});
        queue.skip().catch(skipErr => {
            console.error('[ERROR] 自動スキップに失敗:', skipErr);
        });
    } else {
        stopNowPlayingInterval(getGuildIdFromQueue(queue));
        channel.send(`${failedSongLabel}${friendlyMessage}`).catch(() => {});
    }
});

distube.on('searchNoResult', (message, query) => {
    const channel = message?.channel ?? message;
    if (channel?.send) {
        channel.send(`🔍 \`${query}\` に一致する結果が見つかりませんでした。`).catch(() => {});
    }
});

// 詳細ログ（既定では無効）。.env に DEBUG_MUSIC=true を設定すると、
// yt-dlp/ffmpegの内部動作をコンソールに出力し、再生が固まる原因の切り分けに使える。
if (process.env.DEBUG_MUSIC === 'true') {
    distube.on('debug', message => console.log('[DISTUBE DEBUG]', message));
    distube.on('ffmpegDebug', message => console.log('[FFMPEG DEBUG]', message));
}

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

    // DAVE / 音声関連の依存関係チェック
    try {
        const davey = await import('@snazzah/davey').catch(() => null);
        if (davey) {
            console.log(`[INFO]    @snazzah/davey: v${davey.DAVE_PROTOCOL_VERSION ?? 'unknown'}`);
        } else {
            console.warn('[WARNING] @snazzah/davey が見つかりません。DAVE暗号化が無効です。');
        }
    } catch (e) {
        console.warn('[WARNING] @snazzah/davey import error:', e.message);
    }
    try {
        await import('@discordjs/opus');
        console.log('[INFO]    @discordjs/opus: OK (native)');
    } catch {
        try {
            await import('opusscript');
            console.log('[INFO]    opusscript: OK (fallback)');
        } catch {
            console.warn('[WARNING] Opusエンコーダーが見つかりません。');
        }
    }
    try {
        const sodium = await import('libsodium-wrappers');
        await sodium.ready;
        console.log('[INFO]    libsodium-wrappers: OK');
    } catch (e) {
        console.warn('[WARNING] libsodium-wrappers error:', e.message);
    }

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
            // 音楽再生パネルのボタン（customId: "music_..."）は専用ハンドラで処理する。
            // 認証ボタン等、既存のボタンとはcustomIdのプレフィックスで完全に分離されている。
            if (isMusicButton(interaction.customId)) {
                await handleMusicButtonInteraction(interaction);
                return;
            }

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

// ==============================================
// ボイス接続デバッグ (VOICE_CONNECT_FAILED 診断用)
// ==============================================
client.on('raw', packet => {
    if (packet.t === 'VOICE_STATE_UPDATE') {
        if (packet.d.user_id === client.user.id) {
            console.log(`[VOICE] VOICE_STATE_UPDATE | channel: ${packet.d.channel_id ?? 'null (disconnect)'} | session: ${packet.d.session_id}`);
        }
    }
    if (packet.t === 'VOICE_SERVER_UPDATE') {
        console.log(`[VOICE] VOICE_SERVER_UPDATE | guild: ${packet.d.guild_id} | endpoint: ${packet.d.endpoint}`);
    }
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