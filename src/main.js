require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const dataDir = path.join(__dirname, 'data');
const playerStatsPath = path.join(dataDir, 'playerStats.json');
const gamesPath = path.join(dataDir, 'games.json');
const diceStatsPath = path.join(dataDir, 'diceStats.json');
const bannerUrl = 'https://cdn.discordapp.com/attachments/1335679466835280017/1487252622045085726/Snorlax_Systems_2.png';

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

function loadJson(filePath, fallback) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
        return fallback;
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        console.error(`Failed to load ${filePath}:`, error);
        return fallback;
    }
}

function saveJson(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

let playerStats = loadJson(playerStatsPath, {});
let games = loadJson(gamesPath, []);
let diceStats = loadJson(diceStatsPath, {
    rolls: {
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
        7: 0,
        8: 0,
        9: 0,
        10: 0,
        11: 0,
        12: 0
    }
});

function ensurePlayer(user) {
    if (!playerStats[user.id]) {
        playerStats[user.id] = {
            username: user.username,
            gamesPlayed: 0,
            wins: 0,
            losses: 0,
            totalPlacement: 0,
            averagePlacement: 0,
            firstPlaceFinishes: 0,
            secondPlaceFinishes: 0,
            thirdPlaceFinishes: 0,
            fourthPlaceFinishes: 0,
            lastResult: null,
            lastPlayed: null
        };
    } else {
        playerStats[user.id].username = user.username;
    }
}

function updateAveragePlacement(stats) {
    stats.averagePlacement = stats.gamesPlayed > 0
        ? Number((stats.totalPlacement / stats.gamesPlayed).toFixed(2))
        : 0;
}

function placementLabel(placement) {
    const labels = {
        1: '1st',
        2: '2nd',
        3: '3rd',
        4: '4th'
    };

    return labels[placement] || `${placement}th`;
}

function getTotalRolls() {
    return Object.values(diceStats.rolls).reduce((sum, count) => sum + count, 0);
}

function getExpectedProbability(roll) {
    const probabilities = {
        2: 1 / 36,
        3: 2 / 36,
        4: 3 / 36,
        5: 4 / 36,
        6: 5 / 36,
        7: 6 / 36,
        8: 5 / 36,
        9: 4 / 36,
        10: 3 / 36,
        11: 2 / 36,
        12: 1 / 36
    };

    return probabilities[roll] || 0;
}

const commands = [
    new SlashCommandBuilder()
        .setName('dice')
        .setDescription('Record a Catan dice roll')
        .addIntegerOption(option =>
            option.setName('number')
                .setDescription('Dice roll total (2-12)')
                .setRequired(true)
                .setMinValue(2)
                .setMaxValue(12)
        ),

    new SlashCommandBuilder()
        .setName('dice-stats')
        .setDescription('Show Catan dice roll statistics'),

    new SlashCommandBuilder()
        .setName('catan-result')
        .setDescription('Record the final placements of a Catan game')
        .addUserOption(option =>
            option.setName('first')
                .setDescription('1st place player')
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName('second')
                .setDescription('2nd place player')
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName('third')
                .setDescription('3rd place player')
                .setRequired(true)
        )
        .addUserOption(option =>
            option.setName('fourth')
                .setDescription('4th place player')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('notes')
                .setDescription('Optional game notes')
                .setRequired(false)
        ),

    new SlashCommandBuilder()
        .setName('catan-stats')
        .setDescription('Show stats for a player')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The player to check')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('catan-leaderboard')
        .setDescription('Show the Catan leaderboard'),

    new SlashCommandBuilder()
        .setName('catan-history')
        .setDescription('Show recent recorded Catan games')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log('Registering global slash commands...');
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );
        console.log('Global slash commands registered.');
    } catch (error) {
        console.error('Command registration failed:', error);
    }
})();

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
        if (interaction.commandName === 'dice') {
            const roll = interaction.options.getInteger('number');

            diceStats.rolls[roll] += 1;
            saveJson(diceStatsPath, diceStats);

            return interaction.reply({
                content: `🎲 Recorded roll: **${roll}**`
            });
        }

        if (interaction.commandName === 'dice-stats') {
            const totalRolls = getTotalRolls();

            if (totalRolls === 0) {
                return interaction.reply({ content: 'No dice rolls recorded yet.' });
            }

            const lines = Object.entries(diceStats.rolls).map(([roll, count]) => {
                const expected = (getExpectedProbability(Number(roll)) * totalRolls).toFixed(1);
                const diff = (Number(count) - Number(expected)).toFixed(1);

                return `**${roll}** — Actual: **${count}** | Expected: **${expected}** | Diff: **${diff}**`;
            });

            const embed = new EmbedBuilder()
                .setTitle('🎲 Catan Dice Statistics')
                .setDescription(lines.join('\n'))
                .setColor('#f39c12')
                .setImage(bannerUrl);

            return interaction.reply({ embeds: [embed] });
        }

        if (interaction.commandName === 'catan-result') {
            const first = interaction.options.getUser('first');
            const second = interaction.options.getUser('second');
            const third = interaction.options.getUser('third');
            const fourth = interaction.options.getUser('fourth');
            const notes = interaction.options.getString('notes') || '';

            const players = [first, second, third, fourth].filter(Boolean);
            const uniqueIds = new Set(players.map(player => player.id));

            if (uniqueIds.size !== players.length) {
                return interaction.reply({
                    content: 'Each placement must be a different player.',
                    ephemeral: true
                });
            }

            if (players.length < 3) {
                return interaction.reply({
                    content: 'You need at least 3 players to record a game.',
                    ephemeral: true
                });
            }

            const placements = [
                { user: first, placement: 1 },
                { user: second, placement: 2 },
                { user: third, placement: 3 }
            ];

            if (fourth) {
                placements.push({ user: fourth, placement: 4 });
            }

            for (const entry of placements) {
                ensurePlayer(entry.user);

                const stats = playerStats[entry.user.id];
                stats.gamesPlayed += 1;
                stats.totalPlacement += entry.placement;
                stats.lastPlayed = new Date().toISOString();
                stats.lastResult = placementLabel(entry.placement);

                if (entry.placement === 1) {
                    stats.wins += 1;
                    stats.firstPlaceFinishes += 1;
                } else {
                    stats.losses += 1;

                    if (entry.placement === 2) stats.secondPlaceFinishes += 1;
                    if (entry.placement === 3) stats.thirdPlaceFinishes += 1;
                    if (entry.placement === 4) stats.fourthPlaceFinishes += 1;
                }

                updateAveragePlacement(stats);
            }

            games.push({
                timestamp: new Date().toISOString(),
                players: placements.map(entry => ({
                    id: entry.user.id,
                    username: entry.user.username,
                    placement: entry.placement
                })),
                notes
            });

            saveJson(playerStatsPath, playerStats);
            saveJson(gamesPath, games);

            const resultsText = placements
                .map(entry => `**${placementLabel(entry.placement)}** — ${entry.user.username}`)
                .join('\n');

            const embed = new EmbedBuilder()
                .setTitle('🏆 Catan Game Recorded')
                .setDescription(
                    `${resultsText}` +
                    (notes ? `\n\n**Notes:** ${notes}` : '')
                )
                .setColor('#3498db')
                .setImage(bannerUrl);

            return interaction.reply({ embeds: [embed] });
        }

        if (interaction.commandName === 'catan-stats') {
            const user = interaction.options.getUser('user');
            const stats = playerStats[user.id];

            if (!stats) {
                return interaction.reply({
                    content: `No stats found for **${user.username}**.`
                });
            }

            const winRate = stats.gamesPlayed > 0
                ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(1)
                : '0.0';

            const embed = new EmbedBuilder()
                .setTitle(`📊 Catan Stats: ${stats.username}`)
                .setDescription(
                    `🏆 Wins: **${stats.wins}**\n` +
                    `❌ Losses: **${stats.losses}**\n` +
                    `🎮 Games Played: **${stats.gamesPlayed}**\n` +
                    `📈 Win Rate: **${winRate}%**\n` +
                    `📍 Avg Placement: **${stats.averagePlacement}**\n\n` +
                    `🥇 1st: **${stats.firstPlaceFinishes}**\n` +
                    `🥈 2nd: **${stats.secondPlaceFinishes}**\n` +
                    `🥉 3rd: **${stats.thirdPlaceFinishes}**\n` +
                    `🏅 4th: **${stats.fourthPlaceFinishes}**\n\n` +
                    `🕒 Last Result: **${stats.lastResult || 'N/A'}**`
                )
                .setColor('#2ecc71')
                .setImage(bannerUrl);

            return interaction.reply({ embeds: [embed] });
        }

        if (interaction.commandName === 'catan-leaderboard') {
            const leaderboardArray = Object.entries(playerStats)
                .map(([id, stats]) => {
                    const winRate = stats.gamesPlayed > 0
                        ? Number(((stats.wins / stats.gamesPlayed) * 100).toFixed(1))
                        : 0;

                    return {
                        id,
                        ...stats,
                        winRate
                    };
                })
                .sort((a, b) => {
                    if (b.wins !== a.wins) return b.wins - a.wins;
                    if (a.averagePlacement !== b.averagePlacement) return a.averagePlacement - b.averagePlacement;
                    return b.winRate - a.winRate;
                })
                .slice(0, 10);

            if (leaderboardArray.length === 0) {
                return interaction.reply({ content: 'No Catan stats recorded yet.' });
            }

            const leaderboardText = leaderboardArray
                .map((player, index) =>
                    `**${index + 1}.** ${player.username} — 🏆 **${player.wins}** wins | ` +
                    `📍 **${player.averagePlacement}** avg place | ` +
                    `📈 **${player.winRate}%** WR`
                )
                .join('\n');

            const embed = new EmbedBuilder()
                .setTitle('🏆 Catan Leaderboard')
                .setDescription(leaderboardText)
                .setColor('#f1c40f')
                .setImage(bannerUrl);

            return interaction.reply({ embeds: [embed] });
        }

        if (interaction.commandName === 'catan-history') {
            const recentGames = games.slice(-5).reverse();

            if (recentGames.length === 0) {
                return interaction.reply({ content: 'No recorded Catan games yet.' });
            }

            const historyText = recentGames
                .map((game, index) => {
                    const placements = [...game.players]
                        .sort((a, b) => a.placement - b.placement)
                        .map(player => `${placementLabel(player.placement)}: ${player.username}`)
                        .join(' | ');

                    const notesText = game.notes ? `\nNotes: ${game.notes}` : '';
                    return `**Game ${index + 1}**\n${placements}${notesText}`;
                })
                .join('\n\n');

            const embed = new EmbedBuilder()
                .setTitle('🕘 Recent Catan Games')
                .setDescription(historyText)
                .setColor('#9b59b6')
                .setImage(bannerUrl);
                

            return interaction.reply({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Interaction error:', error);

        if (interaction.replied || interaction.deferred) {
            return interaction.followUp({
                content: 'Something went wrong.',
                ephemeral: true
            });
        }

        return interaction.reply({
            content: 'Something went wrong.',
            ephemeral: true
        });
    }
});

client.login(token);