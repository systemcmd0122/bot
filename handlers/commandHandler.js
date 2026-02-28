export async function handleCommandInteraction(interaction) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`[ERROR] No command matching ${interaction.commandName} was found.`);
        await interaction.reply({ 
            content: 'エラー: コマンドが見つかりません。', 
            ephemeral: true 
        });
        return;
    }

    try {
        const guildName = interaction.guild ? interaction.guild.name : 'DM';
        console.log(`[INFO] [${guildName}] Executing command: ${interaction.commandName} by ${interaction.user.tag} (${interaction.user.id})`);
        await command.execute(interaction);
    } catch (error) {
        console.error(`[ERROR] Error executing ${interaction.commandName} by ${interaction.user.tag} (${interaction.user.id}):`, error);
        
        const errorMessage = 'コマンド実行中にエラーが発生しました。詳細な情報はコンソールを確認してください。';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }
        } catch (innerError) {
            console.error('[ERROR] Failed to send error reply:', innerError);
        }
    }
}