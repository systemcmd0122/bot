// ==============================================
// commands/stop.js
// /stop コマンド
// ==============================================

import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('stop')
    .setDescription('再生を停止し、キューをクリアしてボットを退出させます。');

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

    try {
        await queue.stop();
        return interaction.reply('⏹️ 再生を停止し、キューをクリアしました。');
    } catch (err) {
        console.error('[ERROR] /stop 実行エラー:', err);
        return interaction.reply({ content: '❌ 停止に失敗しました。', ephemeral: true });
    }
}