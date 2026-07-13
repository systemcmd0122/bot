// ==============================================
// handlers/musicButtonHandler.js
// 再生パネルのボタン操作（customId: "music_" プレフィックス）を処理する
// 認証ボタン（verify_user_button）等、既存のボタンとは
// customIdのプレフィックスで完全に分離されているため競合しない。
// ==============================================

import {
    buildNowPlayingEmbed,
    buildNowPlayingComponents,
    buildDisabledComponents,
    buildQueueEmbed,
    REPEAT_MODE_LABEL
} from '../utils/musicUI.js';

/**
 * customIdが "music_" で始まるボタン操作かどうかを判定する
 */
export function isMusicButton(customId) {
    return typeof customId === 'string' && customId.startsWith('music_');
}

export async function handleMusicButtonInteraction(interaction) {
    const { customId } = interaction;
    const distube = interaction.client.distube;
    const queue = distube.getQueue(interaction.guildId);

    if (!queue) {
        return interaction.reply({
            content: '❌ 現在何も再生されていません。パネルは間もなく整理されます。',
            ephemeral: true
        });
    }

    const memberVoiceChannel = interaction.member.voice.channel;
    if (!memberVoiceChannel || memberVoiceChannel.id !== queue.voiceChannel.id) {
        return interaction.reply({
            content: `❌ この操作を行うには <#${queue.voiceChannel.id}> に参加している必要があります。`,
            ephemeral: true
        });
    }

    try {
        switch (customId) {
            case 'music_pauseresume':
                return await handlePauseResume(interaction, queue);
            case 'music_skip':
                return await handleSkip(interaction, queue);
            case 'music_stop':
                return await handleStop(interaction, queue);
            case 'music_shuffle':
                return await handleShuffle(interaction, queue);
            case 'music_loop':
                return await handleLoop(interaction, queue);
            case 'music_voldown':
                return await handleVolume(interaction, queue, -10);
            case 'music_volup':
                return await handleVolume(interaction, queue, 10);
            case 'music_queue':
                return await handleQueueView(interaction, queue);
            default:
                return interaction.reply({ content: '❌ 不明な操作です。', ephemeral: true });
        }
    } catch (err) {
        console.error(`[ERROR] 音楽パネル操作エラー (${customId}):`, err);
        const payload = { content: '❌ 操作に失敗しました。もう一度お試しください。', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload).catch(() => {});
        } else {
            await interaction.reply(payload).catch(() => {});
        }
    }
}

async function refreshPanel(interaction, queue) {
    const embed = buildNowPlayingEmbed(queue);
    const components = buildNowPlayingComponents(queue);
    return interaction.update({ embeds: [embed], components });
}

async function handlePauseResume(interaction, queue) {
    if (queue.paused) {
        queue.resume();
    } else {
        queue.pause();
    }
    return refreshPanel(interaction, queue);
}

async function handleSkip(interaction, queue) {
    const skippedSong = queue.songs[0];
    const disabledComponents = buildDisabledComponents(buildNowPlayingComponents(queue));

    if (queue.songs.length <= 1) {
        await queue.stop();
        return interaction.update({
            content: `⏭️ **${skippedSong.name}** をスキップしました。キューが空になったため終了しました。`,
            embeds: [],
            components: []
        });
    }

    await queue.skip();
    // 次の曲のパネルは playSong イベント側で新しいメッセージとして送信されるため、
    // このメッセージ（古いパネル）はボタンを無効化して誤操作を防ぐだけにする。
    return interaction.update({
        content: `⏭️ **${skippedSong.name}** をスキップしました。`,
        components: disabledComponents
    });
}

async function handleStop(interaction, queue) {
    const currentSong = queue.songs[0];
    await queue.stop();
    return interaction.update({
        content: `⏹️ **${currentSong.name}** の再生を停止し、キューをクリアしました。`,
        embeds: [],
        components: []
    });
}

async function handleShuffle(interaction, queue) {
    if (queue.songs.length <= 2) {
        return interaction.reply({ content: 'ℹ️ シャッフルするには曲が足りません。', ephemeral: true });
    }
    await queue.shuffle();
    return interaction.reply({ content: '🔀 キューをシャッフルしました。', ephemeral: true });
}

async function handleLoop(interaction, queue) {
    const nextMode = (queue.repeatMode + 1) % 3;
    queue.setRepeatMode(nextMode);
    await refreshPanel(interaction, queue);
    return interaction.followUp({
        content: `🔁 リピートモードを **${REPEAT_MODE_LABEL[nextMode]}** に設定しました。`,
        ephemeral: true
    }).catch(() => {});
}

async function handleVolume(interaction, queue, delta) {
    const newVolume = Math.min(100, Math.max(0, queue.volume + delta));
    queue.setVolume(newVolume);
    return refreshPanel(interaction, queue);
}

async function handleQueueView(interaction, queue) {
    const embed = buildQueueEmbed(queue);
    return interaction.reply({ embeds: [embed], ephemeral: true });
}