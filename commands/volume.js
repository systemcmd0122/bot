// ==============================================
// commands/volume.js
// /volume コマンド
// ==============================================

import { SlashCommandBuilder } from 'discord.js';
import { refreshNowPlayingPanel } from '../utils/musicUI.js';

export const data = new SlashCommandBuilder()
    .setName('volume')
    .setDescription('再生音量を設定します（0〜100）。')
    .addIntegerOption(option =>
        option
            .setName('level')
            .setDescription('音量 (0〜100)')
            .setMinValue(0)
            .setMaxValue(100)
            .setRequired(true)
    );

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

    const level = interaction.options.getInteger('level', true);

    try {
        queue.setVolume(level);
        await refreshNowPlayingPanel(queue);
        return interaction.reply(`🔊 音量を **${level}%** に設定しました。`);
    } catch (err) {
        console.error('[ERROR] /volume 実行エラー:', err);
        return interaction.reply({ content: '❌ 音量の設定に失敗しました。', ephemeral: true });
    }
}