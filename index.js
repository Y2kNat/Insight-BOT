// InsightBot - Bot de Sugestões para Discord
// Desenvolvido com discord.js v14
// Versão 3.5.0 - Sistema Completo com Auto-Setup e Blacklist

require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    Collection, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ChannelType,
    Events,
    ActivityType,
    PresenceUpdateStatus,
    PermissionsBitField,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    Colors
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ============================================
// CONFIGURAÇÕES INICIAIS
// ============================================

const TOKEN = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;

if (!TOKEN) {
    console.error('\x1b[31m❌ ERRO: TOKEN não definido no arquivo .env\x1b[0m');
    process.exit(1);
}

if (!OWNER_ID) {
    console.error('\x1b[31m❌ ERRO: OWNER_ID não definido no arquivo .env\x1b[0m');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
    ]
});

// ============================================
// COLLECTIONS PARA ARMAZENAMENTO
// ============================================

client.commands = new Collection();
client.cooldowns = new Collection();

// ============================================
// SISTEMA DE LOGS AVANÇADO
// ============================================

const LOGS_DIR = path.join(__dirname, 'logs');
const LOGS_FILE = path.join(LOGS_DIR, `bot_${new Date().toISOString().split('T')[0]}.log`);

if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const LogLevel = {
    INFO: { name: 'INFO', color: '\x1b[36m', emoji: '📘' },
    SUCCESS: { name: 'SUCCESS', color: '\x1b[32m', emoji: '✅' },
    ERROR: { name: 'ERROR', color: '\x1b[31m', emoji: '❌' },
    WARN: { name: 'WARN', color: '\x1b[33m', emoji: '⚠️' },
    DEBUG: { name: 'DEBUG', color: '\x1b[35m', emoji: '🔍' },
    COMMAND: { name: 'COMMAND', color: '\x1b[34m', emoji: '⌨️' },
    SUGGESTION: { name: 'SUGGESTION', color: '\x1b[95m', emoji: '💡' },
    GUILD: { name: 'GUILD', color: '\x1b[92m', emoji: '🌐' },
    APPROVAL: { name: 'APPROVAL', color: '\x1b[93m', emoji: '🔰' }
};

class Logger {
    static log(level, message, data = {}) {
        const timestamp = new Date().toLocaleString('pt-BR', { 
            timeZone: 'America/Sao_Paulo',
            hour12: false 
        });
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level.name,
            message,
            ...data
        };
        
        const consoleMessage = `${level.color}[${timestamp}] ${level.emoji} [${level.name}]\x1b[0m ${message}`;
        console.log(consoleMessage);
        
        if (Object.keys(data).length > 0) {
            console.log(`${level.color}   └─ Dados:\x1b[0m`, data);
        }
        
        const fileLine = `[${logEntry.timestamp}] [${level.name}] ${message} ${JSON.stringify(data)}\n`;
        try {
            fs.appendFileSync(LOGS_FILE, fileLine);
        } catch (e) {}
    }
    
    static info(msg, data = {}) { this.log(LogLevel.INFO, msg, data); }
    static success(msg, data = {}) { this.log(LogLevel.SUCCESS, msg, data); }
    static error(msg, data = {}) { this.log(LogLevel.ERROR, msg, data); }
    static warn(msg, data = {}) { this.log(LogLevel.WARN, msg, data); }
    static debug(msg, data = {}) { this.log(LogLevel.DEBUG, msg, data); }
    static command(msg, data = {}) { this.log(LogLevel.COMMAND, msg, data); }
    static suggestion(msg, data = {}) { this.log(LogLevel.SUGGESTION, msg, data); }
    static guild(msg, data = {}) { this.log(LogLevel.GUILD, msg, data); }
    static approval(msg, data = {}) { this.log(LogLevel.APPROVAL, msg, data); }
}

// ============================================
// SISTEMA DE BACKUP E BLACKLIST
// ============================================

const BACKUP_DIR = path.join(__dirname, 'backups');
const BLACKLIST_FILE = path.join(__dirname, 'blacklist.json');

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

let blacklist = [];

// Carregar blacklist
try {
    if (fs.existsSync(BLACKLIST_FILE)) {
        blacklist = JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
        Logger.success('Blacklist carregada', { count: blacklist.length });
    } else {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify([], null, 4));
        Logger.info('Novo arquivo de blacklist criado');
    }
} catch (error) {
    Logger.error('Erro ao carregar blacklist', { error: error.message });
    blacklist = [];
}

function saveBlacklist() {
    try {
        fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklist, null, 4));
    } catch (error) {
        Logger.error('Erro ao salvar blacklist', { error: error.message });
    }
}

// ============================================
// SISTEMA DE CONFIGURAÇÕES POR GUILD
// ============================================

function sanitizeGuildName(name) {
    return name.replace(/[\/\\:*?"<>|]/g, '-').trim() || 'Servidor';
}

function getGuildConfigDir(guildId, guildName) {
    const safeName = sanitizeGuildName(guildName);
    const dirName = `${safeName} ${guildId}`;
    const dirPath = path.join(__dirname, dirName);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
}

// Cache global
const guildConfigs = {};
const guildApprovalRoles = {};
const guildVotes = {};

// Funções de carregamento/salvamento por guild
function loadGuildConfig(guildId, guildName) {
    const dir = getGuildConfigDir(guildId, guildName);
    const filePath = path.join(dir, 'suggestions_config.json');
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        Logger.error(`Erro ao carregar config do servidor ${guildId}`, { error: error.message });
    }
    return {};
}

function saveGuildConfig(guildId, guildName, config) {
    const dir = getGuildConfigDir(guildId, guildName);
    const filePath = path.join(dir, 'suggestions_config.json');
    try {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 4));
    } catch (error) {
        Logger.error(`Erro ao salvar config do servidor ${guildId}`, { error: error.message });
    }
}

function loadGuildApprovalRoles(guildId, guildName) {
    const dir = getGuildConfigDir(guildId, guildName);
    const filePath = path.join(dir, 'approval_roles.json');
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        Logger.error(`Erro ao carregar approval roles do servidor ${guildId}`, { error: error.message });
    }
    return { roles: [] };
}

function saveGuildApprovalRoles(guildId, guildName, config) {
    const dir = getGuildConfigDir(guildId, guildName);
    const filePath = path.join(dir, 'approval_roles.json');
    try {
        fs.writeFileSync(filePath, JSON.stringify(config, null, 4));
    } catch (error) {
        Logger.error(`Erro ao salvar approval roles do servidor ${guildId}`, { error: error.message });
    }
}

function loadGuildVotes(guildId, guildName) {
    const dir = getGuildConfigDir(guildId, guildName);
    const filePath = path.join(dir, 'suggestion_votes.json');
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (error) {
        Logger.error(`Erro ao carregar votos do servidor ${guildId}`, { error: error.message });
    }
    return {};
}

function saveGuildVotes(guildId, guildName, votes) {
    const dir = getGuildConfigDir(guildId, guildName);
    const filePath = path.join(dir, 'suggestion_votes.json');
    try {
        fs.writeFileSync(filePath, JSON.stringify(votes, null, 4));
    } catch (error) {
        Logger.error(`Erro ao salvar votos do servidor ${guildId}`, { error: error.message });
    }
}

function getGuildSuggestionsConfig(guildId) {
    if (!guildConfigs[guildId]) {
        const guild = client.guilds.cache.get(guildId);
        const guildName = guild ? guild.name : guildId;
        guildConfigs[guildId] = loadGuildConfig(guildId, guildName);
    }
    return guildConfigs[guildId];
}

function setGuildSuggestionsConfig(guildId, config) {
    const guild = client.guilds.cache.get(guildId);
    const guildName = guild ? guild.name : guildId;
    guildConfigs[guildId] = config;
    saveGuildConfig(guildId, guildName, config);
}

function getGuildApprovalRoles(guildId) {
    if (!guildApprovalRoles[guildId]) {
        const guild = client.guilds.cache.get(guildId);
        const guildName = guild ? guild.name : guildId;
        guildApprovalRoles[guildId] = loadGuildApprovalRoles(guildId, guildName);
    }
    return guildApprovalRoles[guildId];
}

function setGuildApprovalRoles(guildId, config) {
    const guild = client.guilds.cache.get(guildId);
    const guildName = guild ? guild.name : guildId;
    guildApprovalRoles[guildId] = config;
    saveGuildApprovalRoles(guildId, guildName, config);
}

function getGuildVotes(guildId) {
    if (!guildVotes[guildId]) {
        const guild = client.guilds.cache.get(guildId);
        const guildName = guild ? guild.name : guildId;
        guildVotes[guildId] = loadGuildVotes(guildId, guildName);
    }
    return guildVotes[guildId];
}

function setGuildVotes(guildId, votes) {
    const guild = client.guilds.cache.get(guildId);
    const guildName = guild ? guild.name : guildId;
    guildVotes[guildId] = votes;
    saveGuildVotes(guildId, guildName, votes);
}
// ============================================
// FUNÇÕES DE BACKUP
// ============================================

function createBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUP_DIR, `config_backup_${timestamp}.json`);
        
        const fullConfig = {
            suggestions: Object.fromEntries(
                Object.keys(guildConfigs).map(id => [id, getGuildSuggestionsConfig(id)])
            ),
            approvalRoles: Object.fromEntries(
                Object.keys(guildApprovalRoles).map(id => [id, getGuildApprovalRoles(id)])
            ),
            votes: Object.fromEntries(
                Object.keys(guildVotes).map(id => [id, getGuildVotes(id)])
            )
        };
        
        fs.writeFileSync(backupFile, JSON.stringify(fullConfig, null, 4));
        Logger.success('Backup criado', { arquivo: path.basename(backupFile) });
        
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('config_backup_'))
            .sort()
            .reverse();
        
        if (files.length > 24) {
            files.slice(24).forEach(file => {
                fs.unlinkSync(path.join(BACKUP_DIR, file));
                Logger.debug('Backup antigo removido', { arquivo: file });
            });
        }
    } catch (error) {
        Logger.error('Erro ao criar backup', { error: error.message });
    }
}

// ============================================
// VERIFICAÇÃO DE PERMISSÃO DE APROVAÇÃO
// ============================================

function hasApprovalPermission(member) {
    if (!member) return false;
    
    if (member.id === OWNER_ID) return true;
    
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    
    const guildId = member.guild.id;
    const config = getGuildApprovalRoles(guildId);
    
    if (!config || !config.roles || config.roles.length === 0) {
        return false;
    }
    
    return member.roles.cache.some(role => config.roles.includes(role.id));
}

// ============================================
// UTILITÁRIOS
// ============================================

function isOwner(userId) {
    return userId === OWNER_ID;
}

function createSuccessEmbed(description) {
    return new EmbedBuilder()
        .setTitle('✅ Operação Bem-Sucedida')
        .setDescription(description)
        .setColor(Colors.Green)
        .setTimestamp()
        .setFooter({ text: 'InsightBot • Sistema de Sugestões' });
}

function createErrorEmbed(description) {
    return new EmbedBuilder()
        .setTitle('❌ Ops! Algo deu errado')
        .setDescription(description)
        .setColor(Colors.Red)
        .setTimestamp()
        .setFooter({ text: 'InsightBot • Sistema de Sugestões' });
}

function createWarningEmbed(description) {
    return new EmbedBuilder()
        .setTitle('⚠️ Atenção')
        .setDescription(description)
        .setColor(Colors.Yellow)
        .setTimestamp()
        .setFooter({ text: 'InsightBot • Sistema de Sugestões' });
}

function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`📋 ${title}`)
        .setDescription(description)
        .setColor(Colors.Blurple)
        .setTimestamp()
        .setFooter({ text: 'InsightBot • Sistema de Sugestões' });
}

function formatDate(date) {
    return new Date(date).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatUptime(ms) {
    const d = Math.floor(ms / 86400000);
    const h = Math.floor((ms % 86400000) / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    
    return parts.join(' ');
}

function paginate(items, page = 1, itemsPerPage = 10) {
    const start = (page - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return {
        items: items.slice(start, end),
        totalPages: Math.ceil(items.length / itemsPerPage),
        currentPage: page,
        total: items.length
    };
}

// ============================================
// SISTEMA DE SUGESTÕES AVANÇADO
// ============================================

const SUGGESTION_CATEGORIES = [
    { 
        label: '💡 Geral', 
        value: 'geral', 
        description: 'Sugestões gerais para o servidor',
        color: Colors.Blurple
    },
    { 
        label: '🤖 Bot', 
        value: 'bot', 
        description: 'Sugestões para melhorar o bot',
        color: Colors.Aqua
    },
    { 
        label: '🌐 Servidor', 
        value: 'servidor', 
        description: 'Melhorias na estrutura do servidor',
        color: Colors.Green
    },
    { 
        label: '🎉 Eventos', 
        value: 'eventos', 
        description: 'Ideias para eventos e atividades',
        color: Colors.Orange
    },
    { 
        label: '📢 Canais', 
        value: 'canais', 
        description: 'Novos canais ou reorganização',
        color: Colors.Purple
    },
    { 
        label: '🎨 Cargos', 
        value: 'cargos', 
        description: 'Sugestões sobre cargos e permissões',
        color: Colors.Fuchsia
    },
    { 
        label: '🎮 Diversão', 
        value: 'diversao', 
        description: 'Ideias para entretenimento',
        color: Colors.Gold
    },
    { 
        label: '📚 Conteúdo', 
        value: 'conteudo', 
        description: 'Canais de texto, tópicos, etc',
        color: Colors.Navy
    }
];

const STATUS_EMOJIS = {
    pending: { emoji: '⏳', label: 'Pendente', color: Colors.Grey },
    approved: { emoji: '✅', label: 'Aprovada', color: Colors.Green },
    rejected: { emoji: '❌', label: 'Rejeitada', color: Colors.Red },
    under_review: { emoji: '🔍', label: 'Em Análise', color: Colors.Yellow }
};

class SuggestionManager {
    constructor() {
        this.suggestions = new Map();
        this.userSuggestions = new Map();
    }
    
    addSuggestion(guildId, userId, content, category, attachment = null) {
        if (!this.userSuggestions.has(guildId)) {
            this.userSuggestions.set(guildId, new Map());
        }
        
        const guildSuggestions = this.userSuggestions.get(guildId);
        if (!guildSuggestions.has(userId)) {
            guildSuggestions.set(userId, []);
        }
        
        const userSugs = guildSuggestions.get(userId);
        const suggestionId = this.generateId();
        
        const suggestion = {
            id: suggestionId,
            userId: userId,
            content: content,
            category: category,
            attachment: attachment,
            timestamp: Date.now(),
            votes: { up: 0, down: 0 },
            voters: new Set(),
            status: 'pending',
            suggestionMessageId: null,
            approvalMessageId: null,
            channelId: null,
            reason: null,
            approvedBy: null,
            rejectedBy: null,
            reviewedBy: null
        };
        
        userSugs.push(suggestion);
        
        if (!this.suggestions.has(guildId)) {
            this.suggestions.set(guildId, new Map());
        }
        this.suggestions.get(guildId).set(suggestionId, suggestion);
        
        Logger.suggestion('Nova sugestão criada', { 
            guildId, 
            userId, 
            suggestionId, 
            category: category.label 
        });
        
        return suggestion;
    }
    
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }
    
    getSuggestion(guildId, suggestionId) {
        return this.suggestions.get(guildId)?.get(suggestionId);
    }
    
    updateSuggestionStatus(guildId, suggestionId, status, moderatorId, reason = null) {
        const suggestion = this.getSuggestion(guildId, suggestionId);
        if (suggestion) {
            suggestion.status = status;
            suggestion.reason = reason;
            
            if (status === 'approved') {
                suggestion.approvedBy = moderatorId;
            } else if (status === 'rejected') {
                suggestion.rejectedBy = moderatorId;
            } else if (status === 'under_review') {
                suggestion.reviewedBy = moderatorId;
            }
            
            Logger.approval('Status da sugestão atualizado', { 
                guildId, 
                suggestionId, 
                status,
                moderatorId,
                reason 
            });
            return true;
        }
        return false;
    }
    
    addVote(guildId, suggestionId, userId, voteType) {
        const suggestion = this.getSuggestion(guildId, suggestionId);
        if (!suggestion) return { success: false, error: 'Sugestão não encontrada' };
        
        if (suggestion.voters.has(userId)) {
            return { success: false, error: 'Você já votou nesta sugestão' };
        }
        
        if (voteType === 'up') {
            suggestion.votes.up++;
        } else {
            suggestion.votes.down++;
        }
        
        suggestion.voters.add(userId);
        return { success: true, votes: suggestion.votes };
    }
    
    removeVote(guildId, suggestionId, userId, voteType) {
        const suggestion = this.getSuggestion(guildId, suggestionId);
        if (!suggestion) return false;
        
        if (!suggestion.voters.has(userId)) return false;
        
        if (voteType === 'up') {
            suggestion.votes.up = Math.max(0, suggestion.votes.up - 1);
        } else {
            suggestion.votes.down = Math.max(0, suggestion.votes.down - 1);
        }
        
        suggestion.voters.delete(userId);
        return true;
    }
    
    getUserSuggestions(guildId, userId) {
        return this.userSuggestions.get(guildId)?.get(userId) || [];
    }
    
    getAllSuggestions(guildId, filter = {}) {
        const suggestions = [];
        const userSuggestions = this.userSuggestions.get(guildId);
        
        if (userSuggestions) {
            for (const userSugs of userSuggestions.values()) {
                for (const sug of userSugs) {
                    let include = true;
                    
                    if (filter.status && sug.status !== filter.status) include = false;
                    if (filter.category && sug.category.value !== filter.category) include = false;
                    if (filter.userId && sug.userId !== filter.userId) include = false;
                    
                    if (include) suggestions.push(sug);
                }
            }
        }
        
        return suggestions.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    deleteSuggestion(guildId, suggestionId) {
        const suggestion = this.getSuggestion(guildId, suggestionId);
        if (!suggestion) return false;
        
        this.suggestions.get(guildId).delete(suggestionId);
        
        const userSugs = this.userSuggestions.get(guildId)?.get(suggestion.userId);
        if (userSugs) {
            const index = userSugs.findIndex(s => s.id === suggestionId);
            if (index > -1) userSugs.splice(index, 1);
        }
        
        Logger.suggestion('Sugestão deletada', { guildId, suggestionId });
        return true;
    }
}

const suggestionManager = new SuggestionManager();
// ============================================
// FUNÇÃO PARA ATUALIZAR EMBEDS DE SUGESTÃO
// ============================================

async function updateSuggestionMessages(guild, suggestionId, status, moderator, reason = null) {
    const suggestion = suggestionManager.getSuggestion(guild.id, suggestionId);
    if (!suggestion) return;
    
    const config = getGuildSuggestionsConfig(guild.id);
    if (!config) return;
    
    const statusData = STATUS_EMOJIS[status] || STATUS_EMOJIS.pending;
    const category = SUGGESTION_CATEGORIES.find(c => c.value === suggestion.category.value) || SUGGESTION_CATEGORIES[0];
    
    // Atualizar mensagem no canal de recebimento
    if (suggestion.suggestionMessageId && config.receiveChannel) {
        try {
            const channel = guild.channels.cache.get(config.receiveChannel);
            if (channel) {
                const msg = await channel.messages.fetch(suggestion.suggestionMessageId);
                
                const updatedEmbed = new EmbedBuilder()
                    .setTitle(`${category.label} • Sugestão ${statusData.label}`)
                    .setDescription(suggestion.content)
                    .setColor(statusData.color)
                    .setAuthor({
                        name: `Sugestão de ${client.users.cache.get(suggestion.userId)?.tag || 'Usuário Desconhecido'}`,
                        iconURL: client.users.cache.get(suggestion.userId)?.displayAvatarURL({ dynamic: true })
                    })
                    .addFields([
                        { name: '📂 Categoria', value: category.label, inline: true },
                        { name: '🆔 ID', value: `\`${suggestion.id}\``, inline: true },
                        { name: '📊 Status', value: `${statusData.emoji} ${statusData.label}`, inline: true }
                    ])
                    .setTimestamp(suggestion.timestamp);
                
                if (moderator) {
                    updatedEmbed.addFields([
                        { 
                            name: status === 'approved' ? '✅ Aprovado por' : status === 'rejected' ? '❌ Rejeitado por' : '🔍 Em análise por', 
                            value: `${moderator.tag}`, 
                            inline: true 
                        }
                    ]);
                }
                
                if (reason) {
                    updatedEmbed.addFields([{ name: '📝 Motivo', value: reason, inline: false }]);
                }
                
                if (suggestion.attachment) {
                    updatedEmbed.setImage(suggestion.attachment);
                }
                
                await msg.edit({ embeds: [updatedEmbed] });
                
                if (status === 'approved' || status === 'rejected') {
                    await msg.reactions.removeAll().catch(() => {});
                }
            }
        } catch (e) {
            Logger.error('Erro ao atualizar mensagem de sugestão no canal de recebimento', { error: e.message });
        }
    }
    
    // Atualizar mensagem no canal de aprovação
    if (suggestion.approvalMessageId && config.approvalChannel) {
        try {
            const channel = guild.channels.cache.get(config.approvalChannel);
            if (channel) {
                const msg = await channel.messages.fetch(suggestion.approvalMessageId);
                const updatedEmbed = EmbedBuilder.from(msg.embeds[0]);
                updatedEmbed.setColor(statusData.color);
                
                const fields = updatedEmbed.data.fields || [];
                const statusField = fields.find(f => f.name === '📊 Status');
                if (statusField) statusField.value = `${statusData.emoji} ${statusData.label}`;
                
                updatedEmbed.setFields(fields);
                
                if (moderator) {
                    updatedEmbed.addFields([
                        { 
                            name: status === 'approved' ? '✅ Aprovado por' : status === 'rejected' ? '❌ Rejeitado por' : '🔍 Em análise por', 
                            value: moderator.tag, 
                            inline: true 
                        }
                    ]);
                }
                
                if (reason) {
                    updatedEmbed.addFields([{ name: '📝 Motivo', value: reason, inline: false }]);
                }
                
                if (status === 'approved' || status === 'rejected') {
                    await msg.edit({ embeds: [updatedEmbed], components: [] });
                } else {
                    await msg.edit({ embeds: [updatedEmbed], components: msg.components });
                }
            }
        } catch (e) {
            Logger.error('Erro ao atualizar mensagem de aprovação', { error: e.message });
        }
    }
    
    // Salvar votos no JSON se aprovado/rejeitado
    if (status === 'approved' || status === 'rejected') {
        const votes = getGuildVotes(guild.id);
        votes[suggestionId] = {
            up: suggestion.votes.up,
            down: suggestion.votes.down,
            status: status,
            processedAt: Date.now()
        };
        setGuildVotes(guild.id, votes);
        
        Logger.info('Votos salvos no histórico', { 
            guildId: guild.id, 
            suggestionId, 
            votes: suggestion.votes 
        });
    }
}

// ============================================
// EVENTOS DE REAÇÃO (VOTOS VINCULADOS)
// ============================================

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (user.bot) return;
    
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            Logger.error('Erro ao buscar reação parcial', { error: error.message });
            return;
        }
    }
    
    const message = reaction.message;
    const guild = message.guild;
    if (!guild) return;
    
    const config = getGuildSuggestionsConfig(guild.id);
    if (!config || message.channel.id !== config.receiveChannel) return;
    
    const emoji = reaction.emoji.name;
    let voteType = null;
    if (emoji === '👍') voteType = 'up';
    else if (emoji === '👎') voteType = 'down';
    else return;
    
    const allSuggestions = suggestionManager.getAllSuggestions(guild.id);
    const suggestion = allSuggestions.find(s => s.suggestionMessageId === message.id);
    if (!suggestion) return;
    
    if (suggestion.status === 'approved' || suggestion.status === 'rejected') {
        await reaction.users.remove(user.id).catch(() => {});
        return;
    }
    
    const result = suggestionManager.addVote(guild.id, suggestion.id, user.id, voteType);
    if (result.success) {
        Logger.debug('Voto adicionado via reação', { 
            userId: user.id, 
            suggestionId: suggestion.id, 
            voteType,
            currentVotes: result.votes 
        });
    }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
    if (user.bot) return;
    
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            Logger.error('Erro ao buscar reação parcial na remoção', { error: error.message });
            return;
        }
    }
    
    const message = reaction.message;
    const guild = message.guild;
    if (!guild) return;
    
    const config = getGuildSuggestionsConfig(guild.id);
    if (!config || message.channel.id !== config.receiveChannel) return;
    
    const emoji = reaction.emoji.name;
    let voteType = null;
    if (emoji === '👍') voteType = 'up';
    else if (emoji === '👎') voteType = 'down';
    else return;
    
    const allSuggestions = suggestionManager.getAllSuggestions(guild.id);
    const suggestion = allSuggestions.find(s => s.suggestionMessageId === message.id);
    if (!suggestion) return;
    
    const removed = suggestionManager.removeVote(guild.id, suggestion.id, user.id, voteType);
    if (removed) {
        Logger.debug('Voto removido via reação', { 
            userId: user.id, 
            suggestionId: suggestion.id, 
            voteType 
        });
    }
});

// ============================================
// COMANDOS SLASH E INTERAÇÕES
// ============================================

client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const command = interaction.commandName;
        
        Logger.command('Slash command executado', {
            user: interaction.user.tag,
            command: command,
            guild: interaction.guild?.name
        });
        
        // ============================================
        // COMANDO: /setup
        // ============================================
        if (command === 'setup') {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Apenas administradores do servidor podem usar este comando.')],
                    ephemeral: true
                });
            }
            
            const guild = interaction.guild;
            const guildId = guild.id;
            
            // Verificar se já está configurado
            const existingConfig = getGuildSuggestionsConfig(guildId);
            if (existingConfig && existingConfig.receiveChannel && existingConfig.approvalChannel && existingConfig.suggestionsChannel) {
                const recChannel = guild.channels.cache.get(existingConfig.receiveChannel);
                const appChannel = guild.channels.cache.get(existingConfig.approvalChannel);
                const sugChannel = guild.channels.cache.get(existingConfig.suggestionsChannel);
                
                if (recChannel && appChannel && sugChannel) {
                    return interaction.reply({
                        embeds: [createWarningEmbed('O sistema já está configurado! Canais existentes:\n📨 ' + sugChannel.toString() + '\n💡 ' + recChannel.toString() + '\n🔰 ' + appChannel.toString())],
                        ephemeral: true
                    });
                }
            }
            
            await interaction.deferReply({ ephemeral: true });
            
            try {
                // Criar ou reutilizar categoria
                let category = guild.channels.cache.find(
                    c => c.type === ChannelType.GuildCategory && c.name === 'Sistema de Sugestões'
                );
                
                if (!category) {
                    category = await guild.channels.create({
                        name: 'Sistema de Sugestões',
                        type: ChannelType.GuildCategory,
                        permissionOverwrites: [
                            {
                                id: guild.roles.everyone,
                                allow: [PermissionsBitField.Flags.ViewChannel]
                            }
                        ]
                    });
                }
                
                // Criar ou reutilizar canal de sugestões (envio)
                let suggestionChannel = guild.channels.cache.find(
                    c => c.name === '📨-enviar-sugestão' && c.type === ChannelType.GuildText
                );
                
                if (!suggestionChannel) {
                    suggestionChannel = await guild.channels.create({
                        name: '📨-enviar-sugestão',
                        type: ChannelType.GuildText,
                        parent: category.id,
                        topic: 'Clique no botão abaixo ou use !sugerir para enviar sua sugestão!'
                    });
                }
                
                // Criar ou reutilizar canal de recebimento/votação
                let receiveChannel = guild.channels.cache.find(
                    c => c.name === '💡-sugestões' && c.type === ChannelType.GuildText
                );
                
                if (!receiveChannel) {
                    receiveChannel = await guild.channels.create({
                        name: '💡-sugestões',
                        type: ChannelType.GuildText,
                        parent: category.id,
                        topic: 'Sugestões da comunidade • Vote com 👍 ou 👎'
                    });
                }
                
                // Criar cargo de aprovador
                let approverRole = guild.roles.cache.find(r => r.name === 'Aprovador de Sugestões');
                
                if (!approverRole) {
                    approverRole = await guild.roles.create({
                        name: 'Aprovador de Sugestões',
                        color: Colors.Blurple,
                        reason: 'Cargo para aprovação de sugestões'
                    });
                }
                
                // Criar ou reutilizar canal de aprovação
                let approvalChannel = guild.channels.cache.find(
                    c => c.name === '🔰-aprovação' && c.type === ChannelType.GuildText
                );
                
                if (!approvalChannel) {
                    approvalChannel = await guild.channels.create({
                        name: '🔰-aprovação',
                        type: ChannelType.GuildText,
                        parent: category.id,
                        permissionOverwrites: [
                            {
                                id: guild.roles.everyone,
                                deny: [PermissionsBitField.Flags.ViewChannel]
                            },
                            {
                                id: approverRole.id,
                                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
                            }
                        ],
                        topic: 'Canal restrito para aprovação de sugestões'
                    });
                }
                
                // Salvar configurações
                const config = {
                    suggestionsChannel: suggestionChannel.id,
                    receiveChannel: receiveChannel.id,
                    approvalChannel: approvalChannel.id,
                    configuredAt: Date.now()
                };
                setGuildSuggestionsConfig(guildId, config);
                
                const approvalConfig = {
                    roles: [approverRole.id],
                    configuredAt: Date.now(),
                    configuredBy: interaction.user.id
                };
                setGuildApprovalRoles(guildId, approvalConfig);
                
                // Enviar mensagem inicial no canal de sugestões
                const welcomeEmbed = new EmbedBuilder()
                    .setTitle('💡 Sistema de Sugestões')
                    .setDescription('**Bem-vindo ao sistema de sugestões do InsightBot!**\n\nClique no botão abaixo para enviar sua sugestão.')
                    .setColor(Colors.Blurple)
                    .addFields([
                        { 
                            name: '📝 Como funciona?', 
                            value: '1. Clique em "Enviar Sugestão"\n2. Escolha uma categoria\n3. Descreva sua ideia\n4. Aguarde a votação da comunidade!' 
                        },
                        { 
                            name: '💡 Dica', 
                            value: 'Use `!sugerir <texto>` para enviar diretamente sem abrir o formulário!' 
                        }
                    ])
                    .setFooter({ text: 'InsightBot • Transformando ideias em realidade' });
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('send_suggestion')
                            .setLabel('Enviar Sugestão')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('💡')
                    );
                
                await suggestionChannel.send({ embeds: [welcomeEmbed], components: [row] });
                
                // Resposta final
                const setupEmbed = new EmbedBuilder()
                    .setTitle('✅ Sistema Configurado com Sucesso!')
                    .setDescription('O InsightBot está pronto para uso!')
                    .setColor(Colors.Green)
                    .addFields([
                        { name: '📨 Canal de Envio', value: suggestionChannel.toString(), inline: true },
                        { name: '💡 Canal de Sugestões', value: receiveChannel.toString(), inline: true },
                        { name: '🔰 Canal de Aprovação', value: approvalChannel.toString(), inline: true },
                        { name: '👥 Cargo Aprovador', value: approverRole.toString(), inline: true },
                        { name: '📝 Próximo Passo', value: 'Atribua o cargo ' + approverRole.toString() + ' aos membros que poderão aprovar/rejeitar sugestões.', inline: false }
                    ])
                    .setFooter({ text: 'InsightBot • Sistema de Sugestões' });
                
                await interaction.editReply({ embeds: [setupEmbed] });
                
                Logger.success('Sistema configurado via /setup', {
                    guildId,
                    adminId: interaction.user.id,
                    channels: {
                        suggestion: suggestionChannel.id,
                        receive: receiveChannel.id,
                        approval: approvalChannel.id
                    },
                    role: approverRole.id
                });
                
            } catch (error) {
                Logger.error('Erro ao configurar sistema via /setup', { error: error.message });
                await interaction.editReply({
                    embeds: [createErrorEmbed('Ocorreu um erro ao configurar o sistema. Verifique as permissões do bot.')]
                });
            }
        }
    }
    
    // ============================================
    // HANDLER PARA BOTÕES
    // ============================================
    if (interaction.isButton()) {
        const customId = interaction.customId;
        
        // Botão de enviar sugestão
        if (customId === 'send_suggestion') {
            const modal = new ModalBuilder()
                .setCustomId('suggestion_modal')
                .setTitle('📝 Enviar Nova Sugestão');
            
            const categoryInput = new TextInputBuilder()
                .setCustomId('category')
                .setLabel('Categoria (opcional)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('geral, bot, servidor, eventos, canais, cargos...')
                .setRequired(false)
                .setMaxLength(20);
            
            const contentInput = new TextInputBuilder()
                .setCustomId('content')
                .setLabel('Sua sugestão')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Descreva sua sugestão em detalhes...')
                .setMinLength(10)
                .setMaxLength(1000)
                .setRequired(true);
            
            const row1 = new ActionRowBuilder().addComponents(categoryInput);
            const row2 = new ActionRowBuilder().addComponents(contentInput);
            
            modal.addComponents(row1, row2);
            
            return interaction.showModal(modal);
        }
        
        // Botão de aprovar
        if (customId.startsWith('approve_')) {
            if (!hasApprovalPermission(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Você não tem permissão para aprovar sugestões.')],
                    ephemeral: true
                });
            }
            
            const suggestionId = customId.replace('approve_', '');
            
            const suggestion = suggestionManager.getSuggestion(interaction.guild.id, suggestionId);
            if (!suggestion) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Sugestão não encontrada.')],
                    ephemeral: true
                });
            }
            
            if (suggestion.status === 'approved' || suggestion.status === 'rejected') {
                return interaction.reply({
                    embeds: [createErrorEmbed('Esta sugestão já foi processada.')],
                    ephemeral: true
                });
            }
            
            const modal = new ModalBuilder()
                .setCustomId(`approve_modal_${suggestionId}`)
                .setTitle('✅ Aprovar Sugestão');
            
            const reasonInput = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Motivo da aprovação (opcional)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Explique por que esta sugestão foi aprovada...')
                .setMaxLength(500)
                .setRequired(false);
            
            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            
            return interaction.showModal(modal);
        }
        
        // Botão de rejeitar
        if (customId.startsWith('reject_')) {
            if (!hasApprovalPermission(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Você não tem permissão para rejeitar sugestões.')],
                    ephemeral: true
                });
            }
            
            const suggestionId = customId.replace('reject_', '');
            
            const suggestion = suggestionManager.getSuggestion(interaction.guild.id, suggestionId);
            if (!suggestion) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Sugestão não encontrada.')],
                    ephemeral: true
                });
            }
            
            if (suggestion.status === 'approved' || suggestion.status === 'rejected') {
                return interaction.reply({
                    embeds: [createErrorEmbed('Esta sugestão já foi processada.')],
                    ephemeral: true
                });
            }
            
            const modal = new ModalBuilder()
                .setCustomId(`reject_modal_${suggestionId}`)
                .setTitle('❌ Rejeitar Sugestão');
            
            const reasonInput = new TextInputBuilder()
                .setCustomId('reason')
                .setLabel('Motivo da rejeição')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Explique por que esta sugestão foi rejeitada...')
                .setMaxLength(500)
                .setRequired(true);
            
            modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
            
            return interaction.showModal(modal);
        }
        
        // Botão de em análise
        if (customId.startsWith('review_')) {
            if (!hasApprovalPermission(interaction.member)) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Você não tem permissão para colocar sugestões em análise.')],
                    ephemeral: true
                });
            }
            
            const suggestionId = customId.replace('review_', '');
            
            const suggestion = suggestionManager.getSuggestion(interaction.guild.id, suggestionId);
            if (!suggestion) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Sugestão não encontrada.')],
                    ephemeral: true
                });
            }
            
            if (suggestion.status === 'approved' || suggestion.status === 'rejected') {
                return interaction.reply({
                    embeds: [createErrorEmbed('Esta sugestão já foi processada.')],
                    ephemeral: true
                });
            }
            
            suggestionManager.updateSuggestionStatus(
                interaction.guild.id, 
                suggestionId, 
                'under_review',
                interaction.user.id
            );
            
            await updateSuggestionMessages(interaction.guild, suggestionId, 'under_review', interaction.user);
            
            Logger.approval('Sugestão colocada em análise', {
                guildId: interaction.guild.id,
                suggestionId,
                moderatorId: interaction.user.id
            });
            
            return interaction.reply({
                embeds: [createSuccessEmbed('🔍 Sugestão colocada em análise!')],
                ephemeral: true
            });
        }
        
        // Botões de confirmação para comandos internos
        if (customId.startsWith('confirm_blacklist_add_')) {
            if (interaction.user.id !== OWNER_ID) return;
            
            const targetId = customId.replace('confirm_blacklist_add_', '');
            
            if (!blacklist.includes(targetId)) {
                blacklist.push(targetId);
                saveBlacklist();
                
                const guild = client.guilds.cache.get(targetId);
                if (guild) {
                    await guild.leave();
                    Logger.warn(`Servidor ${guild.name} (${targetId}) removido após adicionar à blacklist.`);
                }
                
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Servidor Adicionado à Blacklist')
                    .setDescription(`O servidor ${targetId} foi adicionado com sucesso.`)
                    .setColor(Colors.Green);
                
                await interaction.update({ embeds: [successEmbed], components: [] });
            }
        }
        
        if (customId.startsWith('confirm_blacklist_remove_')) {
            if (interaction.user.id !== OWNER_ID) return;
            
            const targetId = customId.replace('confirm_blacklist_remove_', '');
            
            blacklist = blacklist.filter(id => id !== targetId);
            saveBlacklist();
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Servidor Removido da Blacklist')
                .setDescription(`O servidor ${targetId} foi removido com sucesso.`)
                .setColor(Colors.Green);
            
            await interaction.update({ embeds: [successEmbed], components: [] });
        }
        
        if (customId.startsWith('confirm_leave_')) {
            if (interaction.user.id !== OWNER_ID) return;
            
            const targetId = customId.replace('confirm_leave_', '');
            const guild = client.guilds.cache.get(targetId);
            
            if (guild) {
                await guild.leave();
                Logger.warn(`Bot saiu do servidor ${guild.name} (${guild.id}) por comando do owner.`);
                
                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Bot Retirado com Sucesso')
                    .setDescription(`O bot saiu do servidor **${guild.name}**.`)
                    .setColor(Colors.Green);
                
                await interaction.update({ embeds: [successEmbed], components: [] });
            }
        }
    }
    
    // ============================================
    // HANDLER PARA MODALS
    // ============================================
    if (interaction.isModalSubmit()) {
        // Modal de sugestão
        if (interaction.customId === 'suggestion_modal') {
            const content = interaction.fields.getTextInputValue('content');
            let categoryValue = interaction.fields.getTextInputValue('category')?.toLowerCase() || 'geral';
            
            const category = SUGGESTION_CATEGORIES.find(c => c.value === categoryValue) || SUGGESTION_CATEGORIES[0];
            
            const guildId = interaction.guild.id;
            const config = getGuildSuggestionsConfig(guildId);
            
            if (!config || !config.receiveChannel) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Sistema não configurado. Um administrador deve usar /setup.')],
                    ephemeral: true
                });
            }
            
            const suggestion = suggestionManager.addSuggestion(guildId, interaction.user.id, content, category);
            
            // Enviar para o canal de recebimento
            const receiveChannel = interaction.guild.channels.cache.get(config.receiveChannel);
            if (receiveChannel) {
                const suggestionEmbed = new EmbedBuilder()
                    .setTitle(`${category.label} • Nova Sugestão`)
                    .setDescription(content)
                    .setColor(category.color)
                    .setAuthor({
                        name: interaction.user.tag,
                        iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                    })
                    .addFields([
                        { name: '📂 Categoria', value: category.label, inline: true },
                        { name: '🆔 ID', value: `\`${suggestion.id}\``, inline: true },
                        { name: '📊 Status', value: '⏳ Pendente', inline: true }
                    ])
                    .setTimestamp()
                    .setFooter({ text: `ID: ${suggestion.id} • Vote usando reações` });
                
                const sentMessage = await receiveChannel.send({ embeds: [suggestionEmbed] });
                
                await sentMessage.react('👍');
                await sentMessage.react('👎');
                
                suggestion.suggestionMessageId = sentMessage.id;
                suggestion.channelId = receiveChannel.id;
            }
            
            // Enviar para o canal de aprovação
            if (config.approvalChannel) {
                const approvalChannel = interaction.guild.channels.cache.get(config.approvalChannel);
                if (approvalChannel) {
                    const approvalEmbed = new EmbedBuilder()
                        .setTitle(`🔰 Nova Sugestão para Aprovação`)
                        .setDescription(content)
                        .setColor(Colors.Blurple)
                        .setAuthor({
                            name: interaction.user.tag,
                            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                        })
                        .addFields([
                            { name: '📂 Categoria', value: category.label, inline: true },
                            { name: '🆔 ID', value: `\`${suggestion.id}\``, inline: true },
                            { name: '📊 Status', value: '⏳ Pendente', inline: true },
                            { name: '👤 Autor', value: `<@${interaction.user.id}>`, inline: true }
                        ])
                        .setTimestamp()
                        .setFooter({ text: `ID: ${suggestion.id}` });
                    
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`approve_${suggestion.id}`)
                                .setLabel('Aprovar')
                                .setStyle(ButtonStyle.Success)
                                .setEmoji('✅'),
                            new ButtonBuilder()
                                .setCustomId(`reject_${suggestion.id}`)
                                .setLabel('Rejeitar')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('❌'),
                            new ButtonBuilder()
                                .setCustomId(`review_${suggestion.id}`)
                                .setLabel('Em Análise')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('🔍')
                        );
                    
                    const approvalMessage = await approvalChannel.send({ 
                        embeds: [approvalEmbed], 
                        components: [row] 
                    });
                    
                    suggestion.approvalMessageId = approvalMessage.id;
                }
            }
            
            Logger.suggestion('Sugestão enviada via modal', {
                guildId,
                userId: interaction.user.id,
                suggestionId: suggestion.id
            });
            
            const confirmEmbed = new EmbedBuilder()
                .setTitle('✅ Sugestão Enviada!')
                .setDescription('Sua sugestão foi registrada com sucesso!')
                .setColor(Colors.Green)
                .addFields([
                    { name: '🆔 ID', value: `\`${suggestion.id}\``, inline: true },
                    { name: '📂 Categoria', value: category.label, inline: true }
                ])
                .setFooter({ text: 'Use !info ' + suggestion.id + ' para acompanhar' });
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: [confirmEmbed], ephemeral: true });
            } else {
                await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
            }
            
            return;
        }
        
        // Modal de aprovação
        if (interaction.customId.startsWith('approve_modal_')) {
            const suggestionId = interaction.customId.replace('approve_modal_', '');
            const reason = interaction.fields.getTextInputValue('reason') || 'Aprovada pela moderação';
            
            const suggestion = suggestionManager.getSuggestion(interaction.guild.id, suggestionId);
            if (!suggestion) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Sugestão não encontrada.')],
                    ephemeral: true
                });
            }
            
            suggestionManager.updateSuggestionStatus(
                interaction.guild.id, 
                suggestionId, 
                'approved',
                interaction.user.id,
                reason
            );
            
            await updateSuggestionMessages(interaction.guild, suggestionId, 'approved', interaction.user, reason);
            
            Logger.approval('Sugestão aprovada', {
                guildId: interaction.guild.id,
                suggestionId,
                moderatorId: interaction.user.id,
                reason
            });
            
            return interaction.reply({
                embeds: [createSuccessEmbed(`✅ Sugestão \`${suggestionId}\` aprovada com sucesso!`)],
                ephemeral: true
            });
        }
        
        // Modal de rejeição
        if (interaction.customId.startsWith('reject_modal_')) {
            const suggestionId = interaction.customId.replace('reject_modal_', '');
            const reason = interaction.fields.getTextInputValue('reason');
            
            const suggestion = suggestionManager.getSuggestion(interaction.guild.id, suggestionId);
            if (!suggestion) {
                return interaction.reply({
                    embeds: [createErrorEmbed('Sugestão não encontrada.')],
                    ephemeral: true
                });
            }
            
            suggestionManager.updateSuggestionStatus(
                interaction.guild.id, 
                suggestionId, 
                'rejected',
                interaction.user.id,
                reason
            );
            
            await updateSuggestionMessages(interaction.guild, suggestionId, 'rejected', interaction.user, reason);
            
            Logger.approval('Sugestão rejeitada', {
                guildId: interaction.guild.id,
                suggestionId,
                moderatorId: interaction.user.id,
                reason
            });
            
            return interaction.reply({
                embeds: [createSuccessEmbed(`❌ Sugestão \`${suggestionId}\` rejeitada com sucesso!`)],
                ephemeral: true
            });
        }
    }
});

// ============================================
// COMANDOS COM PREFIXO (!)
// ============================================

const prefixCooldowns = new Collection();
const PREFIX = '!';
const COOLDOWN_TIME = 3000;

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    Logger.command('Comando com prefixo executado', {
        user: message.author.tag,
        command: commandName,
        guild: message.guild?.name || 'DM'
    });
    
    // Sistema de cooldown (apenas para comandos públicos)
    if (!isOwner(message.author.id)) {
        if (prefixCooldowns.has(message.author.id)) {
            const cooldownExpiration = prefixCooldowns.get(message.author.id);
            if (Date.now() < cooldownExpiration) {
                const timeLeft = ((cooldownExpiration - Date.now()) / 1000).toFixed(1);
                return message.reply({
                    embeds: [createErrorEmbed(`⏰ Aguarde **${timeLeft} segundos** antes de usar outro comando.`)]
                });
            }
        }
        
        prefixCooldowns.set(message.author.id, Date.now() + COOLDOWN_TIME);
        setTimeout(() => prefixCooldowns.delete(message.author.id), COOLDOWN_TIME);
    }
    
    // ============================================
    // COMANDOS INTERNOS (APENAS OWNER)
    // ============================================
    
    // Comando !listservers
    if (commandName === 'listservers' && isOwner(message.author.id)) {
        const guildList = client.guilds.cache.map((g, i) => 
            `**${i + 1}.** ${g.name}\n└─ ID: \`${g.id}\` • 👥 ${g.memberCount} membros`
        ).join('\n\n') || 'Nenhum servidor.';
        
        const embed = new EmbedBuilder()
            .setTitle('🌐 Servidores do Bot')
            .setDescription(guildList)
            .setColor(Colors.Blurple)
            .setFooter({ text: `Total: ${client.guilds.cache.size} servidores` });
        
        return message.reply({ embeds: [embed] });
    }
    
    // Comando !blacklist (apenas exibir)
    if (commandName === 'blacklist' && !args[0] && isOwner(message.author.id)) {
        const list = blacklist.length > 0 
            ? blacklist.map((id, i) => `**${i + 1}.** \`${id}\` • ${client.guilds.cache.get(id)?.name || 'Desconhecido'}`).join('\n')
            : 'Nenhum servidor na blacklist.';
        
        const embed = new EmbedBuilder()
            .setTitle('🚫 Blacklist de Servidores')
            .setDescription(list)
            .setColor(Colors.Red)
            .setFooter({ text: `Total: ${blacklist.length} servidores` });
        
        return message.reply({ embeds: [embed] });
    }
    
    // Comando !blacklistadd <id>
    if (commandName === 'blacklistadd' && isOwner(message.author.id)) {
        const targetId = args[0];
        if (!targetId) {
            return message.reply({ embeds: [createErrorEmbed('Uso: `!blacklistadd <id_do_servidor>`')] });
        }
        
        if (blacklist.includes(targetId)) {
            return message.reply({ embeds: [createWarningEmbed('Esse servidor já está na blacklist.')] });
        }
        
        const guild = client.guilds.cache.get(targetId);
        const guildName = guild ? guild.name : 'Servidor desconhecido';
        
        const confirmEmbed = new EmbedBuilder()
            .setTitle('⚠️ Confirmar Blacklist')
            .setDescription(`**Deseja realmente adicionar o servidor abaixo à blacklist?**\n\n📛 **Nome:** ${guildName}\n🆔 **ID:** ${targetId}\n\nO bot sairá automaticamente se estiver nele.`)
            .setColor(Colors.Orange)
            .setFooter({ text: 'Você tem 15 segundos para confirmar.' });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_blacklist_add_${targetId}`)
                .setLabel('Confirmar Adição')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒')
        );
        
        const reply = await message.reply({ embeds: [confirmEmbed], components: [row] });
        
        const filter = (interaction) => interaction.customId === `confirm_blacklist_add_${targetId}` && interaction.user.id === OWNER_ID;
        const collector = reply.createMessageComponentCollector({ filter, time: 15000, max: 1 });
        
        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏰ Tempo Esgotado')
                    .setDescription('A confirmação expirou. Nenhuma ação foi realizada.')
                    .setColor(Colors.Grey);
                await reply.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
        
        return;
    }
    
    // Comando !blacklistremove <id>
    if (commandName === 'blacklistremove' && isOwner(message.author.id)) {
        const targetId = args[0];
        if (!targetId) {
            return message.reply({ embeds: [createErrorEmbed('Uso: `!blacklistremove <id_do_servidor>`')] });
        }
        
        if (!blacklist.includes(targetId)) {
            return message.reply({ embeds: [createWarningEmbed('Esse servidor não está na blacklist.')] });
        }
        
        const guild = client.guilds.cache.get(targetId);
        const guildName = guild ? guild.name : 'Servidor desconhecido';
        
        const confirmEmbed = new EmbedBuilder()
            .setTitle('⚠️ Confirmar Remoção da Blacklist')
            .setDescription(`**Deseja realmente remover o servidor abaixo da blacklist?**\n\n📛 **Nome:** ${guildName}\n🆔 **ID:** ${targetId}`)
            .setColor(Colors.Orange)
            .setFooter({ text: 'Você tem 15 segundos para confirmar.' });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_blacklist_remove_${targetId}`)
                .setLabel('Confirmar Remoção')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🔓')
        );
        
        const reply = await message.reply({ embeds: [confirmEmbed], components: [row] });
        
        const filter = (interaction) => interaction.customId === `confirm_blacklist_remove_${targetId}` && interaction.user.id === OWNER_ID;
        const collector = reply.createMessageComponentCollector({ filter, time: 15000, max: 1 });
        
        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏰ Tempo Esgotado')
                    .setDescription('A confirmação expirou. Nenhuma ação foi realizada.')
                    .setColor(Colors.Grey);
                await reply.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
        
        return;
    }
    
    // Comando !leave <id>
    if (commandName === 'leave' && isOwner(message.author.id)) {
        const targetId = args[0];
        if (!targetId) {
            return message.reply({ embeds: [createErrorEmbed('Uso: `!leave <id_do_servidor>`')] });
        }
        
        const guild = client.guilds.cache.get(targetId);
        if (!guild) {
            return message.reply({ embeds: [createErrorEmbed('Servidor não encontrado. O bot não está nesse servidor.')] });
        }
        
        const confirmEmbed = new EmbedBuilder()
            .setTitle('⚠️ Confirmar Saída do Servidor')
            .setDescription(`**Deseja realmente retirar o bot do servidor abaixo?**\n\n📛 **Nome:** ${guild.name}\n🆔 **ID:** ${guild.id}\n👥 **Membros:** ${guild.memberCount}`)
            .setColor(Colors.Orange)
            .setFooter({ text: 'Você tem 15 segundos para confirmar.' });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_leave_${guild.id}`)
                .setLabel('Sim, sair do servidor')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🚪')
        );
        
        const reply = await message.reply({ embeds: [confirmEmbed], components: [row] });
        
        const filter = (interaction) => interaction.customId === `confirm_leave_${guild.id}` && interaction.user.id === OWNER_ID;
        const collector = reply.createMessageComponentCollector({ filter, time: 15000, max: 1 });
        
        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && collected.size === 0) {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⏰ Tempo Esgotado')
                    .setDescription('A confirmação expirou. Nenhuma ação foi realizada.')
                    .setColor(Colors.Grey);
                await reply.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
        
        return;
    }
    
    // ============================================
    // COMANDO: !help / !ajuda / !comandos
    // ============================================
    if (['help', 'ajuda', 'comandos'].includes(commandName)) {
        const page = parseInt(args[0]) || 1;
        
        const helpPages = [
            new EmbedBuilder()
                .setTitle('📚 Central de Ajuda • Comandos Gerais')
                .setDescription('*Aqui estão todos os comandos disponíveis para você!*')
                .setColor(Colors.Blurple)
                .addFields([
                    {
                        name: '📌 **Comandos Básicos**',
                        value: '`!help` • Mostra esta mensagem\n`!ping` • Verifica a latência\n`!info` • Informações do bot\n`!invite` • Link para convidar\n`!uptime` • Tempo online do bot',
                        inline: false
                    },
                    {
                        name: '👤 **Comandos de Usuário**',
                        value: '`!avatar [@usuário]` • Mostra o avatar\n`!userinfo [@usuário]` • Informações do usuário\n`!serverinfo` • Informações do servidor',
                        inline: false
                    },
                    {
                        name: '💡 **Dica Rápida**',
                        value: 'Use `!help 2` para ver comandos de sugestões!',
                        inline: false
                    }
                ])
                .setFooter({ text: 'Página 1/4 • InsightBot' })
                .setTimestamp(),
            
            new EmbedBuilder()
                .setTitle('💡 Central de Ajuda • Sistema de Sugestões')
                .setDescription('*Envie e gerencie suas sugestões!*')
                .setColor(Colors.Aqua)
                .addFields([
                    {
                        name: '📝 **Enviar Sugestões**',
                        value: '`!sugerir <texto>` • Envia uma sugestão\n`!sugerircategoria <categoria> <texto>` • Envia com categoria',
                        inline: false
                    },
                    {
                        name: '📋 **Visualizar Sugestões**',
                        value: '`!sugestoes [filtro] [página]` • Lista todas\n`!minhassugestoes [página]` • Suas sugestões\n`!topsugestoes` • Mais votadas\n`!categorias` • Lista categorias',
                        inline: false
                    },
                    {
                        name: '📊 **Interagir**',
                        value: '`!votar <id> <up/down>` • Vota em uma sugestão\n`!info <id>` • Detalhes da sugestão',
                        inline: false
                    },
                    {
                        name: '📈 **Estatísticas**',
                        value: '`!stats` • Estatísticas gerais',
                        inline: false
                    }
                ])
                .setFooter({ text: 'Página 2/4 • InsightBot' })
                .setTimestamp(),
            
            new EmbedBuilder()
                .setTitle('🛡️ Central de Ajuda • Moderação')
                .setDescription('*Comandos para administradores e aprovadores*')
                .setColor(Colors.Orange)
                .addFields([
                    {
                        name: '✅ **Gerenciar Sugestões**',
                        value: 'Use os botões no canal de aprovação para:\n• ✅ Aprovar\n• ❌ Rejeitar\n• 🔍 Em Análise',
                        inline: false
                    },
                    {
                        name: '🧹 **Moderação de Chat**',
                        value: '`!clear <qtd>` • Limpa mensagens\n`!say <texto>` • Envia mensagem como bot\n`!poll <pergunta> | <opções>` • Cria enquete',
                        inline: false
                    },
                    {
                        name: '⚙️ **Configuração**',
                        value: '`!setup` • Guia de configuração\n`!config` • Ver configurações',
                        inline: false
                    }
                ])
                .setFooter({ text: 'Página 3/4 • InsightBot' })
                .setTimestamp(),
            
            new EmbedBuilder()
    .setTitle('🎮 Central de Ajuda • Diversos')
    .setDescription('*Comandos extras e utilitários*')
    .setColor(Colors.Purple)
    .addFields([
        {
            name: '⏰ **Utilidades**',
            value: '`!lembrete <tempo> <texto>` • Cria lembrete\n`!calcular <expressão>` • Calculadora',
            inline: false
        },
        {
            name: '📊 **Exemplos**',
            value: '`!sugerir Adicionar canal de música`\n`!votar abc123 up`\n`!lembrete 10m Reunião importante`\n`!poll Melhor dia? | Segunda | Quarta | Sexta`',
            inline: false
        },
        {
            name: '🔗 **Links Úteis**',
            value: '[🤖 Convidar Bot](https://discord.com/oauth2/authorize?client_id=1491182523177242754&scope=bot&permissions=8)\n[📜 Política de Privacidade](https://drive.google.com/uc?export=download&id=1nA4rINuqNBXu97BrR4ykdY4vPAfm-l-e)\n[📋 Termos de Uso](https://drive.google.com/uc?export=download&id=1s4S2ORSLX2UqvLfYFlhT9o64e3ZjLrwq)',
            inline: false
        }
    ])
    .setFooter({ text: 'Página 4/4 • InsightBot' })
    .setTimestamp()
];
        
        const embed = helpPages[page - 1] || helpPages[0];
        embed.setThumbnail(client.user.displayAvatarURL());
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============================================
    // COMANDO: !ping
    // ============================================
    if (commandName === 'ping') {
        const sent = await message.reply({ content: '🏓 Calculando latência...' });
        
        const pingEmbed = new EmbedBuilder()
            .setTitle('🏓 Pong!')
            .setDescription('**Latência da conexão:**')
            .setColor(Colors.Green)
            .addFields([
                { name: '📡 API Discord', value: `\`${client.ws.ping}ms\``, inline: true },
                { name: '💬 Mensagem', value: `\`${sent.createdTimestamp - message.createdTimestamp}ms\``, inline: true },
                { name: '⏱️ Uptime', value: `\`${formatUptime(client.uptime)}\``, inline: true }
            ])
            .setTimestamp()
            .setFooter({ text: 'InsightBot • Sistema Online' });
        
        return sent.edit({ content: null, embeds: [pingEmbed] });
    }
    
    // ============================================
    // COMANDO: !uptime
    // ============================================
    if (commandName === 'uptime') {
        const uptimeEmbed = new EmbedBuilder()
            .setTitle('⏰ Uptime do Bot')
            .setDescription(`**Online há:** ${formatUptime(client.uptime)}\n**Desde:** <t:${Math.floor((Date.now() - client.uptime) / 1000)}:F>`)
            .setColor(Colors.Blurple)
            .setTimestamp()
            .setFooter({ text: 'InsightBot • Sistema de Sugestões' });
        
        return message.reply({ embeds: [uptimeEmbed] });
    }
    
    // ============================================
    // COMANDO: !info / !botinfo (informações do bot)
    // ============================================
    if (['info', 'botinfo'].includes(commandName) && !args[0]) {
        const infoEmbed = new EmbedBuilder()
            .setTitle('🤖 InsightBot - Informações')
            .setDescription('Bot de sugestões inteligente para Discord')
            .setColor(Colors.Blurple)
            .addFields([
                {
                    name: '📊 Estatísticas',
                    value: `**Servidores:** ${client.guilds.cache.size}\n**Usuários:** ${client.users.cache.size}\n**Canais:** ${client.channels.cache.size}`,
                    inline: true
                },
                {
                    name: '⚙️ Versão',
                    value: `**Bot:** 3.5.0\n**Discord.js:** v14\n**Node.js:** ${process.version}`,
                    inline: true
                },
                {
                    name: '🕐 Uptime',
                    value: formatUptime(client.uptime),
                    inline: true
                },
                {
                    name: '👑 Desenvolvedor',
                    value: `<@${OWNER_ID}>`,
                    inline: true
                },
                {
                    name: '💾 Memória',
                    value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
                    inline: true
                }
            ])
            .setTimestamp()
            .setFooter({ text: 'InsightBot • Sistema de Sugestões' });
        
        return message.reply({ embeds: [infoEmbed] });
    }
    
    // ============================================
    // COMANDO: !invite / !convite
    // ============================================
    if (['invite', 'convite'].includes(commandName)) {
        const inviteEmbed = new EmbedBuilder()
            .setTitle('🔗 Convite do Bot')
            .setDescription('Convide o InsightBot para seu servidor!')
            .setColor(Colors.Blurple)
            .addFields([
                {
                    name: '🤖 Link de Convite',
                    value: '[Clique aqui para convidar](https://discord.com/oauth2/authorize?client_id=1491182523177242754&scope=bot&permissions=8)',
                    inline: false
                }
            ])
            .setTimestamp()
            .setFooter({ text: 'InsightBot • Sistema de Sugestões' });
        
        return message.reply({ embeds: [inviteEmbed] });
    }
    
    // ============================================
    // COMANDO: !avatar
    // ============================================
    if (commandName === 'avatar') {
        const user = message.mentions.users.first() || message.author;
        
        const avatarEmbed = new EmbedBuilder()
            .setTitle(`🖼️ Avatar de ${user.username}`)
            .setDescription(`Clique [aqui](${user.displayAvatarURL({ dynamic: true, size: 4096 })}) para baixar`)
            .setColor(Colors.Blurple)
            .setImage(user.displayAvatarURL({ dynamic: true, size: 4096 }))
            .setTimestamp()
            .setFooter({ text: 'InsightBot • Sistema de Sugestões' });
        
        return message.reply({ embeds: [avatarEmbed] });
    }
    
    // ============================================
    // COMANDO: !userinfo
    // ============================================
    if (commandName === 'userinfo') {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild.members.cache.get(user.id);
        
        const roles = member?.roles.cache
            .filter(r => r.id !== message.guild.id)
            .sort((a, b) => b.position - a.position)
            .map(r => r.toString())
            .join(', ') || 'Nenhum';
        
        const userInfoEmbed = new EmbedBuilder()
            .setTitle(`👤 Informações de ${user.username}`)
            .setColor(Colors.Blurple)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields([
                { name: '📝 Nome', value: user.tag, inline: true },
                { name: '🆔 ID', value: user.id, inline: true },
                { name: '🤖 Bot', value: user.bot ? 'Sim' : 'Não', inline: true },
                { name: '📅 Conta criada', value: formatDate(user.createdAt), inline: true },
                { name: '📥 Entrou no servidor', value: member ? formatDate(member.joinedAt) : 'N/A', inline: true },
                { name: '🎨 Cargos', value: roles.length > 1000 ? `${member?.roles.cache.size - 1} cargos` : roles, inline: false }
            ])
            .setTimestamp()
            .setFooter({ text: 'InsightBot • Sistema de Sugestões' });
        
        return message.reply({ embeds: [userInfoEmbed] });
    }
    
    // ============================================
    // COMANDO: !serverinfo
    // ============================================
    if (commandName === 'serverinfo') {
        const guild = message.guild;
        
        const serverInfoEmbed = new EmbedBuilder()
            .setTitle(`📊 Informações de ${guild.name}`)
            .setColor(Colors.Blurple)
            .addFields([
                { name: '👑 Dono', value: `<@${guild.ownerId}>`, inline: true },
                { name: '🆔 ID', value: guild.id, inline: true },
                { name: '📅 Criado em', value: formatDate(guild.createdAt), inline: true },
                { name: '👥 Membros', value: `${guild.memberCount}`, inline: true },
                { name: '💬 Canais', value: `${guild.channels.cache.size}`, inline: true },
                { name: '🎨 Cargos', value: `${guild.roles.cache.size}`, inline: true },
                { name: '😊 Emojis', value: `${guild.emojis.cache.size}`, inline: true },
                { name: '🔰 Boost', value: `Nível ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0})`, inline: true }
            ])
            .setTimestamp()
            .setFooter({ text: 'InsightBot • Sistema de Sugestões' });
        
        if (guild.iconURL()) {
            serverInfoEmbed.setThumbnail(guild.iconURL({ dynamic: true }));
        }
        
        return message.reply({ embeds: [serverInfoEmbed] });
    }
    
    // ============================================
    // COMANDO: !sugerir / !suggest / !sugestao
    // ============================================
    if (['sugerir', 'suggest', 'sugestao'].includes(commandName)) {
        const guildId = message.guild.id;
        const config = getGuildSuggestionsConfig(guildId);
        
        if (!config || !config.receiveChannel) {
            const setupEmbed = new EmbedBuilder()
                .setTitle('⚠️ Sistema Não Configurado')
                .setDescription('O sistema de sugestões ainda não foi configurado neste servidor!')
                .setColor(Colors.Yellow)
                .addFields([
                    { name: '🔧 Como configurar?', value: 'Um administrador deve usar `/setup` para ativar o sistema.' }
                ]);
            
            return message.reply({ embeds: [setupEmbed] });
        }
        
        const content = args.join(' ');
        if (!content) {
            return message.reply({
                embeds: [createErrorEmbed(
                    '**Por favor, escreva sua sugestão!**\n\n' +
                    '📝 **Exemplo:** `!sugerir Adicionar um canal de música`\n\n' +
                    '💡 **Dica:** Use `!categorias` para ver as categorias disponíveis.'
                )]
            });
        }
        
        if (content.length < 10 || content.length > 1000) {
            return message.reply({
                embeds: [createErrorEmbed('**Tamanho inválido!**\n\nSua sugestão deve ter entre **10** e **1000** caracteres.')]
            });
        }
        
        const attachment = message.attachments.first()?.url;
        const defaultCategory = SUGGESTION_CATEGORIES[0];
        const suggestion = suggestionManager.addSuggestion(guildId, message.author.id, content, defaultCategory, attachment);
        
        // Enviar para o canal de recebimento
        const receiveChannel = message.guild.channels.cache.get(config.receiveChannel);
        if (receiveChannel) {
            const suggestionEmbed = new EmbedBuilder()
                .setTitle(`${defaultCategory.label} • Nova Sugestão`)
                .setDescription(content)
                .setColor(defaultCategory.color)
                .setAuthor({
                    name: message.author.tag,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                })
                .addFields([
                    { name: '📂 Categoria', value: defaultCategory.label, inline: true },
                    { name: '🆔 ID', value: `\`${suggestion.id}\``, inline: true },
                    { name: '📊 Status', value: '⏳ Pendente', inline: true }
                ])
                .setTimestamp()
                .setFooter({ text: `ID: ${suggestion.id} • Vote usando reações` });
            
            if (attachment) {
                suggestionEmbed.setImage(attachment);
            }
            
            const sentMessage = await receiveChannel.send({ embeds: [suggestionEmbed] });
            
            await sentMessage.react('👍');
            await sentMessage.react('👎');
            
            suggestion.suggestionMessageId = sentMessage.id;
            suggestion.channelId = receiveChannel.id;
        }
        
        // Enviar para o canal de aprovação
        if (config.approvalChannel) {
            const approvalChannel = message.guild.channels.cache.get(config.approvalChannel);
            if (approvalChannel) {
                const approvalEmbed = new EmbedBuilder()
                    .setTitle(`🔰 Nova Sugestão para Aprovação`)
                    .setDescription(content)
                    .setColor(Colors.Blurple)
                    .setAuthor({
                        name: message.author.tag,
                        iconURL: message.author.displayAvatarURL({ dynamic: true })
                    })
                    .addFields([
                        { name: '📂 Categoria', value: defaultCategory.label, inline: true },
                        { name: '🆔 ID', value: `\`${suggestion.id}\``, inline: true },
                        { name: '👤 Autor', value: `<@${message.author.id}>`, inline: true }
                    ])
                    .setTimestamp()
                    .setFooter({ text: `ID: ${suggestion.id}` });
                
                if (attachment) {
                    approvalEmbed.setImage(attachment);
                }
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`approve_${suggestion.id}`)
                            .setLabel('Aprovar')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('✅'),
                        new ButtonBuilder()
                            .setCustomId(`reject_${suggestion.id}`)
                            .setLabel('Rejeitar')
                            .setStyle(ButtonStyle.Danger)
                            .setEmoji('❌'),
                        new ButtonBuilder()
                            .setCustomId(`review_${suggestion.id}`)
                            .setLabel('Em Análise')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🔍')
                    );
                
                const approvalMessage = await approvalChannel.send({ 
                    embeds: [approvalEmbed], 
                    components: [row] 
                });
                
                suggestion.approvalMessageId = approvalMessage.id;
            }
        }
        
        const confirmEmbed = new EmbedBuilder()
            .setTitle('✅ Sugestão Enviada com Sucesso!')
            .setDescription('Sua sugestão foi registrada e será analisada pela equipe.')
            .setColor(Colors.Green)
            .addFields([
                { name: '🆔 ID da Sugestão', value: `\`${suggestion.id}\``, inline: true },
                { name: '📂 Categoria', value: defaultCategory.label, inline: true },
                { name: '📊 Status', value: '⏳ Aguardando análise', inline: true }
            ])
            .setFooter({ text: 'Use !info ' + suggestion.id + ' para acompanhar' })
            .setTimestamp();
        
        return message.reply({ embeds: [confirmEmbed] });
    }
    
    // ============================================
    // COMANDO: !sugerircategoria
    // ============================================
    if (commandName === 'sugerircategoria') {
        const guildId = message.guild.id;
        const config = getGuildSuggestionsConfig(guildId);
        
        if (!config || !config.receiveChannel) {
            return message.reply({
                embeds: [createErrorEmbed('Sistema de sugestões não configurado.')]
            });
        }
        
        const categoryValue = args[0]?.toLowerCase();
        const category = SUGGESTION_CATEGORIES.find(c => c.value === categoryValue);
        
        if (!category) {
            const categoriesList = SUGGESTION_CATEGORIES.map(c => 
                `\`${c.value}\` • ${c.label}`
            ).join('\n');
            
            const embed = new EmbedBuilder()
                .setTitle('📂 Categorias Disponíveis')
                .setDescription('Escolha uma das categorias abaixo:')
                .setColor(Colors.Blurple)
                .addFields([{ name: 'Categorias', value: categoriesList }])
                .setFooter({ text: 'Exemplo: !sugerircategoria bot Adicionar novo comando' });
            
            return message.reply({ embeds: [embed] });
        }
        
        const content = args.slice(1).join(' ');
        if (!content || content.length < 10 || content.length > 1000) {
            return message.reply({
                embeds: [createErrorEmbed('Sugestão deve ter entre 10 e 1000 caracteres.')]
            });
        }
        
        const attachment = message.attachments.first()?.url;
        const suggestion = suggestionManager.addSuggestion(guildId, message.author.id, content, category, attachment);
        
        const receiveChannel = message.guild.channels.cache.get(config.receiveChannel);
        if (receiveChannel) {
            const suggestionEmbed = new EmbedBuilder()
                .setTitle(`${category.label} • Nova Sugestão`)
                .setDescription(content)
                .setColor(category.color)
                .setAuthor({
                    name: message.author.tag,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                })
                .addFields([
                    { name: '📂 Categoria', value: category.label, inline: true },
                    { name: '🆔 ID', value: `\`${suggestion.id}\``, inline: true },
                    { name: '📊 Status', value: '⏳ Pendente', inline: true }
                ])
                .setTimestamp()
                .setFooter({ text: `ID: ${suggestion.id} • Vote usando reações` });
            
            if (attachment) {
                suggestionEmbed.setImage(attachment);
            }
            
            const sentMessage = await receiveChannel.send({ embeds: [suggestionEmbed] });
            await sentMessage.react('👍');
            await sentMessage.react('👎');
            
            suggestion.suggestionMessageId = sentMessage.id;
            suggestion.channelId = receiveChannel.id;
        }
        
        if (config.approvalChannel) {
            const approvalChannel = message.guild.channels.cache.get(config.approvalChannel);
            if (approvalChannel) {
                const approvalEmbed = new EmbedBuilder()
                    .setTitle(`🔰 Nova Sugestão para Aprovação`)
                    .setDescription(content)
                    .setColor(Colors.Blurple)
                    .setAuthor({
                        name: message.author.tag,
                        iconURL: message.author.displayAvatarURL({ dynamic: true })
                    })
                    .addFields([
                        { name: '📂 Categoria', value: category.label, inline: true },
                        { name: '🆔 ID', value: `\`${suggestion.id}\``, inline: true },
                        { name: '👤 Autor', value: `<@${message.author.id}>`, inline: true }
                    ])
                    .setTimestamp();
                
                if (attachment) approvalEmbed.setImage(attachment);
                
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder().setCustomId(`approve_${suggestion.id}`).setLabel('Aprovar').setStyle(ButtonStyle.Success).setEmoji('✅'),
                        new ButtonBuilder().setCustomId(`reject_${suggestion.id}`).setLabel('Rejeitar').setStyle(ButtonStyle.Danger).setEmoji('❌'),
                        new ButtonBuilder().setCustomId(`review_${suggestion.id}`).setLabel('Em Análise').setStyle(ButtonStyle.Primary).setEmoji('🔍')
                    );
                
                const approvalMessage = await approvalChannel.send({ embeds: [approvalEmbed], components: [row] });
                suggestion.approvalMessageId = approvalMessage.id;
            }
        }
        
        return message.reply({
            embeds: [createSuccessEmbed(`Sugestão enviada!\n**ID:** \`${suggestion.id}\`\n**Categoria:** ${category.label}`)]
        });
    }
    
    // ============================================
    // COMANDO: !info (sugestão específica)
    // ============================================
    if (commandName === 'info' && args[0]) {
        const suggestionId = args[0];
        const suggestion = suggestionManager.getSuggestion(message.guild.id, suggestionId);
        
        if (!suggestion) {
            return message.reply({
                embeds: [createErrorEmbed(`**Sugestão não encontrada!**\n\nO ID \`${suggestionId}\` não corresponde a nenhuma sugestão.`)]
            });
        }
        
        const status = STATUS_EMOJIS[suggestion.status] || STATUS_EMOJIS.pending;
        const category = SUGGESTION_CATEGORIES.find(c => c.value === suggestion.category.value) || SUGGESTION_CATEGORIES[0];
        
        const embed = new EmbedBuilder()
            .setTitle(`${category.label} • Detalhes da Sugestão`)
            .setDescription(suggestion.content)
            .setColor(status.color)
            .setAuthor({
                name: `Sugestão de ${client.users.cache.get(suggestion.userId)?.tag || 'Usuário Desconhecido'}`,
                iconURL: client.users.cache.get(suggestion.userId)?.displayAvatarURL({ dynamic: true })
            })
            .addFields([
                { name: '🆔 ID', value: `\`${suggestion.id}\``, inline: true },
                { name: '📊 Status', value: `${status.emoji} ${status.label}`, inline: true },
                { name: '📂 Categoria', value: category.label, inline: true },
                { name: '📅 Enviada em', value: formatDate(suggestion.timestamp), inline: true },
                { name: '👍 Votos Positivos', value: `${suggestion.votes.up}`, inline: true },
                { name: '👎 Votos Negativos', value: `${suggestion.votes.down}`, inline: true },
                { name: '⭐ Score', value: `${suggestion.votes.up - suggestion.votes.down}`, inline: true }
            ])
            .setTimestamp(suggestion.timestamp);
        
        if (suggestion.reason) {
            embed.addFields([{ name: '📝 Motivo', value: suggestion.reason, inline: false }]);
        }
        
        if (suggestion.attachment) {
            embed.setImage(suggestion.attachment);
        }
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============================================
    // COMANDO: !votar
    // ============================================
    if (commandName === 'votar') {
        const suggestionId = args[0];
        const voteType = args[1]?.toLowerCase();
        
        if (!suggestionId || !voteType || !['up', 'down'].includes(voteType)) {
            return message.reply({
                embeds: [createErrorEmbed('**Uso correto:** `!votar <id> <up/down>`\n\n📝 Exemplo: `!votar abc123 up`')]
            });
        }
        
        const result = suggestionManager.addVote(message.guild.id, suggestionId, message.author.id, voteType);
        
        if (!result.success) {
            return message.reply({
                embeds: [createErrorEmbed(`**${result.error}**\n\nVocê já votou nesta sugestão ou ela não existe.`)]
            });
        }
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Voto Registrado!')
            .setDescription(`Seu voto foi contabilizado na sugestão \`${suggestionId}\`.`)
            .setColor(Colors.Green)
            .addFields([
                { name: '👍 Positivos', value: `${result.votes.up}`, inline: true },
                { name: '👎 Negativos', value: `${result.votes.down}`, inline: true }
            ]);
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============================================
    // COMANDO: !sugestoes / !listar
    // ============================================
    if (['sugestoes', 'listar'].includes(commandName)) {
        const filter = args[0]?.toLowerCase();
        const page = parseInt(args[1]) || 1;
        
        let suggestions = suggestionManager.getAllSuggestions(message.guild.id);
        
        const filterMap = {
            'pendentes': 'pending',
            'aprovadas': 'approved',
            'rejeitadas': 'rejected',
            'analise': 'under_review'
        };
        
        if (filter && filterMap[filter]) {
            suggestions = suggestions.filter(s => s.status === filterMap[filter]);
        }
        
        if (suggestions.length === 0) {
            return message.reply({
                embeds: [createInfoEmbed('Sugestões', '📭 Nenhuma sugestão encontrada com este filtro.')]
            });
        }
        
        const paginated = paginate(suggestions, page, 10);
        
        const suggestionsList = paginated.items.map((sug, i) => {
            const status = STATUS_EMOJIS[sug.status] || STATUS_EMOJIS.pending;
            return `**${(page - 1) * 10 + i + 1}.** ${sug.content.substring(0, 50)}${sug.content.length > 50 ? '...' : ''}\n└─ \`${sug.id}\` • ${status.emoji} ${status.label} • 👍 ${sug.votes.up} 👎 ${sug.votes.down}`;
        }).join('\n\n');
        
        const embed = new EmbedBuilder()
            .setTitle(`📋 Lista de Sugestões`)
            .setDescription(suggestionsList || 'Nenhuma sugestão')
            .setColor(Colors.Blurple)
            .addFields([
                { name: '📊 Filtro Atual', value: filter ? filter.charAt(0).toUpperCase() + filter.slice(1) : 'Todas', inline: true },
                { name: '📈 Total', value: `${suggestions.length} sugestões`, inline: true },
                { name: '📄 Página', value: `${paginated.currentPage}/${paginated.totalPages}`, inline: true }
            ])
            .setFooter({ text: 'Use !sugestoes [filtro] [página] • Filtros: pendentes, aprovadas, rejeitadas, analise' });
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============================================
    // COMANDO: !minhassugestoes / !mysuggestions
    // ============================================
    if (['minhassugestoes', 'mysuggestions'].includes(commandName)) {
        const page = parseInt(args[0]) || 1;
        const userSuggestions = suggestionManager.getUserSuggestions(message.guild.id, message.author.id);
        
        if (userSuggestions.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle('📝 Suas Sugestões')
                .setDescription('Você ainda não enviou nenhuma sugestão!')
                .setColor(Colors.Blurple)
                .addFields([
                    { 
                        name: '💡 Como enviar?', 
                        value: 'Use `!sugerir <sua ideia>` para enviar sua primeira sugestão!' 
                    }
                ]);
            
            return message.reply({ embeds: [embed] });
        }
        
        const paginated = paginate(userSuggestions.reverse(), page, 5);
        
        const suggestionsList = paginated.items.map((sug, i) => {
            const status = STATUS_EMOJIS[sug.status] || STATUS_EMOJIS.pending;
            return `**${(page - 1) * 5 + i + 1}.** ${sug.content.substring(0, 60)}${sug.content.length > 60 ? '...' : ''}\n└─ \`${sug.id}\` • ${status.emoji} ${status.label} • 👍 ${sug.votes.up} 👎 ${sug.votes.down}`;
        }).join('\n\n');
        
        const embed = new EmbedBuilder()
            .setTitle(`📝 Suas Sugestões`)
            .setDescription(suggestionsList)
            .setColor(Colors.Aqua)
            .setAuthor({
                name: message.author.tag,
                iconURL: message.author.displayAvatarURL({ dynamic: true })
            })
            .addFields([
                { name: '📊 Total', value: `${userSuggestions.length}`, inline: true },
                { name: '✅ Aprovadas', value: `${userSuggestions.filter(s => s.status === 'approved').length}`, inline: true },
                { name: '⏳ Pendentes', value: `${userSuggestions.filter(s => s.status === 'pending').length}`, inline: true }
            ])
            .setFooter({ text: `Página ${paginated.currentPage}/${paginated.totalPages}` });
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============================================
    // COMANDO: !categorias
    // ============================================
    if (commandName === 'categorias') {
        const categoriesList = SUGGESTION_CATEGORIES.map(cat => 
            `${cat.label}\n└─ \`${cat.value}\` • ${cat.description}`
        ).join('\n\n');
        
        const embed = new EmbedBuilder()
            .setTitle('📂 Categorias de Sugestões')
            .setDescription('Use estas categorias ao enviar sugestões com `!sugerircategoria`')
            .setColor(Colors.Blurple)
            .addFields([{ name: 'Categorias Disponíveis', value: categoriesList }])
            .setFooter({ text: 'Exemplo: !sugerircategoria bot Adicionar comando de música' });
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============================================
    // COMANDO: !topsugestoes / !top / !topsuggestions
    // ============================================
    if (['topsugestoes', 'topsuggestions', 'top'].includes(commandName)) {
        const allSuggestions = suggestionManager.getAllSuggestions(message.guild.id)
            .filter(s => s.status !== 'rejected');
        
        if (allSuggestions.length === 0) {
            return message.reply({
                embeds: [createInfoEmbed('Top Sugestões', '📭 Nenhuma sugestão disponível para ranking.')]
            });
        }
        
        const topSuggestions = allSuggestions
            .sort((a, b) => (b.votes.up - b.votes.down) - (a.votes.up - a.votes.down))
            .slice(0, 10);
        
        const topList = topSuggestions.map((sug, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}º`;
            return `${medal} ${sug.content.substring(0, 50)}${sug.content.length > 50 ? '...' : ''}\n└─ Score: **${sug.votes.up - sug.votes.down}** (👍 ${sug.votes.up} 👎 ${sug.votes.down}) • \`${sug.id}\``;
        }).join('\n\n');
        
        const embed = new EmbedBuilder()
            .setTitle('🏆 Top 10 Sugestões')
            .setDescription('As sugestões mais bem votadas do servidor!')
            .setColor(Colors.Gold)
            .addFields([{ name: '📊 Ranking', value: topList || 'Nenhuma sugestão' }])
            .setFooter({ text: 'Vote nas sugestões usando !votar <id> <up/down>' });
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============================================
    // COMANDO: !stats / !estatisticas
    // ============================================
    if (['stats', 'estatisticas'].includes(commandName)) {
        const allSuggestions = suggestionManager.getAllSuggestions(message.guild.id);
        
        const stats = {
            total: allSuggestions.length,
            pending: allSuggestions.filter(s => s.status === 'pending').length,
            approved: allSuggestions.filter(s => s.status === 'approved').length,
            rejected: allSuggestions.filter(s => s.status === 'rejected').length,
            under_review: allSuggestions.filter(s => s.status === 'under_review').length,
            upvotes: allSuggestions.reduce((sum, s) => sum + s.votes.up, 0),
            downvotes: allSuggestions.reduce((sum, s) => sum + s.votes.down, 0)
        };
        
        const topCategory = SUGGESTION_CATEGORIES.map(cat => ({
            label: cat.label,
            count: allSuggestions.filter(s => s.category.value === cat.value).length
        })).sort((a, b) => b.count - a.count)[0];
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 Estatísticas • ${message.guild.name}`)
            .setDescription('Estatísticas do sistema de sugestões')
            .setColor(Colors.Blurple)
            .setThumbnail(message.guild.iconURL({ dynamic: true }))
            .addFields([
                { name: '💡 Total', value: `${stats.total}`, inline: true },
                { name: '⏳ Pendentes', value: `${stats.pending}`, inline: true },
                { name: '🔍 Em Análise', value: `${stats.under_review}`, inline: true },
                { name: '✅ Aprovadas', value: `${stats.approved}`, inline: true },
                { name: '❌ Rejeitadas', value: `${stats.rejected}`, inline: true },
                { name: '👍 Votos Positivos', value: `${stats.upvotes}`, inline: true },
                { name: '👎 Votos Negativos', value: `${stats.downvotes}`, inline: true },
                { name: '📂 Categoria Top', value: topCategory ? `${topCategory.label} (${topCategory.count})` : 'N/A', inline: true }
            ])
            .setTimestamp();
        
        return message.reply({ embeds: [embed] });
    }
    
    // ============================================
    // COMANDO: !clear / !limpar
    // ============================================
    if (['clear', 'limpar'].includes(commandName)) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                embeds: [createErrorEmbed('Você precisa da permissão `Gerenciar Mensagens`.')]
            });
        }
        
        const amount = parseInt(args[0]);
        
        if (!amount || amount < 1 || amount > 100) {
            return message.reply({
                embeds: [createErrorEmbed('**Uso correto:** `!clear <1-100>`')]
            });
        }
        
        await message.delete().catch(() => {});
        
        const messages = await message.channel.bulkDelete(amount, true);
        
        const reply = await message.channel.send({
            embeds: [createSuccessEmbed(`🧹 **${messages.size}** mensagens foram deletadas!`)]
        });
        
        setTimeout(() => reply.delete().catch(() => {}), 5000);
    }
    
    // ============================================
    // COMANDO: !poll / !enquete
    // ============================================
    if (['poll', 'enquete'].includes(commandName)) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                embeds: [createErrorEmbed('Você precisa da permissão `Gerenciar Mensagens`.')]
            });
        }
        
        const fullText = args.join(' ');
        const parts = fullText.split('|').map(p => p.trim());
        
        const question = parts[0];
        const options = parts.slice(1);
        
        if (!question || options.length < 2 || options.length > 10) {
            return message.reply({
                embeds: [createErrorEmbed('**Uso correto:** `!poll [pergunta] | [opção1] | [opção2] | ...`\nMáximo 10 opções.')]
            });
        }
        
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        
        const optionsText = options.map((opt, i) => `${emojis[i]} ${opt}`).join('\n\n');
        
        const pollEmbed = new EmbedBuilder()
            .setTitle('📊 Enquete')
            .setDescription(`**${question}**\n\n${optionsText}`)
            .setColor(Colors.Purple)
            .setAuthor({
                name: message.author.tag,
                iconURL: message.author.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp()
            .setFooter({ text: 'Reaja para votar!' });
        
        await message.delete().catch(() => {});
        
        const sent = await message.channel.send({ embeds: [pollEmbed] });
        
        for (let i = 0; i < options.length; i++) {
            await sent.react(emojis[i]).catch(() => {});
        }
    }
    
    // ============================================
    // COMANDO: !lembrete / !remind
    // ============================================
    if (['lembrete', 'remind'].includes(commandName)) {
        const timeStr = args[0];
        const reminderText = args.slice(1).join(' ');
        
        if (!timeStr || !reminderText) {
            return message.reply({
                embeds: [createErrorEmbed('**Uso correto:** `!lembrete <tempo> <texto>`\nExemplo: `!lembrete 10m Reunião importante`\nFormatos: 30s, 10m, 2h, 1d')]
            });
        }
        
        const timeMatch = timeStr.match(/^(\d+)([smhd])$/);
        if (!timeMatch) {
            return message.reply({
                embeds: [createErrorEmbed('Formato de tempo inválido. Use: 30s, 10m, 2h, 1d')]
            });
        }
        
        const amount = parseInt(timeMatch[1]);
        const unit = timeMatch[2];
        
        let ms = 0;
        let unitName = '';
        
        if (unit === 's') { ms = amount * 1000; unitName = 'segundos'; }
        else if (unit === 'm') { ms = amount * 60 * 1000; unitName = 'minutos'; }
        else if (unit === 'h') { ms = amount * 60 * 60 * 1000; unitName = 'horas'; }
        else if (unit === 'd') { ms = amount * 24 * 60 * 60 * 1000; unitName = 'dias'; }
        
        if (ms > 7 * 24 * 60 * 60 * 1000) {
            return message.reply({
                embeds: [createErrorEmbed('Lembrete não pode ser maior que 7 dias.')]
            });
        }
        
        message.reply({
            embeds: [createSuccessEmbed(`⏰ Lembrete criado para daqui a **${amount} ${unitName}**!\n📝 **${reminderText}**`)]
        });
        
        setTimeout(async () => {
            const reminderEmbed = new EmbedBuilder()
                .setTitle('⏰ Lembrete!')
                .setDescription(`**${reminderText}**`)
                .setColor(Colors.Orange)
                .addFields([{ name: '⏱️ Criado há', value: `${amount} ${unitName} atrás` }])
                .setTimestamp();
            
            try {
                await message.author.send({ embeds: [reminderEmbed] });
            } catch (e) {
                await message.channel.send({
                    content: `<@${message.author.id}>`,
                    embeds: [reminderEmbed]
                });
            }
        }, ms);
    }
    
    // ============================================
    // COMANDO: !setup (guia informativo)
    // ============================================
    if (commandName === 'setup') {
        const config = getGuildSuggestionsConfig(message.guild.id);
        
        const setupEmbed = new EmbedBuilder()
            .setTitle('⚙️ Configuração do Sistema de Sugestões')
            .setDescription('O sistema de sugestões pode ser configurado de forma automática!')
            .setColor(Colors.Blurple)
            .addFields([
                { name: '🔧 Como configurar?', value: 'Um **Administrador** deve usar o comando **`/setup`** para configurar tudo automaticamente.\n\nO bot criará:\n📨 Canal de envio\n💡 Canal de sugestões\n🔰 Canal de aprovação\n👥 Cargo de aprovador', inline: false },
                { name: '📊 Status Atual', value: config?.receiveChannel ? '✅ Sistema configurado' : '❌ Sistema não configurado', inline: false }
            ])
            .setFooter({ text: 'Apenas administradores podem usar /setup.' });
        
        return message.reply({ embeds: [setupEmbed] });
    }
    
    // ============================================
    // COMANDO: !config
    // ============================================
    if (commandName === 'config') {
        const config = getGuildSuggestionsConfig(message.guild.id);
        const approvalConfig = getGuildApprovalRoles(message.guild.id);
        
        if (!config || !config.receiveChannel) {
            return message.reply({
                embeds: [createInfoEmbed('Configurações', '❌ Sistema não configurado. Um administrador deve usar `/setup`.')]
            });
        }
        
        const configEmbed = new EmbedBuilder()
            .setTitle('⚙️ Configurações Atuais')
            .setColor(Colors.Blurple)
            .addFields([
                { name: '📨 Canal de Envio', value: config.suggestionsChannel ? `<#${config.suggestionsChannel}>` : '❌ Não configurado', inline: true },
                { name: '💡 Canal de Sugestões', value: config.receiveChannel ? `<#${config.receiveChannel}>` : '❌ Não configurado', inline: true },
                { name: '🔰 Canal de Aprovação', value: config.approvalChannel ? `<#${config.approvalChannel}>` : '❌ Não configurado', inline: true },
                { name: '👥 Cargos de Aprovação', value: approvalConfig?.roles?.length ? `${approvalConfig.roles.length} cargo(s) configurado(s)` : '❌ Nenhum', inline: true },
                { name: '⚙️ Status', value: config.receiveChannel && config.approvalChannel ? '✅ Completo' : '⚠️ Incompleto', inline: true }
            ]);
        
        return message.reply({ embeds: [configEmbed] });
    }
});

// ============================================
// MENU INTERATIVO DO CONSOLE
// ============================================

class ConsoleMenu {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }
    
    async showMenu() {
        console.clear();
        console.log('\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[36m║\x1b[0m                    \x1b[33m🌟 INSIGHTBOT - CONSOLE 🌟\x1b[0m                    \x1b[36m║\x1b[0m');
        console.log('\x1b[36m╠══════════════════════════════════════════════════════════════╣\x1b[0m');
        console.log('\x1b[36m║\x1b[0m  \x1b[32m1.\x1b[0m 📊 Ver Estatísticas                                          \x1b[36m║\x1b[0m');
        console.log('\x1b[36m║\x1b[0m  \x1b[32m2.\x1b[0m 🌐 Listar Servidores                                          \x1b[36m║\x1b[0m');
        console.log('\x1b[36m║\x1b[0m  \x1b[32m3.\x1b[0m 💡 Ver Sugestões Recentes                                      \x1b[36m║\x1b[0m');
        console.log('\x1b[36m║\x1b[0m  \x1b[32m4.\x1b[0m 📁 Ver Logs de Hoje                                            \x1b[36m║\x1b[0m');
        console.log('\x1b[36m║\x1b[0m  \x1b[32m5.\x1b[0m 💾 Criar Backup Manual                                         \x1b[36m║\x1b[0m');
        console.log('\x1b[36m║\x1b[0m  \x1b[32m6.\x1b[0m 🔄 Recarregar Configurações                                    \x1b[36m║\x1b[0m');
        console.log('\x1b[36m║\x1b[0m  \x1b[32m7.\x1b[0m 🧹 Limpar Console                                              \x1b[36m║\x1b[0m');
        console.log('\x1b[36m║\x1b[0m  \x1b[32m0.\x1b[0m \x1b[31m🚪 Sair do Menu\x1b[0m                                               \x1b[36m║\x1b[0m');
        console.log('\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
        console.log('');
    }
    
    async start() {
        this.rl.on('line', async (input) => {
            switch(input.trim()) {
                case '1':
                    console.log('\n\x1b[33m═══════════════════════════════════════════\x1b[0m');
                    console.log('\x1b[32m📊 ESTATÍSTICAS DO BOT\x1b[0m');
                    console.log(`\x1b[36m🤖 Bot:\x1b[0m ${client.user?.tag || 'Carregando...'}`);
                    console.log(`\x1b[36m📡 Ping:\x1b[0m ${client.ws.ping}ms`);
                    console.log(`\x1b[36m⏰ Uptime:\x1b[0m ${formatUptime(client.uptime)}`);
                    console.log(`\x1b[36m🌐 Servidores:\x1b[0m ${client.guilds.cache.size}`);
                    console.log(`\x1b[36m👥 Usuários:\x1b[0m ${client.users.cache.size}`);
                    console.log(`\x1b[36m💾 Memória:\x1b[0m ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
                    console.log('\x1b[33m═══════════════════════════════════════════\x1b[0m\n');
                    break;
                case '2':
                    console.log('\n\x1b[33m═══════════════════════════════════════════\x1b[0m');
                    console.log('\x1b[32m🌐 SERVIDORES CONECTADOS\x1b[0m');
                    client.guilds.cache.forEach((guild, index) => {
                        console.log(`\x1b[36m${index + 1}.\x1b[0m \x1b[33m${guild.name}\x1b[0m`);
                        console.log(`   └─ ID: ${guild.id} | Membros: ${guild.memberCount}`);
                    });
                    console.log('\x1b[33m═══════════════════════════════════════════\x1b[0m\n');
                    break;
                case '3':
                    console.log('\n\x1b[33m═══════════════════════════════════════════\x1b[0m');
                    console.log('\x1b[32m💡 SUGESTÕES RECENTES\x1b[0m');
                    let found = false;
                    for (const [guildId, guild] of client.guilds.cache) {
                        const suggestions = suggestionManager.getAllSuggestions(guildId).slice(0, 5);
                        if (suggestions.length > 0) {
                            console.log(`\n\x1b[33m📍 ${guild.name}:\x1b[0m`);
                            suggestions.forEach((sug, i) => {
                                console.log(`   ${i + 1}. ${sug.content.substring(0, 50)}...`);
                                console.log(`      └─ ID: ${sug.id} | Status: ${sug.status} | 👍 ${sug.votes.up} 👎 ${sug.votes.down}`);
                            });
                            found = true;
                        }
                    }
                    if (!found) console.log('\x1b[33m   Nenhuma sugestão encontrada.\x1b[0m');
                    console.log('\x1b[33m═══════════════════════════════════════════\x1b[0m\n');
                    break;
                case '4':
                    console.log('\n\x1b[33m═══════════════════════════════════════════\x1b[0m');
                    console.log('\x1b[32m📁 LOGS DE HOJE (ÚLTIMAS 20 LINHAS)\x1b[0m');
                    try {
                        const logs = fs.readFileSync(LOGS_FILE, 'utf8').split('\n').slice(-20);
                        logs.forEach(line => {
                            if (line.trim()) {
                                if (line.includes('[ERROR]')) console.log('\x1b[31m' + line + '\x1b[0m');
                                else if (line.includes('[SUCCESS]')) console.log('\x1b[32m' + line + '\x1b[0m');
                                else if (line.includes('[WARN]')) console.log('\x1b[33m' + line + '\x1b[0m');
                                else console.log(line);
                            }
                        });
                    } catch (error) {
                        console.log('\x1b[31m   Erro ao ler logs: ' + error.message + '\x1b[0m');
                    }
                    console.log('\x1b[33m═══════════════════════════════════════════\x1b[0m\n');
                    break;
                case '5':
                    createBackup();
                    Logger.success('Backup manual criado com sucesso!');
                    break;
                case '6':
                    try {
                        for (const guildId of Object.keys(guildConfigs)) {
                            const guild = client.guilds.cache.get(guildId);
                            const guildName = guild ? guild.name : guildId;
                            guildConfigs[guildId] = loadGuildConfig(guildId, guildName);
                            guildApprovalRoles[guildId] = loadGuildApprovalRoles(guildId, guildName);
                            guildVotes[guildId] = loadGuildVotes(guildId, guildName);
                        }
                        Logger.success('Configurações recarregadas com sucesso!');
                    } catch (error) {
                        Logger.error('Erro ao recarregar configurações', { error: error.message });
                    }
                    break;
                case '7':
                    console.clear();
                    await this.showMenu();
                    break;
                case '0':
                    console.log('\x1b[33m👋 Saindo do menu interativo...\x1b[0m');
                    this.rl.close();
                    break;
                default:
                    console.log('\x1b[31m❌ Opção inválida! Digite um número de 0-7.\x1b[0m');
            }
            process.stdout.write('\x1b[36mInsightBot > \x1b[0m');
        });
        
        await this.showMenu();
        process.stdout.write('\x1b[36mInsightBot > \x1b[0m');
    }
}

// ============================================
// EVENTOS DO BOT
// ============================================

client.once(Events.ClientReady, async () => {
    console.clear();
    console.log('\x1b[36m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[36m║\x1b[0m                    \x1b[33m🌟 INSIGHTBOT ONLINE 🌟\x1b[0m                      \x1b[36m║\x1b[0m');
    console.log('\x1b[36m╠══════════════════════════════════════════════════════════════╣\x1b[0m');
    console.log(`\x1b[36m║\x1b[0m  \x1b[32m🤖 Bot:\x1b[0m ${client.user.tag.padEnd(50)}\x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  \x1b[32m📡 Ping:\x1b[0m ${String(client.ws.ping).padEnd(48)}ms\x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  \x1b[32m🌐 Servidores:\x1b[0m ${String(client.guilds.cache.size).padEnd(43)}\x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  \x1b[32m👥 Usuários:\x1b[0m ${String(client.users.cache.size).padEnd(45)}\x1b[36m║\x1b[0m`);
    console.log('\x1b[36m╠══════════════════════════════════════════════════════════════╣\x1b[0m');
    console.log('\x1b[36m║\x1b[0m  \x1b[33m💡 Sistema de Sugestões Avançado - v3.5.0\x1b[0m                    \x1b[36m║\x1b[0m');
    console.log('\x1b[36m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
    console.log('');
    console.log('\x1b[32m✨ Bot iniciado com sucesso! Pressione qualquer tecla para abrir o menu...\x1b[0m');
    
    Logger.success('Bot iniciado com sucesso', {
        tag: client.user.tag,
        servers: client.guilds.cache.size,
        users: client.users.cache.size,
        ping: client.ws.ping
    });
    
    // Iniciar sistema de backup (a cada 1 hora)
    setInterval(() => {
        createBackup();
    }, 60 * 60 * 1000);
    
    // Criar primeiro backup
    createBackup();
    
    // Status do bot
    client.user.setPresence({
        activities: [{ name: '/setup • !help • Sistema de Sugestões', type: ActivityType.Watching }],
        status: PresenceUpdateStatus.Online
    });
    
    // Registrar comando slash único
    const commands = [
        {
            name: 'setup',
            description: 'Configura automaticamente o sistema de sugestões no servidor (apenas administradores)'
        }
    ];
    
    try {
        await client.application.commands.set(commands);
        Logger.success('Comando slash registrado', { count: commands.length });
    } catch (error) {
        Logger.error('Erro ao registrar comando slash', { error: error.message });
    }
    
    // Aguardar tecla para abrir menu do console
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => {
        process.stdin.setRawMode(false);
        const menu = new ConsoleMenu();
        menu.start();
    });
});

client.on(Events.GuildCreate, async (guild) => {
    Logger.guild('Entrou em novo servidor', { 
        guild: guild.name, 
        id: guild.id,
        members: guild.memberCount 
    });

    // Verificar blacklist
    if (blacklist.includes(guild.id)) {
        Logger.warn(`Servidor na blacklist: ${guild.name} (${guild.id}). Saindo automaticamente.`);
        await guild.leave();
        return;
    }

    // Enviar mensagem de boas-vindas
    try {
        const welcomeChannel = guild.channels.cache.find(
            ch => ch.type === ChannelType.GuildText && 
                  ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
        );

        if (welcomeChannel) {
            const ownerUser = await client.users.fetch(OWNER_ID).catch(() => null);
            const ownerMention = ownerUser ? `<@${OWNER_ID}> (${ownerUser.tag})` : `<@${OWNER_ID}>`;

            const welcomeEmbed = new EmbedBuilder()
                .setTitle('🤖 InsightBot Chegou!')
                .setDescription(
                    `Olá, **${guild.name}**! Sou o **InsightBot**, seu sistema completo de sugestões para Discord.\n\n` +
                    `Para começar a usar, um **Administrador** deve executar o comando **\`/setup\`** – eu mesmo crio toda a estrutura automaticamente!`
                )
                .setColor(Colors.Blurple)
                .addFields([
                    {
                        name: '⚙️ Próximo passo',
                        value: 'Use **`/setup`** e o sistema estará pronto em segundos.',
                        inline: false
                    },
                    {
                        name: '❓ Dúvidas ou bugs?',
                        value: `Entre em contato com ${ownerMention}.`,
                        inline: false
                    },
                    {
                        name: '🔗 **Links Úteis**',
                        value: '[📜 Política de Privacidade](https://drive.google.com/uc?export=download&id=1nA4rINuqNBXu97BrR4ykdY4vPAfm-l-e)\n[📋 Termos de Uso](https://drive.google.com/uc?export=download&id=1s4S2ORSLX2UqvLfYFlhT9o64e3ZjLrwq)',
                        inline: false
                    }
                ])
                .setFooter({ text: 'InsightBot • Transformando ideias em realidade' })
                .setTimestamp();

            await welcomeChannel.send({ embeds: [welcomeEmbed] });
            Logger.success(`Mensagem de boas-vindas enviada em ${guild.name} no canal #${welcomeChannel.name}`);
        } else {
            Logger.warn(`Não encontrei um canal de texto para enviar boas-vindas em ${guild.name}`);
        }
    } catch (error) {
        Logger.error('Erro ao enviar mensagem de boas-vindas', { error: error.message });
    }
});

client.on(Events.GuildDelete, (guild) => {
    Logger.guild('Removido de servidor', { guild: guild.name, id: guild.id });
    
    delete guildConfigs[guild.id];
    delete guildApprovalRoles[guild.id];
    delete guildVotes[guild.id];
});

client.on(Events.Error, (error) => {
    Logger.error('Erro no cliente Discord', { error: error.message });
});

process.on('unhandledRejection', (error) => {
    Logger.error('Erro não tratado (Promise)', { error: error.message, stack: error.stack });
});

process.on('uncaughtException', (error) => {
    Logger.error('Exceção não capturada', { error: error.message, stack: error.stack });
});

// ============================================
// INICIAR O BOT
// ============================================

Logger.info('Iniciando InsightBot v3.5.0...');

client.login(TOKEN).catch(error => {
    Logger.error('Erro fatal ao fazer login', { error: error.message });
    process.exit(1);
});