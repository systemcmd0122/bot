import 'dotenv/config';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// --- Load from Environment Variables ---
const MODERATION_CHANNEL_ID = process.env.MODERATION_CHANNEL_ID;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;

// Validate environment variables
if (!MODERATION_CHANNEL_ID || !ADMIN_ROLE_ID || !VERIFIED_ROLE_ID) {
    console.error('[ERROR] Missing required environment variables in buttonHandler:');
    if (!MODERATION_CHANNEL_ID) console.error('  - MODERATION_CHANNEL_ID');
    if (!ADMIN_ROLE_ID) console.error('  - ADMIN_ROLE_ID');
    if (!VERIFIED_ROLE_ID) console.error('  - VERIFIED_ROLE_ID');
}

async function handleVerifyUser(interaction) {
    const { member } = interaction;
    
    if (!MODERATION_CHANNEL_ID || !VERIFIED_ROLE_ID) {
        return interaction.reply({ 
            content: 'エラー: 認証システムの設定が不完全です。管理者に連絡してください。', 
            ephemeral: true
        });
    }
    
    if (member.roles.cache.has(VERIFIED_ROLE_ID)) {
        return interaction.reply({ content: 'すでに認証済みです。', ephemeral: true });
    }

    const moderationChannel = await interaction.client.channels.fetch(MODERATION_CHANNEL_ID).catch(() => null);
    if (!moderationChannel) {
        console.error(`[ERROR] Moderation channel not found: ${MODERATION_CHANNEL_ID}`);
        return interaction.reply({ content: 'エラーが発生しました。管理者に連絡してください。', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setTitle('📝 認証申請')
        .setDescription(`${member} (${member.user.tag}) が認証を申請しました。`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .addFields(
            { name: 'ユーザー名', value: member.user.tag, inline: true },
            { name: 'ユーザーID', value: member.id, inline: true },
            { name: 'アカウント作成日', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'サーバー参加日', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true }
        )
        .setColor('#ffc107')
        .setTimestamp()
        .setFooter({ text: '認証申請システム' });

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
        return interaction.reply({ 
            content: '✅ 認証申請を送信しました。管理者の承認をお待ちください。', 
            ephemeral: true
        });
    } catch (error) {
        console.error('[ERROR] Failed to send moderation message:', error);
        return interaction.reply({ 
            content: 'エラー: 認証申請の送信に失敗しました。管理者に連絡してください。', 
            ephemeral: true
        });
    }
}

async function handleApproval(interaction, userId) {
    const { member, guild } = interaction;

    if (!ADMIN_ROLE_ID || !VERIFIED_ROLE_ID) {
        return interaction.reply({ 
            content: 'エラー: 認証システムの設定が不完全です。', 
            ephemeral: true
        });
    }

    if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
        return interaction.reply({ content: 'この操作を行う権限がありません。', ephemeral: true });
    }

    const targetMember = await guild.members.fetch(userId).catch(() => null);
    if (!targetMember) {
        return interaction.reply({ content: '対象ユーザーが見つかりませんでした。', ephemeral: true });
    }

    const originalMessage = interaction.message;
    const disabledRow = new ActionRowBuilder();
    originalMessage.components[0].components.forEach(component => {
        disabledRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
    });

    try {
        // Check bot permissions
        const botMember = guild.members.me;
        if (!botMember.permissions.has('ManageRoles')) {
            await interaction.reply({ content: 'ボットに「ロールの管理」権限がありません。', ephemeral: true });
            return;
        }

        // Check role hierarchy
        const verifiedRole = guild.roles.cache.get(VERIFIED_ROLE_ID);
        if (!verifiedRole) {
            await interaction.reply({ content: '認証ロールが見つかりません。環境変数を確認してください。', ephemeral: true });
            return;
        }

        if (botMember.roles.highest.position <= verifiedRole.position) {
            await interaction.reply({ 
                content: `ボットのロールが認証ロール (${verifiedRole.name}) より下位にあるため、ロールを付与できません。ボットのロールを上位に移動してください。`, 
                ephemeral: true
            });
            return;
        }

        await targetMember.roles.add(VERIFIED_ROLE_ID);
        
        const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
            .setColor('#28a745')
            .setFooter({ text: `承認者: ${member.user.tag} | ${new Date().toLocaleString('ja-JP')}` });

        await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });
        
        try {
            await targetMember.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ 認証完了')
                        .setDescription(`${guild.name}での認証が承認されました。\n\nサーバーの全てのチャンネルにアクセスできるようになりました。`)
                        .setColor('#28a745')
                        .setTimestamp()
                ]
            });
        } catch (dmError) {
            console.log(`[INFO] Could not DM user ${targetMember.id}:`, dmError.message);
        }

        console.log(`[INFO] User ${targetMember.user.tag} (${targetMember.id}) was verified by ${member.user.tag}`);

    } catch (error) {
        console.error('[ERROR] Failed to grant role:', error);
        
        let errorMessage = 'ロールの付与に失敗しました。';
        if (error.code === 50013) {
            errorMessage = 'ボットに必要な権限がありません。「ロールの管理」権限を確認し、ボットのロールが認証ロールより上位にあることを確認してください。';
        }
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: errorMessage, ephemeral: true });
        } else {
            await interaction.followUp({ content: errorMessage, ephemeral: true });
        }
    }
}

async function handleDenial(interaction, userId) {
    const { member, guild } = interaction;

    if (!ADMIN_ROLE_ID) {
        return interaction.reply({ 
            content: 'エラー: 認証システムの設定が不完全です。', 
            ephemeral: true
        });
    }

    if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
        return interaction.reply({ content: 'この操作を行う権限がありません。', ephemeral: true });
    }
    
    const targetMember = await guild.members.fetch(userId).catch(() => null);
    if (!targetMember) {
        return interaction.update({ 
            content: '対象ユーザーが見つかりませんでした。コンポーネントを削除します。', 
            components: [] 
        });
    }

    const originalMessage = interaction.message;
    const disabledRow = new ActionRowBuilder();
    originalMessage.components[0].components.forEach(component => {
        disabledRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
    });

    const updatedEmbed = EmbedBuilder.from(originalMessage.embeds[0])
        .setColor('#dc3545')
        .setFooter({ text: `拒否者: ${member.user.tag} | ${new Date().toLocaleString('ja-JP')}` });

    await interaction.update({ embeds: [updatedEmbed], components: [disabledRow] });

    try {
        await targetMember.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('❌ 認証拒否')
                    .setDescription(`${guild.name}での認証が拒否されました。\n\nご不明な点がある場合は、サーバーの管理者にお問い合わせください。`)
                    .setColor('#dc3545')
                    .setTimestamp()
            ]
        });
    } catch (dmError) {
        console.log(`[INFO] Could not DM user ${targetMember.id}:`, dmError.message);
    }

    console.log(`[INFO] User ${targetMember.user.tag} (${targetMember.id}) was denied by ${member.user.tag}`);
}

export async function handleButtonInteraction(interaction) {
    const { customId } = interaction;

    try {
        console.log(`[INFO] Button clicked: ${customId} by ${interaction.user.tag} (${interaction.user.id})`);

        if (customId === 'verify_user_button') {
            await handleVerifyUser(interaction);
        } else if (customId.startsWith('approve_user:')) {
            const userId = customId.split(':')[1];
            await handleApproval(interaction, userId);
        } else if (customId.startsWith('deny_user:')) {
            const userId = customId.split(':')[1];
            await handleDenial(interaction, userId);
        } else {
            console.warn(`[WARNING] Unknown button interaction: ${customId}`);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '不明なボタンが押されました。', ephemeral: true });
            }
        }
    } catch (error) {
        console.error(`[ERROR] Error handling button ${customId}:`, error);

        const errorMessage = 'ボタン操作中にエラーが発生しました。';
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
        } else {
            await interaction.followUp({ content: errorMessage, ephemeral: true }).catch(() => {});
        }
    }
}