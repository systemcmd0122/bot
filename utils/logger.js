import { EmbedBuilder } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

const ACTION_LABELS = {
    BAN:       { emoji: '🔨', color: 0xdc3545 },
    UNBAN:     { emoji: '✅', color: 0x28a745 },
    KICK:      { emoji: '👢', color: 0xfd7e14 },
    TIMEOUT:   { emoji: '🔇', color: 0x6f42c1 },
    PURGE:     { emoji: '🗑️', color: 0x6c757d },
    VERIFY:    { emoji: '🔐', color: 0x007bff },
};

export async function logAction(guild, { action, executor, target, channel, details }) {
    if (!LOG_CHANNEL_ID) return;

    const logChannel = await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (!logChannel) return;

    const config = ACTION_LABELS[action] || { emoji: '📋', color: 0x5865f2 };

    const embed = new EmbedBuilder()
        .setTitle(`${config.emoji} ${action}`)
        .setColor(config.color)
        .addFields(
            { name: '実行者', value: `${executor.tag} (<@${executor.id}>)`, inline: true }
        )
        .setTimestamp();

    if (target) {
        embed.addFields(
            { name: '対象', value: `${target.tag} (<@${target.id}>)`, inline: true }
        );
    }

    if (channel) {
        embed.addFields(
            { name: 'チャンネル', value: `<#${channel.id}>`, inline: true }
        );
    }

    if (details) {
        embed.addFields({ name: '詳細', value: details });
    }

    try {
        await logChannel.send({ embeds: [embed] });
    } catch (err) {
        console.error('[ERROR] ログ送信失敗:', err);
    }
}

// BAN/UNBAN のグローバルイベントを监听するための初期化関数
export function initAuditLogger(client) {
    client.on('guildBanAdd', async ban => {
        if (!LOG_CHANNEL_ID) return;
        const entry = await ban.guild.fetchAuditLogs({ type: 22, limit: 1 }).catch(() => null);
        const auditEntry = entry?.entries?.first();
        const executor = auditEntry?.executor || { tag: '不明', id: '0' };

        await logAction(ban.guild, {
            action: 'BAN',
            executor,
            target: ban.user,
            details: auditEntry?.reason || '理由なし'
        });
    });

    client.on('guildBanRemove', async ban => {
        if (!LOG_CHANNEL_ID) return;
        const entry = await ban.guild.fetchAuditLogs({ type: 23, limit: 1 }).catch(() => null);
        const auditEntry = entry?.entries?.first();
        const executor = auditEntry?.executor || { tag: '不明', id: '0' };

        await logAction(ban.guild, {
            action: 'UNBAN',
            executor,
            target: ban.user,
            details: 'BAN解除'
        });
    });
}
