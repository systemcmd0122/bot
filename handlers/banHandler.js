import 'dotenv/config';
import { EmbedBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Load from Environment Variables ---
const BAN_CHANNEL_ID = process.env.BAN_CHANNEL_ID;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

// Validate environment variables
if (!BAN_CHANNEL_ID || !ADMIN_ROLE_ID) {
    console.error('[ERROR] Missing required environment variables in banHandler:');
    if (!BAN_CHANNEL_ID) console.error('  - BAN_CHANNEL_ID');
    if (!ADMIN_ROLE_ID) console.error('  - ADMIN_ROLE_ID');
}

const DATA_FILE = path.join(__dirname, '..', 'data', 'ban_data.json');

// データファイルの読み書き
function loadBanData() {
    try {
        const dataDir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[ERROR] Failed to load ban data:', error);
    }
    return {};
}

function saveBanData(data) {
    try {
        const dataDir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('[ERROR] Failed to save ban data:', error);
    }
}

// BANリストメッセージを作成・更新
async function updateBanListMessage(channel, guild) {
    try {
        // 現在のBANリストを取得
        const bans = await guild.bans.fetch();
        
        const embed = new EmbedBuilder()
            .setTitle('🚫 BANユーザーリスト')
            .setDescription(bans.size > 0 ? `現在 **${bans.size}人** がBANされています。` : 'BANされているユーザーはいません。')
            .setColor('#dc3545')
            .setTimestamp()
            .setFooter({ text: `${guild.name} BAN管理システム` });

        if (bans.size > 0) {
            const banList = [];
            let index = 1;
            for (const [userId, ban] of bans) {
                const reason = ban.reason || '理由なし';
                banList.push(`${index}. **${ban.user.tag}** (<@${ban.user.id}>)\n   └ ID: \`${ban.user.id}\`\n   └ 理由: ${reason}`);
                index++;
                
                // 最大20件まで表示
                if (index > 20) {
                    banList.push(`\n... および ${bans.size - 20} 件のユーザー`);
                    break;
                }
            }

            // フィールドを追加(1024文字制限があるため分割)
            const chunks = [];
            let currentChunk = '';
            
            for (const item of banList) {
                if ((currentChunk + item).length > 1000) {
                    chunks.push(currentChunk);
                    currentChunk = item + '\n\n';
                } else {
                    currentChunk += item + '\n\n';
                }
            }
            if (currentChunk) chunks.push(currentChunk);

            chunks.forEach((chunk, index) => {
                embed.addFields({
                    name: index === 0 ? '📋 ユーザー一覧' : '​',
                    value: chunk.trim()
                });
            });
        }

        // データファイルからメッセージIDを取得
        const banData = loadBanData();
        const messageId = banData.banListMessageId;

        let message;
        if (messageId) {
            // 既存のメッセージを更新
            try {
                message = await channel.messages.fetch(messageId);
                await message.edit({ embeds: [embed] });
                console.log(`[INFO] Updated ban list message (ID: ${messageId})`);
            } catch (error) {
                // メッセージが見つからない場合は新規作成
                console.log(`[WARNING] Ban list message not found, creating new one`);
                message = await channel.send({ embeds: [embed] });
                banData.banListMessageId = message.id;
                saveBanData(banData);
                console.log(`[INFO] Created new ban list message (ID: ${message.id})`);
            }
        } else {
            // 新規メッセージを作成
            message = await channel.send({ embeds: [embed] });
            banData.banListMessageId = message.id;
            saveBanData(banData);
            console.log(`[INFO] Created ban list message (ID: ${message.id})`);
        }

        return message;
    } catch (error) {
        console.error('[ERROR] Failed to update ban list:', error);
    }
}

// ユーザーをBANする
async function banUser(guild, userId, reason, executor) {
    try {
        // ユーザー情報を取得
        const user = await guild.client.users.fetch(userId).catch(() => null);
        
        if (!user) {
            return { success: false, message: 'ユーザーが見つかりませんでした。' };
        }

        // 既にBANされているか確認
        const isBanned = await guild.bans.fetch(userId).catch(() => null);
        if (isBanned) {
            return { success: false, message: `<@${userId}> は既にBANされています。` };
        }

        // BAN実行
        await guild.members.ban(userId, { reason: reason });

        console.log(`[INFO] Banned user ${user.tag} (${userId}) | Reason: ${reason} | Executor: ${executor.tag}`);

        return { 
            success: true, 
            message: `✅ **${user.tag}** (<@${userId}>) をBANしました。\n📝 理由: ${reason}`,
            user: user
        };
    } catch (error) {
        console.error('[ERROR] Failed to ban user:', error);
        
        if (error.code === 50013) {
            return { success: false, message: 'ボットに「メンバーをBAN」権限がありません。' };
        }
        
        return { success: false, message: `BANに失敗しました: ${error.message}` };
    }
}

// ユーザーのBAN解除
async function unbanUser(guild, userId, executor) {
    try {
        // BANされているか確認
        const ban = await guild.bans.fetch(userId).catch(() => null);
        
        if (!ban) {
            return { success: false, message: 'このユーザーはBANされていません。' };
        }

        // BAN解除
        await guild.members.unban(userId);

        console.log(`[INFO] Unbanned user ${ban.user.tag} (${userId}) | Executor: ${executor.tag}`);

        return { 
            success: true, 
            message: `✅ **${ban.user.tag}** (<@${userId}>) のBANを解除しました。`,
            user: ban.user
        };
    } catch (error) {
        console.error('[ERROR] Failed to unban user:', error);
        
        if (error.code === 50013) {
            return { success: false, message: 'ボットに「メンバーのBAN解除」権限がありません。' };
        }
        
        return { success: false, message: `BAN解除に失敗しました: ${error.message}` };
    }
}

// メッセージハンドラー
export async function handleBanMessage(message) {
    // ボット自身のメッセージは無視
    if (message.author.bot) return;

    if (!BAN_CHANNEL_ID || !ADMIN_ROLE_ID) {
        console.error('[ERROR] BAN system is not properly configured in .env');
        return;
    }

    // 指定されたチャンネル以外は無視
    if (message.channel.id !== BAN_CHANNEL_ID) return;

    const { content, member, guild, channel } = message;

    // 管理者権限チェック
    if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
        const reply = await message.reply('❌ この操作を行う権限がありません。');
        // 3秒後に元のメッセージと返信を削除
        setTimeout(async () => {
            await message.delete().catch(() => {});
            await reply.delete().catch(() => {});
        }, 3000);
        return;
    }

    const trimmedContent = content.trim();

    // BAN解除コマンド(!unban UserID または unban UserID)
    const unbanMatch = trimmedContent.match(/^!?unban\s+(\d{17,19})$/i);
    if (unbanMatch) {
        const userId = unbanMatch[1];
        
        const result = await unbanUser(guild, userId, member.user);
        const reply = await message.reply(result.message);
        
        // 5秒後に元のメッセージと返信を削除
        setTimeout(async () => {
            await message.delete().catch(() => {});
            await reply.delete().catch(() => {});
        }, 5000);
        
        if (result.success) {
            // BANリスト更新
            await updateBanListMessage(channel, guild);
        }
        return;
    }

    // ユーザーIDのみの場合はBAN
    const userIdMatch = trimmedContent.match(/^(\d{17,19})$/);
    if (userIdMatch) {
        const userId = userIdMatch[1];
        const reason = `BANチャンネルに投稿されました (実行者: ${member.user.tag})`;
        
        const result = await banUser(guild, userId, reason, member.user);
        const reply = await message.reply(result.message);
        
        // 5秒後に元のメッセージと返信を削除
        setTimeout(async () => {
            await message.delete().catch(() => {});
            await reply.delete().catch(() => {});
        }, 5000);
        
        if (result.success) {
            // BANリスト更新
            await updateBanListMessage(channel, guild);
        }
        return;
    }

    // ユーザーID + 理由の形式(UserID 理由)
    const userIdWithReasonMatch = trimmedContent.match(/^(\d{17,19})\s+(.+)$/);
    if (userIdWithReasonMatch) {
        const userId = userIdWithReasonMatch[1];
        const reason = userIdWithReasonMatch[2];
        
        const result = await banUser(guild, userId, reason, member.user);
        const reply = await message.reply(result.message);
        
        // 5秒後に元のメッセージと返信を削除
        setTimeout(async () => {
            await message.delete().catch(() => {});
            await reply.delete().catch(() => {});
        }, 5000);
        
        if (result.success) {
            // BANリスト更新
            await updateBanListMessage(channel, guild);
        }
        return;
    }

    // ヘルプメッセージ
    if (trimmedContent.toLowerCase() === '!help' || trimmedContent.toLowerCase() === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📋 BANシステム ヘルプ')
            .setDescription('このチャンネルでユーザーをBANまたはBAN解除できます。')
            .addFields(
                { 
                    name: '🔨 BAN', 
                    value: '```\nユーザーID\n```または```\nユーザーID 理由\n```\n**例:**\n`123456789012345678 荒らし行為`' 
                },
                { 
                    name: '✅ BAN解除', 
                    value: '```\n!unban ユーザーID\n```または```\nunban ユーザーID\n```\n**例:**\n`!unban 123456789012345678`' 
                },
                {
                    name: '💡 ヒント',
                    value: '• ユーザーIDは右クリック→「IDをコピー」で取得できます\n• 理由は任意ですが、記録として残すことを推奨します\n• メッセージは5秒後に自動削除されます'
                }
            )
            .setColor('#0099ff')
            .setFooter({ text: 'BAN管理システム' })
            .setTimestamp();
        
        const reply = await message.reply({ embeds: [helpEmbed] });
        
        // 15秒後にヘルプメッセージを削除
        setTimeout(async () => {
            await message.delete().catch(() => {});
            await reply.delete().catch(() => {});
        }, 15000);
        return;
    }

    // 不明なコマンドまたは関係ないメッセージ
    // すべてのメッセージを3秒後に自動削除
    const reply = await message.reply('❓ 無効なコマンドです。`!help` でヘルプを表示します。').catch(() => null);
    
    setTimeout(async () => {
        await message.delete().catch(() => {});
        if (reply) await reply.delete().catch(() => {});
    }, 3000);
}

// 初期化時にBANリストを表示
export async function initializeBanList(client) {
    try {
        if (!BAN_CHANNEL_ID) {
            console.error('[ERROR] BAN_CHANNEL_ID is not set in .env file');
            return;
        }

        const channel = await client.channels.fetch(BAN_CHANNEL_ID).catch(() => null);
        if (!channel) {
            console.error(`[ERROR] Ban channel not found: ${BAN_CHANNEL_ID}`);
            return;
        }

        const guild = channel.guild;
        await updateBanListMessage(channel, guild);
        
        console.log('[SUCCESS] Ban list initialized successfully');
    } catch (error) {
        console.error('[ERROR] Failed to initialize ban list:', error);
    }
}