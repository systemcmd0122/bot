// ==============================================
// commands/loop.js
// /loop コマンド
// ==============================================

import { SlashCommandBuilder } from 'discord.js';
import { REPEAT_MODE_LABEL, refreshNowPlayingPanel } from '../utils/musicUI.js';

const MODE_MAP = {
    off: 0,
    song: 1,
    queue: 2
};

export const data = new SlashCommandBuilder()
    .setName('loop')
    .setDescription('リピートモードを設定します。')
    .addStringOption(option =>
        option
            .setName('mode')
            .setDescription('リピートモード')
            .setRequired(true)
            .addChoices(
                { name: 'オフ', value: 'off' },
                { name: '1曲リピート', value: 'song' },
                { name: 'キューリピート', value: 'queue' }
            )
    );

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

    const modeKey = interaction.options.getString('mode', true);
    const mode = MODE_MAP[modeKey];

    try {
        const newMode = queue.setRepeatMode(mode);
        await refreshNowPlayingPanel(queue);
        return interaction.reply(`🔁 リピートモードを **${REPEAT_MODE_LABEL[newMode]}** に設定しました。`);
    } catch (err) {
        console.error('[ERROR] /loop 実行エラー:', err);
        return interaction.reply({ content: '❌ リピートモードの設定に失敗しました。', ephemeral: true });
    }
}