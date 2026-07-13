// ==============================================
// commands/resume.js
// /resume コマンド
// ==============================================

import { SlashCommandBuilder } from 'discord.js';
import { refreshNowPlayingPanel } from '../utils/musicUI.js';

export const data = new SlashCommandBuilder()
    .setName('resume')
    .setDescription('一時停止した再生を再開します。');

export async function execute(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guildId);

    if (!queue) {
        return interaction.reply({ content: '❌ 現在何も再生されていません。', ephemeral: true });
    }

    if (interaction.member.voice.channel?.id !== queue.voiceChannel.id) {
        return interaction.reply({
            content: `❌ この操作を行うには <#${queue.voiceChannel.id}> に参加している必要があります。`,
            ephemeral: true
        });
    }

    if (!queue.paused) {
        return interaction.reply({ content: 'ℹ️ 現在一時停止していません。', ephemeral: true });
    }

    try {
        queue.resume();
        await refreshNowPlayingPanel(queue);
        return interaction.reply('▶️ 再生を再開しました。');
    } catch (err) {
        console.error('[ERROR] /resume 実行エラー:', err);
        return interaction.reply({ content: '❌ 再開に失敗しました。', ephemeral: true });
    }
}