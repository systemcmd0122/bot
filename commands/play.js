// ==============================================
// commands/play.js
// /play コマンド
// YouTube・Spotify・SoundCloudのURLまたは検索キーワードを
// ボイスチャンネルで再生（キューに追加）する
//
// 注意: yt-dlpは特定の動画で「エラーも出さず無限にハングする」
// 既知の不具合があるため、withTimeout でタイムアウトを必ず設定している。
// ==============================================

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { toFriendlyErrorMessage, withRetry } from '../utils/musicUI.js';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('YouTube・Spotify・SoundCloudの曲をVCで再生します。')
    .addStringOption(option =>
        option
            .setName('query')
            .setDescription('URL または 検索キーワード')
            .setRequired(true)
    );

export async function execute(interaction) {
    await interaction.deferReply();

    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
        return interaction.editReply({
            content: '❌ 先にボイスチャンネルに参加してください。',
        });
    }

    const botMember = interaction.guild.members.me;
    const permissions = voiceChannel.permissionsFor(botMember);

    if (!permissions?.has(PermissionFlagsBits.Connect) || !permissions?.has(PermissionFlagsBits.Speak)) {
        return interaction.editReply({
            content: '❌ ボイスチャンネルへの「接続」または「発言」権限がありません。',
        });
    }

    // 既に再生中で、別のVCにいる場合は拒否
    const existingQueue = interaction.client.distube.getQueue(interaction.guildId);
    if (existingQueue && existingQueue.voiceChannel.id !== voiceChannel.id) {
        return interaction.editReply({
            content: `❌ ボットは既に <#${existingQueue.voiceChannel.id}> で再生中です。`,
        });
    }

    const query = interaction.options.getString('query', true);

    // 処理が長引いている場合、ユーザーに「まだ動いている」ことが分かるよう
    // 定期的にメッセージを更新する（無音で固まっているように見えるのを防ぐ）
    let elapsedSeconds = 0;
    const progressInterval = setInterval(() => {
        elapsedSeconds += 10;
        interaction
            .editReply(`🔎 \`${query}\` を処理しています…（${elapsedSeconds}秒経過。動画によっては時間がかかる場合があります）`)
            .catch(() => {});
    }, 10_000);

    console.log(`[INFO] /play 開始 | query: ${query} | 実行者: ${interaction.user.tag}`);
    const startedAt = Date.now();

    try {
        await withRetry(() =>
            interaction.client.distube.play(voiceChannel, query, {
                textChannel: interaction.channel,
                member: interaction.member
            })
        );

        clearInterval(progressInterval);
        console.log(`[INFO] /play 完了 | query: ${query} | ${Date.now() - startedAt}ms`);
        await interaction.editReply(`✅ \`${query}\` の処理が完了しました。`).catch(() => {});
    } catch (err) {
        clearInterval(progressInterval);
        console.error(`[ERROR] /play 実行エラー | query: ${query} | ${Date.now() - startedAt}ms:`, err);
        await interaction.editReply(toFriendlyErrorMessage(err)).catch(() => {});
    }
}