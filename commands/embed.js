import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('embed')
    .setDescription('カスタムEmbedメッセージを作成・送信します。')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(option =>
        option
            .setName('title')
            .setDescription('Embedのタイトル')
            .setRequired(true)
    )
    .addStringOption(option =>
        option
            .setName('description')
            .setDescription('Embedの本文')
            .setRequired(true)
    )
    .addChannelOption(option =>
        option
            .setName('channel')
            .setDescription('送信先チャンネル（未指定ならこのチャンネル）')
            .addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption(option =>
        option
            .setName('color')
            .setDescription('色（hex: #ff0000 または名前: red, blue, green, gold, purple）')
    )
    .addStringOption(option =>
        option
            .setName('footer')
            .setDescription('フッターテキスト')
    )
    .addStringOption(option =>
        option
            .setName('image')
            .setDescription('画像URL')
    )
    .addStringOption(option =>
        option
            .setName('thumbnail')
            .setDescription('サムネイルURL')
    );

const COLOR_MAP = {
    red: 0xdc3545,
    blue: 0x007bff,
    green: 0x28a745,
    gold: 0xffc107,
    purple: 0x6f42c1,
    orange: 0xfd7e14,
    pink: 0xe83e8c,
    white: 0xffffff,
    grey: 0x6c757d,
    gray: 0x6c757d,
    black: 0x000000,
    navy: 0x001f3f,
    teal: 0x20c997,
};

function parseColor(input) {
    if (!input) return 0x5865f2;
    const lower = input.toLowerCase().trim();
    if (COLOR_MAP[lower] !== undefined) return COLOR_MAP[lower];
    const hex = lower.replace('#', '');
    if (/^[0-9a-f]{6}$/i.test(hex)) return parseInt(hex, 16);
    return 0x5865f2;
}

export async function execute(interaction) {
    const title = interaction.options.getString('title', true);
    const description = interaction.options.getString('description', true);
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    const color = parseColor(interaction.options.getString('color'));
    const footer = interaction.options.getString('footer');
    const image = interaction.options.getString('image');
    const thumbnail = interaction.options.getString('thumbnail');

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();

    if (footer) embed.setFooter({ text: footer });
    if (image) embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);

    try {
        await channel.send({ embeds: [embed] });

        const isSameChannel = channel.id === interaction.channel.id;
        await interaction.reply({
            content: isSameChannel ? '✅ Embedを送信しました。' : `✅ <#${channel.id}> にEmbedを送信しました。`,
            ephemeral: true
        });
    } catch (err) {
        console.error('[ERROR] embed 送信エラー:', err);
        await interaction.reply({
            content: '❌ Embedの送信に失敗しました。ボットに「メッセージを送信」権限があるか確認してください。',
            ephemeral: true
        });
    }
}
