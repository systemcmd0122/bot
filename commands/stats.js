import { SlashCommandBuilder, EmbedBuilder, version as djsVersion } from 'discord.js';
import os from 'node:os';

export const data = new SlashCommandBuilder()
    .setName('stats')
    .setDescription('ボットの統計情報を表示します。');

export async function execute(interaction) {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor(uptime / 3600) % 24;
    const minutes = Math.floor(uptime / 60) % 60;
    const seconds = Math.floor(uptime % 60);

    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;

    const embed = new EmbedBuilder()
        .setTitle('📊 ボット統計情報')
        .addFields(
            { name: '稼働時間', value: `\`${days}日 ${hours}時間 ${minutes}分 ${seconds}秒\``, inline: false },
            { name: 'メモリ使用量', value: `\`${memoryUsage.toFixed(2)} MB\``, inline: true },
            { name: 'discord.js バージョン', value: `\`v${djsVersion}\``, inline: true },
            { name: 'Node.js バージョン', value: `\`${process.version}\``, inline: true },
            { name: 'プラットフォーム', value: `\`${os.platform()} ${os.arch()}\``, inline: true },
            { name: 'サーバー数', value: `\`${interaction.client.guilds.cache.size}\``, inline: true }
        )
        .setColor('#0099ff')
        .setTimestamp()
        .setFooter({ text: 'Bot Statistics' });

    await interaction.reply({ embeds: [embed] });
}
