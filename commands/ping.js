import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('ping')
    .setDescription('ボットの応答速度を確認します。');

export async function execute(interaction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });

    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .addFields(
            { name: 'ボットのレイテンシ', value: `\`${latency}ms\``, inline: true },
            { name: 'APIのレイテンシ', value: `\`${apiLatency}ms\``, inline: true }
        )
        .setColor(latency < 200 ? '#28a745' : latency < 500 ? '#ffc107' : '#dc3545')
        .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
}
