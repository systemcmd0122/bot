// ==============================================
// utils/musicUI.js
// 音楽再生パネル（Embed + 操作ボタン）の共通ビルダー
// index.js / commands / handlers から共有して使用する
// ==============================================

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const REPEAT_MODE_LABEL = {
    0: 'オフ',
    1: '1曲リピート',
    2: 'キューリピート'
};

export const REPEAT_MODE_EMOJI = {
    0: '🔁',
    1: '🔂',
    2: '🔁'
};

/**
 * 再生位置のプログレスバー文字列を作成する（/nowplaying と再生パネルで共用）
 */
export function buildProgressBar(queue, barLength = 20) {
    const progress = queue.duration > 0 ? Math.min(queue.currentTime / queue.duration, 1) : 0;
    const filledLength = Math.round(barLength * progress);
    return '▬'.repeat(filledLength) + '🔵' + '▬'.repeat(Math.max(barLength - filledLength, 0));
}

/**
 * 再生中Embedを作成する
 */
export function buildNowPlayingEmbed(queue, song) {
    const s = song ?? queue.songs[0];
    const bar = buildProgressBar(queue);

    return new EmbedBuilder()
        .setColor(queue.paused ? '#F1C40F' : '#1DB954')
        .setTitle(queue.paused ? '⏸️ 一時停止中' : '🎶 再生中')
        .setDescription(`[${s.name}](${s.url})`)
        .addFields(
            { name: '再生位置', value: `${bar}\n${queue.formattedCurrentTime} / ${s.formattedDuration}` },
            { name: 'リクエスト', value: `${s.user ?? '不明'}`, inline: true },
            { name: '音量', value: `${queue.volume}%`, inline: true },
            { name: 'リピート', value: `${REPEAT_MODE_EMOJI[queue.repeatMode]} ${REPEAT_MODE_LABEL[queue.repeatMode]}`, inline: true },
            { name: '次の曲数', value: `${Math.max(queue.songs.length - 1, 0)}曲`, inline: true }
        )
        .setThumbnail(s.thumbnail ?? null)
        .setFooter({ text: '下のボタンから操作できます | 数秒ごとに自動更新' })
        .setTimestamp();
}

/**
 * 再生パネル（Embed + ボタン）を最新の状態に更新する共通関数。
 * コマンド・ボタン・自動更新タイマーのいずれからも同じロジックで呼び出す。
 * queue.nowPlayingMessage が存在しない、またはキューが空の場合は何もしない。
 */
export async function refreshNowPlayingPanel(queue) {
    if (!queue?.nowPlayingMessage || !queue.songs?.length) return;

    const embed = buildNowPlayingEmbed(queue, queue.songs[0]);
    const components = buildNowPlayingComponents(queue);

    await queue.nowPlayingMessage.edit({ embeds: [embed], components }).catch(() => {});
}

/**
 * 再生中Embedに付与する操作ボタン（2行）を作成する
 */
export function buildNowPlayingComponents(queue) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_pauseresume')
            .setLabel(queue.paused ? '再開' : '一時停止')
            .setEmoji(queue.paused ? '▶️' : '⏸️')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('music_skip')
            .setLabel('スキップ')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('music_stop')
            .setLabel('停止')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('music_shuffle')
            .setLabel('シャッフル')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(queue.songs.length <= 2),
        new ButtonBuilder()
            .setCustomId('music_loop')
            .setLabel(REPEAT_MODE_LABEL[queue.repeatMode])
            .setEmoji('🔁')
            .setStyle(queue.repeatMode !== 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_voldown')
            .setLabel('音量 -10')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(queue.volume <= 0),
        new ButtonBuilder()
            .setCustomId('music_volup')
            .setLabel('音量 +10')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(queue.volume >= 100),
        new ButtonBuilder()
            .setCustomId('music_queue')
            .setLabel('キュー表示')
            .setEmoji('📜')
            .setStyle(ButtonStyle.Secondary)
    );

    return [row1, row2];
}

/**
 * 曲が終了・停止した後にパネルを無効化する（誤操作防止）
 */
export function buildDisabledComponents(components) {
    return components.map(row => {
        const newRow = ActionRowBuilder.from(row);
        newRow.components.forEach(btn => btn.setDisabled(true));
        return newRow;
    });
}

/**
 * キュー表示用Embed（/queue コマンド・📜ボタン共通）
 */
export function buildQueueEmbed(queue) {
    const songList = queue.songs
        .slice(0, 15)
        .map((song, index) => {
            const prefix = index === 0 ? '▶️ **再生中**' : `${index}.`;
            return `${prefix} [${song.name}](${song.url}) - \`${song.formattedDuration}\``;
        })
        .join('\n');

    const remaining = queue.songs.length > 15 ? `\n…他 ${queue.songs.length - 15} 曲` : '';

    return new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('🎵 現在のキュー')
        .setDescription(songList + remaining)
        .addFields(
            { name: '曲数', value: `${queue.songs.length}曲`, inline: true },
            { name: '音量', value: `${queue.volume}%`, inline: true },
            { name: 'リピート', value: REPEAT_MODE_LABEL[queue.repeatMode], inline: true },
            { name: '状態', value: queue.paused ? '一時停止中' : '再生中', inline: true }
        );
}

/**
 * DisTubeのエラーコードを分かりやすい日本語メッセージに変換する
 */
const ERROR_MESSAGE_MAP = {
    NO_RESULT: '🔍 一致する曲が見つかりませんでした。キーワードやURLを確認してください。',
    UNAVAILABLE_VIDEO: '🚫 その動画は非公開・削除済み、または地域制限により再生できません。',
    UNPLAYABLE_FORMATS: '🚫 再生可能な音声フォーマットが見つかりませんでした。別の曲でお試しください。',
    NON_NSFW: '🔞 年齢制限のある動画のため、このチャンネルでは再生できません。',
    NOT_SUPPORTED_URL: '🚫 サポートされていないURLです。',
    NOT_SUPPORTED_SONG: '🚫 サポートされていない曲・ソースです。',
    NO_VALID_SONG: '🚫 有効な曲が見つかりませんでした。',
    CANNOT_RESOLVE_SONG: '⚠️ 曲情報を取得できませんでした。もう一度お試しください。',
    CANNOT_GET_STREAM_URL: '⚠️ 音声データを取得できませんでした。時間を置いて再度お試しください。',
    CANNOT_GET_SEARCH_QUERY: '⚠️ 検索クエリを生成できませんでした。',
    EMPTY_PLAYLIST: '📭 プレイリストが空です。',
    EMPTY_FILTERED_PLAYLIST: '📭 再生可能な曲がプレイリスト内に見つかりませんでした。',
    VOICE_FULL: '🚫 ボイスチャンネルの人数上限に達しています。',
    VOICE_MISSING_PERMS: '🚫 ボイスチャンネルへの「接続」または「発言」権限がありません。',
    VOICE_CONNECT_FAILED: '⚠️ ボイスチャンネルへの接続に失敗しました。もう一度お試しください。',
    VOICE_RECONNECT_FAILED: '⚠️ ボイスチャンネルへの再接続に失敗しました。',
    FFMPEG_EXITED: '⚠️ 音声処理中に問題が発生しました。もう一度お試しください。',
    FFMPEG_NOT_INSTALLED: '⚠️ サーバー側の音声処理コンポーネントに問題があります。管理者に連絡してください。',
    TIMEOUT: '⏱️ 動画情報の取得がタイムアウトしました（yt-dlpが応答を返しませんでした）。\nバックグラウンドの処理は続いているため、このまま再生が始まる場合もあります。始まらない場合は、もう一度お試しいただくか、別の動画・キーワードでお試しください。'
};

export function toFriendlyErrorMessage(err) {
    const code = err?.errorCode ?? err?.code;
    if (code && ERROR_MESSAGE_MAP[code]) return ERROR_MESSAGE_MAP[code];
    return '❌ 再生中に予期しないエラーが発生しました。URLやキーワードを変えて再度お試しください。';
}

/**
 * yt-dlpは特定の動画で「エラーも出さず無限にハングする」既知の不具合があるため、
 * 一定時間で必ず決着させるタイムアウトラッパー。
 * デフォルト60秒（環境変数 PLAY_TIMEOUT_MS で変更可能）。
 */
export function withTimeout(promise, ms = Number(process.env.PLAY_TIMEOUT_MS) || 60000) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(`処理が ${ms}ms 以内に完了しませんでした（タイムアウト）`);
            err.errorCode = 'TIMEOUT';
            reject(err);
        }, ms);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * タイムアウト付きで関数を実行し、失敗時に自動リトライする。
 * YouTubeのSABR/ボット検出による一時的な失敗を回復させるため。
 * @param {() => Promise<any>} fn - 実行する関数（遅延評価）
 * @param {object} options
 * @param {number} options.timeoutMs - タイムアウト時間（デフォルト60秒）
 * @param {number} options.retryDelayMs - リトライ間隔（デフォルト5秒）
 * @param {number} options.maxRetries - 最大リトライ回数（デフォルト1回）
 * @returns {Promise<any>}
 */
export async function withRetry(fn, {
    timeoutMs = Number(process.env.PLAY_TIMEOUT_MS) || 60000,
    retryDelayMs = 5000,
    maxRetries = 1
} = {}) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await withTimeout(fn(), timeoutMs);
        } catch (err) {
            lastError = err;
            if (err.errorCode === 'TIMEOUT' && attempt < maxRetries) {
                console.warn(`[RETRY] タイムアウト発生。${retryDelayMs / 1000}秒後にリトライします（試行 ${attempt + 1}/${maxRetries + 1}）`);
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            } else {
                throw err;
            }
        }
    }
    throw lastError;
}