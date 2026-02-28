// ==============================================
// handlers/banHandler.js
// BANチャンネルでのメッセージを処理するハンドラー
// BAN・BAN解除・BANリスト表示を管理する
// ==============================================

import 'dotenv/config';
import { EmbedBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// --- 環境変数の読み込み ---
const BAN_CHANNEL_ID = process.env.BAN_CHANNEL_ID;
const ADMIN_ROLE_ID  = process.env.ADMIN_ROLE_ID;

// 起動時に環境変数を検証
if (!BAN_CHANNEL_ID || !ADMIN_ROLE_ID) {
    console.error('[ERROR] banHandler: 必須の環境変数が不足しています:');
    if (!BAN_CHANNEL_ID) console.error('  - BAN_CHANNEL_ID');
    if (!ADMIN_ROLE_ID)  console.error('  - ADMIN_ROLE_ID');
}

// BANデータの保存先 (プロジェクトルートの data/ フォルダ)
const DATA_FILE = path.join(__dirname, '..', 'data', 'ban_data.json');

// ==============================================
// データファイルの読み書き
// ==============================================
function loadBanData() {
    try {
        const dataDir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (err) {
        console.error('[ERROR] BANデータ読み込み失敗:', err);
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
    } catch (err) {
        console.error('[ERROR] BANデータ保存失敗:', err);
    }
}

// ==============================================
// BANリストメッセージを作成・更新
// ==============================================
async function updateBanListMessage(channel, guild) {
    try {
        // 最新のBANリストを取得
        const bans = await guild.bans.fetch();

        const embed = new EmbedBuilder()
            .setTitle('🚫 BANユーザーリスト')
            .setDescription(
                bans.size > 0
                    ? `現在 **${bans.size}人** がBANされています。`
                    : 'BANされているユーザーはいません。'
            )
            .setColor('#dc3545')
            .setTimestamp()
            .setFooter({ text: `${guild.name} BAN管理システム` });

        if (bans.size > 0) {
            const MAX_DISPLAY = 20;
            const banList = [];
            let index = 1;

            for (const [, ban] of bans) {
                const reason = ban.reason || '理由なし';
                banList.push(
                    `${index}. **${ban.user.tag}** (<@${ban.user.id}>)\n` +
                    `   └ ID: \`${ban.user.id}\`\n` +
                    `   └ 理由: ${reason}`
                );
                index++;

                if (index > MAX_DISPLAY) {
                    banList.push(`\n... および **${bans.size - MAX_DISPLAY}件** のユーザー`);
                    break;
                }
            }

            // 1024文字制限に対応するためフィールドを分割
            const chunks = [];
            let currentChunk = '';

            for (const item of banList) {
                const candidate = currentChunk + item + '\n\n';
                if (candidate.length > 1000) {
                    if (currentChunk) chunks.push(currentChunk.trim());
                    currentChunk = item + '\n\n';
                } else {
                    currentChunk = candidate;
                }
            }
            if (currentChunk.trim()) chunks.push(currentChunk.trim());

            chunks.forEach((chunk, i) => {
                embed.addFields({
                    name:  i === 0 ? '📋 ユーザー一覧' : '\u200B',
                    value: chunk
                });
            });
        }

        // 既存メッセージを更新 or 新規作成
        const banData  = loadBanData();
        const msgId    = banData.banListMessageId;
        let   message;

        if (msgId) {
            try {
                message = await channel.messages.fetch(msgId);
                await message.edit({ embeds: [embed] });
                console.log(`[INFO] BANリストメッセージを更新しました (ID: ${msgId})`);
            } catch {
                // メッセージが削除されていた場合は新規作成
                console.warn('[WARNING] BANリストメッセージが見つかりません。新規作成します。');
                message = await channel.send({ embeds: [embed] });
                banData.banListMessageId = message.id;
                saveBanData(banData);
                console.log(`[INFO] BANリストメッセージを新規作成しました (ID: ${message.id})`);
            }
        } else {
            message = await channel.send({ embeds: [embed] });
            banData.banListMessageId = message.id;
            saveBanData(banData);
            console.log(`[INFO] BANリストメッセージを作成しました (ID: ${message.id})`);
        }

        return message;
    } catch (err) {
        console.error('[ERROR] BANリストの更新失敗:', err);
    }
}

// ==============================================
// ユーザーをBANする
// ==============================================
async function banUser(guild, userId, reason, executor) {
    try {
        // ユーザー情報を取得
        const user = await guild.client.users.fetch(userId).catch(() => null);
        if (!user) {
            return { success: false, message: '❌ ユーザーが見つかりませんでした。IDを確認してください。' };
        }

        // 既にBANされているか確認
        const existing = await guild.bans.fetch(userId).catch(() => null);
        if (existing) {
            return { success: false, message: `❌ **${user.tag}** (<@${userId}>) は既にBANされています。` };
        }

        // BAN実行
        await guild.members.ban(userId, { reason: `${reason} | 実行者: ${executor.tag}` });

        console.log(`[INFO] BAN実行: ${user.tag} (${userId}) | 理由: ${reason} | 実行者: ${executor.tag}`);

        return {
            success: true,
            message: `✅ **${user.tag}** (<@${userId}>) をBANしました。\n📝 理由: ${reason}`,
            user
        };
    } catch (err) {
        console.error('[ERROR] BAN実行失敗:', err);
        if (err.code === 50013) {
            return { success: false, message: '❌ ボットに「メンバーをBAN」権限がありません。' };
        }
        return { success: false, message: `❌ BANに失敗しました: ${err.message}` };
    }
}

// ==============================================
// ユーザーのBAN解除
// ==============================================
async function unbanUser(guild, userId, executor) {
    try {
        // BANされているか確認
        const ban = await guild.bans.fetch(userId).catch(() => null);
        if (!ban) {
            return { success: false, message: '❌ このユーザーはBANされていません。' };
        }

        // BAN解除
        await guild.members.unban(userId, `BAN解除 | 実行者: ${executor.tag}`);

        console.log(`[INFO] BAN解除: ${ban.user.tag} (${userId}) | 実行者: ${executor.tag}`);

        return {
            success: true,
            message: `✅ **${ban.user.tag}** (<@${userId}>) のBANを解除しました。`,
            user: ban.user
        };
    } catch (err) {
        console.error('[ERROR] BAN解除失敗:', err);
        if (err.code === 50013) {
            return { success: false, message: '❌ ボットに「メンバーのBAN解除」権限がありません。' };
        }
        return { success: false, message: `❌ BAN解除に失敗しました: ${err.message}` };
    }
}

// ==============================================
// メッセージを自動削除するユーティリティ
// ==============================================
function autoDelete(message, reply, delayMs = 5000) {
    setTimeout(async () => {
        await message.delete().catch(() => {});
        if (reply) await reply.delete().catch(() => {});
    }, delayMs);
}

// ==============================================
// メッセージハンドラー (BANチャンネルへの投稿を処理)
// ==============================================
export async function handleBanMessage(message) {
    // ボット自身のメッセージは無視
    if (message.author.bot) return;

    // 環境変数未設定チェック
    if (!BAN_CHANNEL_ID || !ADMIN_ROLE_ID) {
        console.error('[ERROR] BAN システムの環境変数が設定されていません。');
        return;
    }

    // 指定BANチャンネル以外は無視
    if (message.channel.id !== BAN_CHANNEL_ID) return;

    const { content, member, guild, channel } = message;

    // 管理者権限チェック
    if (!member.roles.cache.has(ADMIN_ROLE_ID)) {
        const reply = await message.reply('❌ この操作を行う権限がありません。').catch(() => null);
        autoDelete(message, reply, 3000);
        return;
    }

    const trimmed = content.trim();

    // ------------------------------------------
    // ヘルプ表示
    // ------------------------------------------
    if (/^!?help$/i.test(trimmed)) {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📋 BANシステム ヘルプ')
            .setDescription('このチャンネルでユーザーのBAN・BAN解除を行えます。')
            .addFields(
                {
                    name:  '🔨 BANする',
                    value: '```\nユーザーID\n```\n```\nユーザーID 理由\n```\n例: `123456789012345678 荒らし行為`'
                },
                {
                    name:  '✅ BAN解除する',
                    value: '```\n!unban ユーザーID\n```\n```\nunban ユーザーID\n```\n例: `!unban 123456789012345678`'
                },
                {
                    name:  '💡 ヒント',
                    value: [
                        '• ユーザーIDは右クリック →「IDをコピー」で取得できます',
                        '• 理由は任意ですが記録のため入力を推奨します',
                        '• メッセージは5秒後に自動削除されます',
                        '• ヘルプは15秒後に自動削除されます'
                    ].join('\n')
                }
            )
            .setColor('#0099ff')
            .setFooter({ text: 'BAN管理システム' })
            .setTimestamp();

        const reply = await message.reply({ embeds: [helpEmbed] }).catch(() => null);
        autoDelete(message, reply, 15000);
        return;
    }

    // ------------------------------------------
    // BAN解除コマンド: !unban <UserID> または unban <UserID>
    // ------------------------------------------
    const unbanMatch = trimmed.match(/^!?unban\s+(\d{17,19})$/i);
    if (unbanMatch) {
        const userId = unbanMatch[1];
        const result = await unbanUser(guild, userId, member.user);
        const reply  = await message.reply(result.message).catch(() => null);
        autoDelete(message, reply, 5000);

        if (result.success) {
            await updateBanListMessage(channel, guild);
        }
        return;
    }

    // ------------------------------------------
    // BAN実行: <UserID> <理由>
    // ------------------------------------------
    const banWithReasonMatch = trimmed.match(/^(\d{17,19})\s+(.+)$/);
    if (banWithReasonMatch) {
        const userId = banWithReasonMatch[1];
        const reason = banWithReasonMatch[2].trim();
        const result = await banUser(guild, userId, reason, member.user);
        const reply  = await message.reply(result.message).catch(() => null);
        autoDelete(message, reply, 5000);

        if (result.success) {
            await updateBanListMessage(channel, guild);
        }
        return;
    }

    // ------------------------------------------
    // BAN実行: <UserID> のみ (理由なし)
    // ------------------------------------------
    const banOnlyMatch = trimmed.match(/^(\d{17,19})$/);
    if (banOnlyMatch) {
        const userId = banOnlyMatch[1];
        const reason = '理由なし';
        const result = await banUser(guild, userId, reason, member.user);
        const reply  = await message.reply(result.message).catch(() => null);
        autoDelete(message, reply, 5000);

        if (result.success) {
            await updateBanListMessage(channel, guild);
        }
        return;
    }

    // ------------------------------------------
    // 不明なコマンド
    // ------------------------------------------
    const reply = await message.reply('❓ 無効なコマンドです。`!help` でヘルプを表示します。').catch(() => null);
    autoDelete(message, reply, 3000);
}

// ==============================================
// 起動時にBANリストを初期化・表示
// ==============================================
export async function initializeBanList(client) {
    try {
        if (!BAN_CHANNEL_ID) {
            console.error('[ERROR] BAN_CHANNEL_ID が設定されていません。BANリストの初期化をスキップします。');
            return;
        }

        const channel = await client.channels.fetch(BAN_CHANNEL_ID).catch(() => null);
        if (!channel) {
            console.error(`[ERROR] BANチャンネルが見つかりません: ${BAN_CHANNEL_ID}`);
            return;
        }

        const guild = channel.guild;
        await updateBanListMessage(channel, guild);

        console.log('[SUCCESS] BANリストの初期化完了。');
    } catch (err) {
        console.error('[ERROR] BANリストの初期化失敗:', err);
    }
}