import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import googleIt from 'google-it';

export const data = new SlashCommandBuilder()
    .setName('search')
    .setDescription('ウェブ検索を行います。')
    .addStringOption(option =>
        option.setName('query')
            .setDescription('検索キーワード')
            .setRequired(true));

export async function execute(interaction) {
    const query = interaction.options.getString('query');

    await interaction.deferReply();

    try {
        const results = await googleIt({ query: query, limit: 5 });

        if (!results || results.length === 0) {
            return await interaction.editReply('検索結果が見つかりませんでした。');
        }

        const embed = new EmbedBuilder()
            .setTitle(`🔍 検索結果: ${query}`)
            .setColor('#4285F4')
            .setTimestamp()
            .setFooter({ text: 'Google Search via google-it' });

        results.forEach((result, index) => {
            const title = result.title || 'タイトルなし';
            const link = result.link || '';
            const snippet = result.snippet || '説明なし';

            embed.addFields({
                name: `${index + 1}. ${title}`,
                value: `[リンクはこちら](${link})\n${snippet}`
            });
        });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('[ERROR] Search command error:', error);
        await interaction.editReply('検索中にエラーが発生しました。');
    }
}
