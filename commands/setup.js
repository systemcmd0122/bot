import 'dotenv/config';
import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// --- Load from Environment Variables ---
const VERIFICATION_CHANNEL_ID = process.env.VERIFICATION_CHANNEL_ID;

if (!VERIFICATION_CHANNEL_ID) {
    console.error('[ERROR] VERIFICATION_CHANNEL_ID is not set in .env file');
}

export const data = new SlashCommandBuilder()
    .setName('setup-verify')
    .setDescription('認証ボードを設置します。')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option =>
        option.setName('channel')
            .setDescription('認証ボードを設置するチャンネル')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true));

export async function execute(interaction) {
    const channel = interaction.options.getChannel('channel');

    if (!VERIFICATION_CHANNEL_ID) {
        return interaction.reply({
            content: 'エラー: VERIFICATION_CHANNEL_ID が環境変数に設定されていません。',
            ephemeral: true
        });
    }

    if (channel.id !== VERIFICATION_CHANNEL_ID) {
        return interaction.reply({
            content: `このコマンドは認証チャンネル (<#${VERIFICATION_CHANNEL_ID}>) でのみ使用できますが、別のチャンネルが指定されました。`,
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🔐 サーバー認証')
        .setDescription('下のボタンを押してサーバーメンバーとして認証してください。\n\n認証が完了すると、管理者による承認後にサーバーの全てのチャンネルにアクセスできるようになります。')
        .setColor('#0099ff')
        .setFooter({ text: `${interaction.guild.name} 認証システム` })
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('verify_user_button')
                .setLabel('✓ 認証する')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🔓')
        );

    try {
        await channel.send({ embeds: [embed], components: [row] });

        await interaction.reply({
            content: `✅ ${channel} に認証ボードを設置しました。`,
            ephemeral: true
        });
    } catch (error) {
        console.error('[ERROR] Failed to send verification board:', error);
        await interaction.reply({
            content: `エラー: 認証ボードの設置に失敗しました。ボットに「メッセージを送信」権限があるか確認してください。`,
            ephemeral: true
        });
    }
}