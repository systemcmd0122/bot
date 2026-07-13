// ==============================================
// commands/skip.js
// /skip コマンド
// ==============================================

import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('現在の曲をスキップして次の曲を再生します。');

export async function execute(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guildId);

    if (!queue) {
        return interaction.reply({ content: '❌ 現在何も再生されていません。', ephemeral: true });
    }

    if (interaction.member.voice.channel?.id !== queue.voiceChannel.id) {
        return interaction.reply({
            content: `❌ この操作を行うには <#${queue.voiceChannel.id}> に参加している必要があります。`,
            ephemeral: true
        });
    }

    const skippedSong = queue.songs[0];

    try {
        if (queue.songs.length <= 1) {
            await queue.stop();
            return interaction.reply(`⏭️ **${skippedSong.name}** をスキップしました。キューが空になったため再生を終了します。`);
        }

        const nextSong = await queue.skip();
        return interaction.reply(`⏭️ **${skippedSong.name}** をスキップしました。次の曲: **${nextSong.name}**`);
    } catch (err) {
        console.error('[ERROR] /skip 実行エラー:', err);
        return interaction.reply({ content: '❌ スキップに失敗しました。', ephemeral: true });
    }
}