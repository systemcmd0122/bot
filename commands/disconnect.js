// ==============================================
// commands/disconnect.js
// /disconnect コマンド
// ==============================================

import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('disconnect')
    .setDescription('ボイスチャンネルからボットを切断します。');

export async function execute(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guildId);

    if (!queue) {
        return interaction.reply({ content: '❌ 現在ボイスチャンネルに接続していません。', ephemeral: true });
    }

    if (interaction.member.voice.channel?.id !== queue.voiceChannel.id) {
        return interaction.reply({
            content: `❌ この操作を行うには <#${queue.voiceChannel.id}> に参加している必要があります。`,
            ephemeral: true
        });
    }

    try {
        await queue.stop();
        return interaction.reply('👋 ボイスチャンネルから切断しました。');
    } catch (err) {
        console.error('[ERROR] /disconnect 実行エラー:', err);
        return interaction.reply({ content: '❌ 切断に失敗しました。', ephemeral: true });
    }
}