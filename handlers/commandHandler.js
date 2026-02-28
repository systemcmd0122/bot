// ==============================================
// handlers/commandHandler.js
// スラッシュコマンドの実行を管理するハンドラー
// ==============================================

export async function handleCommandInteraction(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`[ERROR] コマンドが見つかりません: ${interaction.commandName}`);
        await interaction.reply({
            content: 'エラー: このコマンドは存在しません。',
            ephemeral: true
        });
        return;
    }

    try {
        console.log(`[INFO] コマンド実行: /${interaction.commandName} | 実行者: ${interaction.user.tag} (${interaction.user.id})`);
        await command.execute(interaction);
    } catch (err) {
        console.error(`[ERROR] コマンド実行エラー (/${interaction.commandName}):`, err);

        const errorMessage = 'コマンド実行中にエラーが発生しました。しばらく後にもう一度お試しください。';

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, ephemeral: true });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (replyErr) {
            console.error('[ERROR] エラー返信にも失敗:', replyErr);
        }
    }
}