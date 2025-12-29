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
        console.log(`[INFO] Executing command: ${interaction.commandName} by ${interaction.user.tag}`);
        await command.execute(interaction);
    } catch (error) {
        console.error(`[ERROR] Error executing ${interaction.commandName}:`, error);
        
        const errorMessage = 'コマンド実行中にエラーが発生しました。';
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ 
                content: errorMessage, 
                ephemeral: true 
            }).catch(console.error);
        } else {
            await interaction.reply({ 
                content: errorMessage, 
                ephemeral: true 
            }).catch(console.error);
        }
    }
}