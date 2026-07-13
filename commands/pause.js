// ==============================================
// commands/pause.js
// /pause コマンド
// ==============================================

import { SlashCommandBuilder } from 'discord.js';
import { refreshNowPlayingPanel } from '../utils/musicUI.js';

export const data = new SlashCommandBuilder()
    .setName('pause')
    .setDescription('現在の再生を一時停止します。');

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

    if (queue.paused) {
        return interaction.reply({ content: 'ℹ️ 既に一時停止中です。', ephemeral: true });
    }

    try {
        queue.pause();
        await refreshNowPlayingPanel(queue);
        return interaction.reply('⏸️ 再生を一時停止しました。');
    } catch (err) {
        console.error('[ERROR] /pause 実行エラー:', err);
        return interaction.reply({ content: '❌ 一時停止に失敗しました。', ephemeral: true });
    }
}