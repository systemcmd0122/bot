import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('announce')
    .setDescription('お知らせをメンション付きEmbedで送信します。')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
        option
            .setName('title')
            .setDescription('お知らせのタイトル')
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName('message')
            .setDescription('お知らせの内容')
            .setRequired(true)
    )
    .addChannelOption(option =>
        option
            .setName('channel')
            .setDescription('送信先チャンネル')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
    )
    .addRoleOption(option =>
        option
            .setName('mention')
            .setDescription('メンションするロール')
    )
    .addStringOption(option =>
        option
            .setName('color')
            .setDescription('色（hex: #ff0000 または名前: red, blue, green, gold）')
    );

const COLOR_MAP = {
    red: 0xdc3545, blue: 0x007bff, green: 0x28a745,
    gold: 0xffc107, purple: 0x6f42c1, orange: 0xfd7e14,
};

function parseColor(input) {
    if (!input) return 0xffc107;
    const lower = input.toLowerCase().trim();
    if (COLOR_MAP[lower] !== undefined) return COLOR_MAP[lower];
    const hex = lower.replace('#', '');
    if (/^[0-9a-f]{6}$/i.test(hex)) return parseInt(hex, 16);
    return 0xffc107;
}

export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const title = interaction.options.getString('title', true);
    const message = interaction.options.getString('message', true);
    const channel = interaction.options.getChannel('channel', true);
    const mentionRole = interaction.options.getRole('mention');
    const color = parseColor(interaction.options.getString('color'));

    const embed = new EmbedBuilder()
        .setTitle(`📢 ${title}`)
        .setDescription(message)
        .setColor(color)
        .setFooter({ text: `${interaction.guild.name} お知らせ` })
        .setTimestamp();

    let content = '';
    if (mentionRole) {
        content = `<@&${mentionRole.id}>`;
    }

    try {
        await channel.send({ content, embeds: [embed] });
        await interaction.editReply(`✅ <#${channel.id}> にお知らせを送信しました。`);
    } catch (err) {
        console.error('[ERROR] announce 送信エラー:', err);
        await interaction.editReply('❌ お知らせの送信に失敗しました。ボットの権限を確認してください。');
    }
}
