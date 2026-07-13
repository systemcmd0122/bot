// ==============================================
// commands/nowplaying.js
// /nowplaying コマンド
// ==============================================

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { buildProgressBar } from '../utils/musicUI.js';

export const data = new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('現在再生中の曲の情報を表示します。');

export async function execute(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guildId);

    if (!queue) {
        return interaction.reply({ content: '❌ 現在何も再生されていません。', ephemeral: true });
    }

    const song = queue.songs[0];
    const bar = buildProgressBar(queue);

    const embed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('🎶 現在再生中')
        .setDescription(`[${song.name}](${song.url})`)
        .addFields(
            { name: '再生位置', value: `${bar}\n${queue.formattedCurrentTime} / ${song.formattedDuration}` },
            { name: 'リクエスト', value: `${song.user ?? '不明'}`, inline: true },
            { name: '音量', value: `${queue.volume}%`, inline: true }
        )
        .setThumbnail(song.thumbnail ?? null);

    return interaction.reply({ embeds: [embed] });
}