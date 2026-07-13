// ==============================================
// commands/queue.js
// /queue コマンド
// ==============================================

import { SlashCommandBuilder } from 'discord.js';
import { buildQueueEmbed } from '../utils/musicUI.js';

export const data = new SlashCommandBuilder()
    .setName('queue')
    .setDescription('現在の再生キューを表示します。');

export async function execute(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guildId);

    if (!queue) {
        return interaction.reply({ content: '❌ 現在何も再生されていません。', ephemeral: true });
    }

    return interaction.reply({ embeds: [buildQueueEmbed(queue)] });
}