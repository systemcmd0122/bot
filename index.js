import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Client, Collection, GatewayIntentBits, InteractionType } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { fileURLToPath } from 'url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Express Server Setup for Keep-Alive ---
const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Health check endpoints
app.get('/ping', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (_req, res) => {
    const isReady = client.isReady();
    const health = {
        status: isReady ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        bot_status: client.ws.status
    };
    // To prevent deployment failure on Koyeb due to 503 errors during health checks,
    // we return 200 OK even if the bot is still connecting (degraded status).
    res.status(200).json(health);
});

app.get('/', (_req, res) => {
    res.status(200).send('Discord Bot is running!');
});

// --- Keep-Alive Function ---
function keepAlive() {
    const PING_INTERVAL = 2 * 60 * 1000; // 2分ごと
    const appUrl = process.env.APP_URL;

    if (!appUrl) {
        console.warn('[WARNING] APP_URLが設定されていません。Keep-alive機能は無効になります。');
        console.warn('[INFO] Koyebでスリープを防ぐには、.envにAPP_URL=https://your-app.koyeb.app を設定してください。');
        return;
    }

    setInterval(async () => {
        try {
            const url = appUrl.endsWith('/ping') ? appUrl : `${appUrl}/ping`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Discord-Bot-KeepAlive/1.0' }
            });

            clearTimeout(timeout);

            if (response.ok) {
                console.log(`[Keep-Alive] ✓ Ping successful to ${url}. Status: ${response.status}`);
            } else {
                console.error(`[Keep-Alive] ✗ Ping failed to ${url}. Status: ${response.status}`);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error(`[Keep-Alive] ✗ Timeout pinging ${appUrl}`);
            } else {
                console.error(`[Keep-Alive] ✗ Error pinging ${appUrl}:`, error.message);
            }
        }
    }, PING_INTERVAL);

    console.log(`[Keep-Alive] Enabled. Pinging ${appUrl} every 2 minutes.`);
}

// --- Environment Variables Validation ---
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
    console.error('[ERROR] Missing required environment variables in .env file');
    console.error('Required: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
    process.exit(1);
}

// --- Command Deployment Function ---
async function deployCommands() {
    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    
    if (!fs.existsSync(commandsPath)) {
        console.log('[WARNING] Commands directory not found. Skipping command deployment.');
        return;
    }
    
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = await import(`file://${filePath}`);
            if (command.data) {
                commands.push(command.data.toJSON());
                console.log(`[INFO] Loaded command definition: ${command.data.name}`);
            }
        } catch (error) {
            console.error(`[ERROR] Failed to load command from ${file}:`, error);
        }
    }

    if (commands.length === 0) {
        console.log('[INFO] No commands to deploy.');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log(`[INFO] Started refreshing ${commands.length} application (/) commands.`);
        
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands },
        );
        
        console.log('[SUCCESS] Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('[ERROR] Failed to deploy commands:', error);
    }
}

// --- Client Setup ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildModeration,
    ]
});

// --- Command Loading ---
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
            const command = await import(`file://${filePath}`);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                console.log(`[INFO] Loaded command: ${command.data.name}`);
            } else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        } catch (error) {
            console.error(`[ERROR] Failed to load command from ${file}:`, error);
        }
    }
} else {
    console.log('[WARNING] Commands directory not found.');
}

// --- Dynamic Handler Loading ---
let handleButtonInteraction, handleCommandInteraction, handleBanMessage, initializeBanList;

const handlersPath = path.join(__dirname, 'handlers');
if (fs.existsSync(handlersPath)) {
    try {
        const buttonHandlerPath = path.join(handlersPath, 'buttonHandler.js');
        if (fs.existsSync(buttonHandlerPath)) {
            const buttonHandler = await import(`file://${buttonHandlerPath}`);
            handleButtonInteraction = buttonHandler.handleButtonInteraction;
            console.log('[INFO] Loaded buttonHandler');
        }
        
        const commandHandlerPath = path.join(handlersPath, 'commandHandler.js');
        if (fs.existsSync(commandHandlerPath)) {
            const commandHandler = await import(`file://${commandHandlerPath}`);
            handleCommandInteraction = commandHandler.handleCommandInteraction;
            console.log('[INFO] Loaded commandHandler');
        }

        const banHandlerPath = path.join(handlersPath, 'banHandler.js');
        if (fs.existsSync(banHandlerPath)) {
            const banHandler = await import(`file://${banHandlerPath}`);
            handleBanMessage = banHandler.handleBanMessage;
            initializeBanList = banHandler.initializeBanList;
            console.log('[INFO] Loaded banHandler');
        }
    } catch (error) {
        console.error('[ERROR] Failed to load handlers:', error);
    }
}

// --- Bot Ready Event ---
client.once('ready', async () => {
    console.log('='.repeat(50));
    console.log(`[SUCCESS] Ready! Logged in as ${client.user.tag}`);
    console.log(`[INFO] Bot ID: ${client.user.id}`);
    console.log(`[INFO] Serving ${client.guilds.cache.size} guild(s)`);
    console.log('='.repeat(50));
    
    // Deploy commands on startup
    await deployCommands();

    // Initialize ban list
    if (initializeBanList) {
        console.log('[INFO] Initializing ban list...');
        await initializeBanList(client);
    }

    // Start keep-alive pinging
    keepAlive();
    
    console.log('[SUCCESS] Bot initialization complete!');
});

// --- Interaction Handler ---
client.on('interactionCreate', async interaction => {
    try {
        if (interaction.type === InteractionType.ApplicationCommand) {
            if (handleCommandInteraction) {
                await handleCommandInteraction(interaction);
            } else {
                console.error('[ERROR] commandHandler not loaded');
                await interaction.reply({ content: 'エラーが発生しました。', ephemeral: true });
            }
        } else if (interaction.isButton()) {
            if (handleButtonInteraction) {
                await handleButtonInteraction(interaction);
            } else {
                console.error('[ERROR] buttonHandler not loaded');
                await interaction.reply({ content: 'エラーが発生しました。', ephemeral: true });
            }
        }
    } catch (error) {
        console.error('[ERROR] Error handling interaction:', error);
        
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: 'エラーが発生しました。', 
                ephemeral: true
            }).catch(console.error);
        }
    }
});

// --- Message Handler ---
client.on('messageCreate', async message => {
    if (handleBanMessage) {
        try {
            await handleBanMessage(message);
        } catch (error) {
            console.error('[ERROR] Error handling ban message:', error);
        }
    }
});

// --- Error Handling ---
client.on('error', error => {
    console.error('[ERROR] Client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('[ERROR] Unhandled promise rejection:', error);
});

process.on('SIGINT', () => {
    console.log('\n[INFO] Received SIGINT. Shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[INFO] Received SIGTERM. Shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

// --- Start Express Server ---
app.listen(PORT, () => {
    console.log(`[SUCCESS] Web server started on port ${PORT}`);
    console.log(`[INFO] Health check available at http://localhost:${PORT}/health`);
    console.log(`[INFO] Ping endpoint available at http://localhost:${PORT}/ping`);
});

// --- Login with Retry Mechanism ---
async function startBot() {
    console.log('[INFO] Starting bot...');
    try {
        await client.login(token);
    } catch (error) {
        console.error('[ERROR] Failed to login:', error.message);
        console.log('[INFO] Retrying in 30 seconds...');
        setTimeout(startBot, 30000);
    }
}

startBot();