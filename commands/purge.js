import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { logAction } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
    .setName('purge')
    .setDescription('メッセージを一括削除します。')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
        option
            .setName('count')
            .setDescription('削除するメッセージ数 (1-100)')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true)
    )
    .addUserOption(option =>
        option
            .setName('user')
            .setDescription('特定ユーザーのメッセージのみ削除')
    );

export async function execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const count = interaction.options.getInteger('count', true);
    const targetUser = interaction.options.getUser('user');

    try {
        const messages = await interaction.channel.messages.fetch({ limit: count });

        let filtered = [...messages.values()];
        if (targetUser) {
            filtered = filtered.filter(m => m.author.id === targetUser.id);
        }

        if (filtered.length === 0) {
            return interaction.editReply('❌ 削除対象のメッセージが見つかりませんでした。');
        }

        const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const deletable = filtered.filter(m => m.createdTimestamp > twoWeeksAgo);
        const tooOld = filtered.length - deletable.length;

        if (deletable.length === 0) {
            return interaction.editReply('❌ 2週間以上前のメッセージは一括削除できません。');
        }

        const deleted = await interaction.channel.bulkDelete(deletable, true);

        let reply = `✅ **${deleted.size}件** のメッセージを削除しました。`;
        if (tooOld > 0) {
            reply += `\n⚠ 2週間以上前のメッセージ **${tooOld}件** はスキップされました。`;
        }

        await interaction.editReply(reply);

        await logAction(interaction.guild, {
            action: 'PURGE',
            executor: interaction.user,
            channel: interaction.channel,
            details: `${deleted.size}件のメッセージを削除${targetUser ? ` (${targetUser.tag})` : ''}`
        });
    } catch (err) {
        console.error('[ERROR] purge 実行エラー:', err);
        await interaction.editReply('❌ メッセージの削除に失敗しました。ボットに「メッセージの管理」権限があるか確認してください。');
    }
}
