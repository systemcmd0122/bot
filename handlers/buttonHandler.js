// ==============================================
// handlers/buttonHandler.js
// ボタンインタラクションを管理するハンドラー
// 認証申請・承認・拒否ボタンを処理する
// ==============================================

import 'dotenv/config';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// --- 環境変数の読み込み ---
const MODERATION_CHANNEL_ID = process.env.MODERATION_CHANNEL_ID;
const ADMIN_ROLE_ID         = process.env.ADMIN_ROLE_ID;
const VERIFIED_ROLE_ID      = process.env.VERIFIED_ROLE_ID;

// 起動時に環境変数を検証
if (!MODERATION_CHANNEL_ID || !ADMIN_ROLE_ID || !VERIFIED_ROLE_ID) {
    console.error('[ERROR] buttonHandler: 必須の環境変数が不足しています:');
    if (!MODERATION_CHANNEL_ID) console.error('  - MODERATION_CHANNEL_ID');
    if (!ADMIN_ROLE_ID)         console.error('  - ADMIN_ROLE_ID');
    if (!VERIFIED_ROLE_ID)      console.error('  - VERIFIED_ROLE_ID');
}

// ==============================================
// 認証ボタン押下処理 (ユーザーが認証を申請する)
// ==============================================
async function handleVerifyUser(interaction) {
    const { member } = interaction;

    // 環境変数チェック
    if (!MODERATION_CHANNEL_ID || !VERIFIED_ROLE_ID) {
        return interaction.reply({
            content: '❌ エラー: 認証システムの設定が不完全です。管理者に連絡してください。',
            flags: 64
        });
    }

    // 既に認証済みかチェック
    if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
        return interaction.reply({ content: '✅ あなたはすでに認証済みです。', flags: 64 });
    }

    // モデレーションチャンネルを取得
    const moderationChannel = await interaction.client.channels.fetch(MODERATION_CHANNEL_ID).catch(() => null);
    if (!moderationChannel) {
        console.error(`[ERROR] モデレーションチャンネルが見つかりません: ${MODERATION_CHANNEL_ID}`);
        return interaction.reply({
            content: '❌ エラーが発生しました。管理者に連絡してください。',
            flags: 64
        });
    }

    // 認証申請Embedを作成
    const embed = new EmbedBuilder()
        .setTitle('📝 認証申請')
        .setDescription(`${member} (${member.user.tag}) が認証を申請しました。`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'ユーザー名',       value: member.user.tag,                                                          inline: true },
            { name: 'ユーザーID',       value: member.id,                                                                inline: true },
            { name: '\u200B',           value: '\u200B',                                                                 inline: true },
            { name: 'アカウント作成日', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,               inline: true },
            { name: 'サーバー参加日',   value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,                     inline: true }
        )
        .setColor('#ffc107')
        .setTimestamp()
        .setFooter({ text: '認証申請システム' });

    // 承認・拒否ボタンを作成
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_user:${member.id}`)
                .setLabel('承認')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`deny_user:${member.id}`)
                .setLabel('拒否')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

    try {
        await moderationChannel.send({ embeds: [embed], components: [actionRow] });
        console.log(`[INFO] 認証申請送信: ${member.user.tag} (${member.id})`);
        return interaction.reply({
            content: '✅ 認証申請を送信しました。管理者の承認をお待ちください。',
            flags: 64
        });
    } catch (err) {
        console.error('[ERROR] モデレーションチャンネルへの送信失敗:', err);
        return interaction.reply({
            content: '❌ エラー: 認証申請の送信に失敗しました。管理者に連絡してください。',
            flags: 64
        });
    }
}

// ==============================================
// 承認ボタン処理 (管理者がユーザーを承認する)
// ==============================================
async function handleApproval(interaction, userId) {
    const { member, guild } = interaction;

    // 環境変数チェック
    if (!ADMIN_ROLE_ID || !VERIFIED_ROLE_ID) {
        return interaction.reply({
            content: '❌ エラー: 認証システムの設定が不完全です。',
            flags: 64
        });
    }

    // 管理者権限チェック
    if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
        return interaction.reply({ content: '❌ この操作を行う権限がありません。', flags: 64 });
    }

    // 対象ユーザーを取得
    const targetMember = await guild.members.fetch(userId).catch(() => null);
    if (!targetMember) {
        // ユーザーがサーバーにいない場合はボタンを無効化して終了
        const disabledRow = disableAllButtons(interaction.message);
        return interaction.update({
            content: '⚠ 対象ユーザーがサーバーに存在しません。',
            components: [disabledRow]
        });
    }

    // ボットの権限チェック
    const botMember = guild.members.me;

    if (!botMember.permissions.has('ManageRoles')) {
        return interaction.reply({
            content: '❌ ボットに「ロールの管理」権限がありません。サーバー設定を確認してください。',
            flags: 64
        });
    }

    // 認証ロールの取得
    const verifiedRole = guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (!verifiedRole) {
        return interaction.reply({
            content: '❌ 認証ロールが見つかりません。VERIFIED_ROLE_ID の設定を確認してください。',
            flags: 64
        });
    }

    // ロール階層チェック
    if (botMember.roles.highest.position <= verifiedRole.position) {
        return interaction.reply({
            content: `❌ ボットのロールが認証ロール「${verifiedRole.name}」より下位にあるため、ロールを付与できません。\nDiscordサーバー設定でボットのロールを認証ロールより上位に移動してください。`,
            flags: 64
        });
    }

    // 既に認証済みかチェック
    if (targetMember.roles.cache.has(VERIFIED_ROLE_ID)) {
        const disabledRow = disableAllButtons(interaction.message);
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#28a745')
            .setFooter({ text: `既に認証済み (確認者: ${member.user.tag}) | ${new Date().toLocaleString('ja-JP')}` });
        return interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });
    }

    try {
        // ロール付与
        await targetMember.roles.add(VERIFIED_ROLE_ID, `承認者: ${member.user.tag}`);

        // Embedを承認済みに更新
        const disabledRow = disableAllButtons(interaction.message);
        const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#28a745')
            .setFooter({ text: `承認者: ${member.user.tag} | ${new Date().toLocaleString('ja-JP')}` });

        await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });

        // DMで通知
        try {
            await targetMember.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ 認証完了')
                        .setDescription(`**${guild.name}** での認証が承認されました！\n\nサーバーの全チャンネルにアクセスできるようになりました。`)
                        .setColor('#28a745')
                        .setTimestamp()
                        .setFooter({ text: guild.name })
                ]
            });
        } catch (dmErr) {
            console.log(`[INFO] DMを送信できませんでした (ユーザー: ${targetMember.id}): ${dmErr.message}`);
        }

        console.log(`[INFO] 認証承認: ${targetMember.user.tag} (${targetMember.id}) | 承認者: ${member.user.tag}`);

    } catch (err) {
        console.error('[ERROR] ロール付与失敗:', err);

        let errorMessage = '❌ ロールの付与に失敗しました。';
        if (err.code === 50013) {
            errorMessage = '❌ ボットに必要な権限がありません。「ロールの管理」権限とロール階層を確認してください。';
        }

        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: errorMessage, flags: 64 });
            } else {
                await interaction.followUp({ content: errorMessage, flags: 64 });
            }
        } catch (replyErr) {
            console.error('[ERROR] エラー返信にも失敗:', replyErr);
        }
    }
}

// ==============================================
// 拒否ボタン処理 (管理者がユーザーを拒否する)
// ==============================================
async function handleDenial(interaction, userId) {
    const { member, guild } = interaction;

    // 環境変数チェック
    if (!ADMIN_ROLE_ID) {
        return interaction.reply({
            content: '❌ エラー: 認証システムの設定が不完全です。',
            flags: 64
        });
    }

    // 管理者権限チェック
    if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
        return interaction.reply({ content: '❌ この操作を行う権限がありません。', flags: 64 });
    }

    // 対象ユーザーを取得
    const targetMember = await guild.members.fetch(userId).catch(() => null);

    // Embedを拒否済みに更新
    const disabledRow = disableAllButtons(interaction.message);
    const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#dc3545')
        .setFooter({ text: `拒否者: ${member.user.tag} | ${new Date().toLocaleString('ja-JP')}` });

    await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });

    // DMで通知 (ユーザーがサーバーにいる場合のみ)
    if (targetMember) {
        try {
            await targetMember.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ 認証拒否')
                        .setDescription(`**${guild.name}** での認証申請が拒否されました。\n\nご不明な点がある場合は、サーバーの管理者にお問い合わせください。`)
                        .setColor('#dc3545')
                        .setTimestamp()
                        .setFooter({ text: guild.name })
                ]
            });
        } catch (dmErr) {
            console.log(`[INFO] DMを送信できませんでした (ユーザー: ${targetMember.id}): ${dmErr.message}`);
        }

        console.log(`[INFO] 認証拒否: ${targetMember.user.tag} (${targetMember.id}) | 拒否者: ${member.user.tag}`);
    } else {
        console.log(`[INFO] 認証拒否: ユーザーID ${userId} (サーバー外) | 拒否者: ${member.user.tag}`);
    }
}

// ==============================================
// ユーティリティ: 全ボタンを無効化したActionRowを返す
// ==============================================
function disableAllButtons(message) {
    const disabledRow = new ActionRowBuilder();
    message.components[0].components.forEach(component => {
        disabledRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
    });
    return disabledRow;
}

// ==============================================
// メインエクスポート: ボタンインタラクションのルーティング
// ==============================================
export async function handleButtonInteraction(interaction) {
    const { customId } = interaction;

    if (customId === 'verify_user_button') {
        await handleVerifyUser(interaction);

    } else if (customId.startsWith('approve_user:')) {
        const userId = customId.split(':')[1];
        await handleApproval(interaction, userId);

    } else if (customId.startsWith('deny_user:')) {
        const userId = customId.split(':')[1];
        await handleDenial(interaction, userId);

    } else {
        console.warn(`[WARNING] 未知のボタンインタラクション: ${customId}`);
    }
}