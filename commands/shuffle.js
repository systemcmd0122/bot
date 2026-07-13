// ==============================================
// commands/shuffle.js
// /shuffle コマンド
// ==============================================

import { SlashCommandBuilder } from 'discord.js';
import { refreshNowPlayingPanel } from '../utils/musicUI.js';

export const data = new SlashCommandBuilder()
    .setName('shuffle')
    .setDescription('現在のキューをシャッフルします。');

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

    if (queue.songs.length <= 2) {
        return interaction.reply({ content: 'ℹ️ シャッフルするには曲が足りません。', ephemeral: true });
    }

    try {
        await queue.shuffle();
        await refreshNowPlayingPanel(queue);
        return interaction.reply('🔀 キューをシャッフルしました。');
    } catch (err) {
        console.error('[ERROR] /shuffle 実行エラー:', err);
        return interaction.reply({ content: '❌ シャッフルに失敗しました。', ephemeral: true });
    }
}