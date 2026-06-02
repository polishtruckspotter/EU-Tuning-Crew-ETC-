import "dotenv/config";
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const panelPassword = process.env.PANEL_PASSWORD || "etc-panel";
const defaultOwnerPassword = process.env.OWNER_PASSWORD || panelPassword;
const defaultAdminPassword = process.env.ADMIN_PASSWORD || "etc-admin";
const port = Number(process.env.BOT_PANEL_PORT || 10001);
const panelApiSecret = process.env.PANEL_API_SECRET || process.env.BOT_API_SECRET || "";
const sourceDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(sourceDir, "..", "..");
const dataDir = join(process.cwd(), "data");
const configPath = join(dataDir, "config.json");
const ticketsPath = join(dataDir, "tickets.json");
const warningsPath = join(dataDir, "warnings.json");
const sessions = new Map();
const modmailHomePrompted = new Set();
const noPingMuteMs = 1000 * 60 * 60 * 3;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const defaultConfig = {
  activityText: "EU Tuning Crew",
  statusReply: "ETC bot is online and ready.",
  pingReply: "Pong! {ping}ms",
  ownerPassword: defaultOwnerPassword,
  adminPassword: defaultAdminPassword,
  modmailGuildId: "",
  modmailCategoryId: "",
  modmailPanelChannelId: "",
  noPingStaffRoleId: "",
  rulesChannelId: "",
  modmailIntroText: "Welcome to ETC modmail. Press Open Modmail to start a modmail, send your message, and use =close when you are done.",
  modmailOpenedText: "Your ETC modmail is now open. Send your message here and the staff team will receive it.",
  modmailClosedText: "Your ETC modmail has been closed. If you need help again, press Open Modmail to reopen it.",

  welcomeJoinChannelId: "",
  welcomeEmbedTitle: "Welcome to ETC!",
  welcomeEmbedDescription: "Hey ${member}! Welcome to **EU Tuning Crew**.\n\nBe respectful, read the rules, and enjoy the convoys!",
  welcomeEmbedColor: "0x1ff2d2",
  welcomeEmbedImageUrl: "welcome message.png",

  pvModmailEnabled: false,
  pvDmEmbedTitle: "PV (DM)",
  pvDmEmbedDescription: "${content}",
  pvDmEmbedColor: "0x1ff2d2",
  pvDmEmbedImageUrl: "",

  pvServerEmbedTitle: "PV (Server)",
  pvServerEmbedDescription: "${content}",
  pvServerEmbedColor: "0x1ff2d2",
  pvServerEmbedImageUrl: "",

  // Ticket System
  ticketSystemEnabled: false,
  ticketCategoryId: "",
  ticketPanelChannelId: "",
  ticketIntroText: "Click the button below to create a support ticket.",

  // Auto-Moderation
  autoModEnabled: false,
  spamFilterEnabled: false,
  spamThreshold: 5,
  capsFilterEnabled: false,
  profanityFilterEnabled: false,
  inviteFilterEnabled: false,

  // Member Tracking
  memberTrackingEnabled: false,
  memberLogChannelId: "",

  // Leveling System
  levelingEnabled: false,
  levelAnnouncementChannelId: "",

  // Message Logging
  messageLoggingEnabled: false,
  messageLogChannelId: "",

  // Reaction Roles
  reactionRolesEnabled: false,

  // Voting/Polls
  votingEnabled: false
};

let botConfig = { ...defaultConfig };
let tickets = {};
let warnings = {};

const discordReady = Boolean(token && clientId);

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the ETC bot is online."),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show the current bot status."),
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Show the bot panel link."),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all available ETC bot commands and features."),
  new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Display the EU Tuning Crew server rules."),
  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Get information about the server or bot.")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("What information do you want?")
        .addChoices(
          { name: "Server Info", value: "server" },
          { name: "Bot Info", value: "bot" },
          { name: "ETC Info", value: "etc" }
        )
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("report")
    .setDescription("Report a user for rule violations.")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to report")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the report")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("modmail")
    .setDescription("Configure or post the ETC modmail panel.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("panel")
        .setDescription("Post the Open Modmail panel in a selected channel.")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel where the modmail panel should be posted. Uses saved panel channel if empty.")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    ),
  new SlashCommandBuilder()
    .setName("close")
    .setDescription("Close an ETC support flow.")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("modmail")
        .setDescription("Close this modmail and delete its channel.")
    ),
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Give a warning to a user.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to warn")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the warning")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to kick")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the kick")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to ban")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the ban")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a member for a specified duration.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("User to mute")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("duration")
        .setDescription("Duration (e.g., 1h, 30m, 1d)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for the mute")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("noping")
    .setDescription("Set up the ETC no-ping guard.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Choose the protected staff role for no-ping warns.")
        .addRoleOption((option) =>
          option
            .setName("role")
            .setDescription("Role that members should not ping.")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Show the current no-ping setup.")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Clear no-ping warns.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to clear warns for. Leave empty to clear all warns.")
            .setRequired(false)
        )
    ),
  new SlashCommandBuilder()
    .setName("clean")
    .setDescription("Clean ETC moderation data.")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("warn")
        .setDescription("Clean no-ping warns.")
        .addUserOption((option) =>
          option
            .setName("user")
            .setDescription("User to clean warns for. Leave empty to clean all warns.")
            .setRequired(false)
        )
    )
].map((command) => command.toJSON());

const rest = token ? new REST({ version: "10" }).setToken(token) : null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const openTicketRow = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId("modmail_open")
    .setLabel("Open Modmail")
    .setStyle(ButtonStyle.Success)
);

async function registerCommands() {
  if (!rest) return;
  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );
}

async function ensureDataFiles() {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  if (!existsSync(configPath)) {
    await writeFile(configPath, JSON.stringify(defaultConfig, null, 2), "utf8");
  }

  if (!existsSync(ticketsPath)) {
    await writeFile(ticketsPath, JSON.stringify({}, null, 2), "utf8");
  }

  if (!existsSync(warningsPath)) {
    await writeFile(warningsPath, JSON.stringify({}, null, 2), "utf8");
  }
}

async function loadConfig() {
  await ensureDataFiles();
  const file = await readFile(configPath, "utf8");
  const parsed = JSON.parse(file);
  botConfig = { ...defaultConfig, ...parsed };
  return botConfig;
}

async function saveConfig(nextConfig) {
  botConfig = { ...defaultConfig, ...nextConfig };
  await writeFile(configPath, JSON.stringify(botConfig, null, 2), "utf8");
  if (client.isReady()) {
    client.user.setActivity(botConfig.activityText);
  }
}

async function loadTickets() {
  await ensureDataFiles();
  const file = await readFile(ticketsPath, "utf8");
  tickets = JSON.parse(file || "{}");
  return tickets;
}

async function saveTickets() {
  await writeFile(ticketsPath, JSON.stringify(tickets, null, 2), "utf8");
}

async function loadWarnings() {
  await ensureDataFiles();
  const file = await readFile(warningsPath, "utf8");
  warnings = JSON.parse(file || "{}");
  return warnings;
}

async function saveWarnings() {
  await writeFile(warningsPath, JSON.stringify(warnings, null, 2), "utf8");
}

function getCookieValue(req, name) {
  const cookieHeader = req.headers.cookie || "";
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    if (!cookie) continue;
    const [key, ...rest] = cookie.split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

function getSession(req) {
  const sessionId = getCookieValue(req, "etc_panel_session");
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return null;
  }
  return { id: sessionId, ...session };
}

function isAuthenticated(req) {
  return Boolean(getSession(req));
}

function hasPanelAccess(req) {
  const session = getSession(req);
  return session?.role === "admin" || session?.role === "owner";
}

function isOwner(req) {
  return getSession(req)?.role === "owner";
}

function createSession(role) {
  const sessionId = randomBytes(24).toString("hex");
  sessions.set(sessionId, {
    role,
    expiresAt: Date.now() + 1000 * 60 * 60 * 12
  });
  return sessionId;
}

function normalizeModmailName(displayName) {
  return `modmail-${displayName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function getMemberDisplayName(guild, user) {
  const member = await guild.members.fetch(user.id).catch(() => null);
  return member?.displayName || user.globalName || user.displayName || user.username;
}

function getTicketByUserId(userId) {
  return tickets[userId] || null;
}

function getTicketByChannelId(channelId) {
  return Object.values(tickets).find((ticket) => ticket.channelId === channelId) || null;
}

function isModmailConfigured() {
  return Boolean(botConfig.modmailGuildId);
}

function getConfiguredGuildFromCache() {
  if (!botConfig.modmailGuildId || !client.isReady()) return null;
  return client.guilds.cache.get(botConfig.modmailGuildId) || null;
}

function renderTextChannelOptions(selectedChannelId = "") {
  const guild = getConfiguredGuildFromCache();
  const channels = guild
    ? [...guild.channels.cache.values()]
      .filter((channel) => channel.type === ChannelType.GuildText)
      .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const selectedIsLoaded = channels.some((channel) => channel.id === selectedChannelId);
  const fallbackOption = selectedChannelId && !selectedIsLoaded
    ? `<option value="${escapeHtml(selectedChannelId)}" selected>Saved channel (${escapeHtml(selectedChannelId)})</option>`
    : "";

  return [
    `<option value="">Select a text channel</option>`,
    fallbackOption,
    ...channels.map((channel) =>
      `<option value="${escapeHtml(channel.id)}"${channel.id === selectedChannelId ? " selected" : ""}>#${escapeHtml(channel.name)}</option>`
    )
  ].join("");
}

function formatMessageContent(message) {
  const parts = [];
  if (message.content?.trim()) {
    parts.push(message.content.trim());
  }
  if (message.attachments.size > 0) {
    const attachmentLines = [...message.attachments.values()].map((attachment) => attachment.url);
    parts.push(`Attachments:\n${attachmentLines.join("\n")}`);
  }
  return parts.join("\n\n").trim();
}

function parsePrefixCommand(message) {
  const text = message.content.trim();
  if (!text) return null;
  if (text.startsWith("=")) {
    return text.slice(1).trim().split(/\s+/);
  }
  if (text.startsWith("./")) {
    return text.slice(2).trim().split(/\s+/);
  }
  return null;
}

function findRulesChannel(guild) {
  if (!guild) return null;
  if (botConfig.rulesChannelId) {
    const configuredChannel = guild.channels.cache.get(botConfig.rulesChannelId);
    if (configuredChannel?.isTextBased()) return configuredChannel;
  }
  return guild.channels.cache.find((channel) =>
    channel.isTextBased() && /rules|reglas|normas|readme?/i.test(channel.name)
  ) || null;
}

async function handleTextCommand(message, commandParts) {
  const command = commandParts[0]?.toLowerCase();
  const args = commandParts.slice(1);
  if (!command) return false;

  const guild = message.guild;
  const channel = message.channel;

  if (command === "help") {
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("ETC Help")
          .setDescription("Use slash commands like /help, /rules, /info, and /modmail panel or text commands like =help, =rules, =info, and =close.")
          .addFields(
            { name: "Modmail", value: "DM the bot or use /modmail panel to post a modmail button.", inline: false },
            { name: "Rules", value: "Use /rules or =rules to jump to the rules channel.", inline: false },
            { name: "Close", value: "Use /close modmail or =close to close your support request.", inline: false }
          )
          .setColor(0x1ff2d2)
      ]
    });
    return true;
  }

  if (command === "rules") {
    const rulesChannel = findRulesChannel(guild);
    if (rulesChannel) {
      await message.reply({ content: `Please read the rules in ${rulesChannel}.` });
    } else if (guild) {
      await message.reply("Please ask staff for the rules channel or set rulesChannelId in the bot config.");
    } else {
      await message.reply("Use this command in your server to get the rules channel, or ask staff for help.");
    }
    return true;
  }

  if (command === "info") {
    const queryType = args[0]?.toLowerCase() || "server";
    const infoEmbed = new EmbedBuilder().setTitle("ETC Info").setColor(0x1ff2d2);

    if (queryType === "bot") {
      infoEmbed.setDescription(`Bot is online and ready. Latency: ${client.ws.ping}ms.`);
      infoEmbed.addFields(
        { name: "Panel Port", value: `${port}`, inline: true },
        { name: "Modmail", value: isModmailConfigured() ? "Configured" : "Not configured", inline: true }
      );
    } else if (queryType === "etc") {
      infoEmbed.setDescription("EU Tuning Crew support bot is here to help with modmail, logs, and server utilities.");
    } else if (!guild) {
      infoEmbed.setDescription("Use =info bot for bot details, or use this command in a server for server info.");
    } else {
      infoEmbed.setDescription(`${guild.name} has ${guild.memberCount || "unknown"} members.`);
      const rulesChannel = findRulesChannel(guild);
      if (rulesChannel) {
        infoEmbed.addFields({ name: "Rules Channel", value: `${rulesChannel}`, inline: true });
      }
    }

    await message.reply({ embeds: [infoEmbed] });
    return true;
  }

  if (command === "status" || command === "ping") {
    const reply = command === "ping"
      ? botConfig.pingReply.replaceAll("{ping}", String(client.ws.ping))
      : botConfig.statusReply;
    await message.reply(reply);
    return true;
  }

  if (command === "modmail") {
    if (message.channel.type === ChannelType.DM) {
      await sendModmailHome(message.author, "Press Open Modmail or send your message once a ticket is open.");
      return true;
    }
    await message.reply("Use /modmail panel to post the modmail button in a channel, or DM me directly to start.");
    return true;
  }

  if (command === "close") {
    const ticket = getTicketByChannelId(message.channelId) || getTicketByUserId(message.author.id);
    if (!ticket || ticket.status !== "open") {
      await message.reply("You do not have an open modmail right now.");
      return true;
    }
    const closedBy = message.channel.type === ChannelType.DM ? "user" : "staff";
    await closeTicket(ticket, closedBy);
    await message.reply("Closing modmail now.");
    return true;
  }

  return false;
}

async function getProtectedStaffRole(message) {
  if (!message.guild) return null;
  if (botConfig.noPingStaffRoleId) {
    return message.guild.roles.cache.get(botConfig.noPingStaffRoleId)
      || await message.guild.roles.fetch(botConfig.noPingStaffRoleId).catch(() => null);
  }
  return message.guild.roles.cache.find((role) => role.name.toLowerCase() === "staff") || null;
}

async function hasNoPingViolation(message) {
  if (!message.guild || message.author.bot) return false;
  const staffRole = await getProtectedStaffRole(message);
  if (!staffRole) return false;

  const authorMember = message.member
    || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (authorMember?.roles.cache.has(staffRole.id)) {
    return false;
  }

  if (message.mentions.roles.has(staffRole.id)) return true;

  for (const mentionedUser of message.mentions.users.values()) {
    const mentionedMember = message.guild.members.cache.get(mentionedUser.id)
      || await message.guild.members.fetch(mentionedUser.id).catch(() => null);
    if (mentionedMember?.roles.cache.has(staffRole.id)) {
      return true;
    }
  }

  if (message.reference?.messageId) {
    const repliedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    const repliedMember = repliedMessage?.member
      || (repliedMessage?.author
        ? await message.guild.members.fetch(repliedMessage.author.id).catch(() => null)
        : null);
    if (repliedMember?.roles.cache.has(staffRole.id)) {
      return true;
    }
  }

  return false;
}

function getGuildWarnings(guildId) {
  if (!warnings[guildId]) warnings[guildId] = {};
  return warnings[guildId];
}

async function clearNoPingWarns(guildId, userId = "") {
  if (!warnings[guildId]) return 0;
  if (userId) {
    const hadWarns = Boolean(warnings[guildId][userId]);
    delete warnings[guildId][userId];
    await saveWarnings();
    return hadWarns ? 1 : 0;
  }
  const cleaned = Object.keys(warnings[guildId]).length;
  warnings[guildId] = {};
  await saveWarnings();
  return cleaned;
}

async function warnForNoPing(message) {
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  const guildWarnings = getGuildWarnings(message.guild.id);
  const current = guildWarnings[message.author.id] || { count: 0, updatedAt: "" };
  const nextCount = current.count + 1;
  const remainingWarns = Math.max(0, 3 - nextCount);
  guildWarnings[message.author.id] = {
    count: nextCount,
    updatedAt: new Date().toISOString()
  };
  await saveWarnings();

  if (nextCount >= 3) {
    let muteLine = "I could not mute you. Please ask staff to check my permissions.";
    if (member?.moderatable) {
      await member.timeout(noPingMuteMs, "Reached 3 no-ping warnings.").catch(() => null);
      muteLine = "You have 3/3 warns and 0 remaining warns. You have been muted for 3 hours.";
      guildWarnings[message.author.id] = {
        count: 0,
        updatedAt: new Date().toISOString()
      };
      await saveWarnings();
    }
    await message.channel.send({
      content: `${message.author}, do not ping staff. ${muteLine}`
    }).catch(() => {});
    return;
  }

  await message.channel.send({
    content: `${message.author}, do not ping staff. You have ${nextCount}/3 warns. Remaining warns: ${remainingWarns}. At 3 warns you get muted for 3 hours.`
  }).catch(() => {});
}

async function sendModmailHome(user, notice = "") {
  const ticket = getTicketByUserId(user.id);
  const statusText = ticket?.status === "open"
    ? "You already have an open ETC modmail."
    : "You do not currently have an open ETC modmail.";

  const intro = new EmbedBuilder()
    .setTitle("ETC Modmail")
    .setDescription(`${botConfig.modmailIntroText}\n\n${statusText}${notice ? `\n\n${notice}` : ""}\n\nClose with =close or ./close modmail.`)
    .setColor(0x1ff2d2);

  await user.send({
    embeds: [intro],
    components: [openTicketRow]
  });
  modmailHomePrompted.add(user.id);
}

async function sendModmailPanel(channel) {
  if (!channel?.isTextBased()) return null;
  return channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("ETC Modmail")
        .setDescription(botConfig.modmailIntroText)
        .setColor(0x1ff2d2)
    ],
    components: [openTicketRow]
  });
}

async function openTicketForUser(user) {
  if (!isModmailConfigured()) {
    await user.send("Modmail is not configured yet. Please ask staff to set the guild ID in the bot panel.");
    return null;
  }

  const guild = await client.guilds.fetch(botConfig.modmailGuildId).catch(() => null);
  if (!guild) {
    await user.send("The configured modmail guild could not be found.");
    return null;
  }

  let ticket = getTicketByUserId(user.id);
  if (ticket && ticket.status === "open") {
    await user.send("Your modmail is already open. Send your message here.");
    return ticket;
  }

  const everyoneRole = guild.roles.everyone;
  const parent = botConfig.modmailCategoryId || null;
  const displayName = await getMemberDisplayName(guild, user);
  const channel = await guild.channels.create({
    name: normalizeModmailName(displayName),
    type: ChannelType.GuildText,
    parent: parent || undefined,
    topic: `ETC modmail for ${displayName} (${user.id})`,
    permissionOverwrites: [
      {
        id: everyoneRole.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      }
    ]
  });

  ticket = {
    userId: user.id,
    username: user.username,
    displayName,
    channelId: channel.id,
    guildId: guild.id,
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  tickets[user.id] = ticket;
  await saveTickets();
  modmailHomePrompted.delete(user.id);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("New Modmail")
        .setDescription(`Member: <@${user.id}>\nNickname: ${displayName}\nUser ID: ${user.id}\n\nClose this modmail with \`=close\` or \`./close modmail\`.`)
        .setColor(0x1ff2d2)
    ]
  });

  await user.send(botConfig.modmailOpenedText);
  return ticket;
}

async function closeTicket(ticket, closedBy = "staff") {
  ticket.status = "closed";
  ticket.updatedAt = new Date().toISOString();
  await saveTickets();

  const user = await client.users.fetch(ticket.userId).catch(() => null);
  if (user) {
    const closedNotice = closedBy === "user"
      ? `${botConfig.modmailClosedText}\n\nYou closed this modmail.`
      : `${botConfig.modmailClosedText}\n\nThe ETC team closed this modmail.`;
    await user.send(closedNotice).catch(() => {});
    modmailHomePrompted.delete(user.id);
    await sendModmailHome(user, "You can press Open Modmail any time if you need help again.").catch(() => {});
  }

  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (channel?.isTextBased()) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("Modmail Closed")
          .setDescription(`Closed by ${closedBy === "user" ? "the user" : "staff"}.`)
          .setColor(0xff4d5d)
      ]
    }).catch(() => {});
    await channel.delete("Modmail closed.").catch((error) => {
      console.error("Failed to delete modmail channel", error);
    });
  }

  delete tickets[ticket.userId];
  await saveTickets();
}

function htmlShell(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top left, rgba(88, 101, 242, 0.2), transparent 26%),
        radial-gradient(circle at 85% 8%, rgba(31, 242, 210, 0.13), transparent 22%),
        linear-gradient(180deg, #090b12 0%, #090a0f 100%);
      color: #eef2ff;
      font-family: Inter, Arial, sans-serif;
      padding: 24px;
    }
    .shell {
      width: min(100%, 1240px);
      margin: 0 auto;
    }
    .panel {
      width: 100%;
      background: linear-gradient(180deg, rgba(16, 19, 31, 0.9), rgba(11, 14, 24, 0.86));
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 30px;
      padding: 30px;
      box-shadow: 0 30px 80px rgba(0,0,0,0.38);
      backdrop-filter: blur(18px);
    }
    .login-wrap {
      min-height: calc(100vh - 48px);
      display: grid;
      place-items: center;
    }
    .dashboard {
      display: grid;
      grid-template-columns: 290px minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }
    .sidebar {
      background: linear-gradient(180deg, rgba(13, 16, 27, 0.95), rgba(10, 13, 22, 0.88));
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 28px;
      padding: 22px;
      position: sticky;
      top: 24px;
    }
    .brand {
      margin-bottom: 22px;
    }
    .brand-kicker {
      font-size: 0.76rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: #8ba5ff;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .brand-title {
      font-size: 1.75rem;
      font-weight: 800;
      line-height: 1.02;
    }
    .brand-copy {
      margin-top: 12px;
      font-size: 0.95rem;
      color: rgba(226, 232, 255, 0.66);
      line-height: 1.5;
    }
    .nav-list {
      display: grid;
      gap: 10px;
      margin-top: 20px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 13px 15px;
      border-radius: 18px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.05);
      font-weight: 700;
      color: rgba(238, 242, 255, 0.84);
      text-decoration: none;
      transition: 0.2s ease;
    }
    .nav-item:hover {
      transform: translateY(-2px);
      border-color: rgba(139,165,255,0.45);
      background: rgba(88, 101, 242, 0.12);
    }
    .nav-item.active {
      background: linear-gradient(135deg, rgba(88, 101, 242, 0.22), rgba(31, 242, 210, 0.12));
      border-color: rgba(139,165,255,0.45);
      color: #ffffff;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 16px 40px rgba(20, 26, 48, 0.38);
    }
    .nav-item small {
      color: rgba(226, 232, 255, 0.46);
      font-size: 0.72rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .login-role-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin: 18px 0 8px;
    }
    .role-card {
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 22px;
      padding: 16px;
      background: rgba(255,255,255,0.03);
      cursor: pointer;
      transition: 0.2s ease;
    }
    .role-card strong {
      display: block;
      margin-bottom: 8px;
      font-size: 1rem;
    }
    .role-card span {
      display: block;
      color: rgba(226, 232, 255, 0.64);
      font-size: 0.92rem;
      line-height: 1.45;
    }
    .role-card:hover,
    .role-card.is-active {
      transform: translateY(-2px);
      border-color: rgba(139,165,255,0.45);
      background: linear-gradient(135deg, rgba(88, 101, 242, 0.14), rgba(31, 242, 210, 0.08));
    }
    .role-card.role-guest {
      opacity: 0.76;
    }
    .password-wrap.is-hidden {
      display: none;
    }
    .main-grid {
      display: grid;
      gap: 20px;
    }
    .main-stack {
      display: grid;
      gap: 20px;
    }
    .hero-panel {
      position: relative;
      overflow: hidden;
    }
    .hero-panel::after {
      content: "";
      position: absolute;
      inset: auto -120px -120px auto;
      width: 280px;
      height: 280px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(88, 101, 242, 0.28), transparent 68%);
      pointer-events: none;
    }
    .hero-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 22px;
    }
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-bottom: 8px;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(88, 101, 242, 0.14);
      border: 1px solid rgba(139,165,255,0.3);
      font-size: 0.85rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #58ff87;
      box-shadow: 0 0 12px rgba(88,255,135,0.8);
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 14px;
      margin: 18px 0 0;
    }
    .stat-card {
      padding: 18px;
      border-radius: 20px;
      background: rgba(255,255,255,0.035);
      border: 1px solid rgba(255,255,255,0.06);
    }
    .stat-label {
      font-size: 0.8rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: rgba(226, 232, 255, 0.54);
      margin-bottom: 8px;
    }
    .stat-value {
      font-size: 1.55rem;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.15;
    }
    .sub-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 16px;
    }
    .mini-card {
      padding: 18px;
      border-radius: 22px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
    }
    .mini-card h3 {
      margin: 0 0 10px;
      font-size: 1rem;
    }
    .mini-card p {
      margin: 0;
      font-size: 0.94rem;
    }
    h1 { margin: 0; font-size: 2.1rem; }
    h2 { margin: 0; font-size: 1.25rem; }
    h3 { margin: 0; }
    p { color: rgba(226, 232, 255, 0.72); line-height: 1.5; }
    label { display: block; margin: 16px 0 8px; font-weight: 700; }
    input, textarea, select {
      width: 100%;
      box-sizing: border-box;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.09);
      background: rgba(6, 10, 20, 0.55);
      color: #fff;
      padding: 12px 14px;
      font-size: 1rem;
    }
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: rgba(139,165,255,0.58);
      box-shadow: 0 0 0 3px rgba(88, 101, 242, 0.18);
    }
    textarea { min-height: 110px; resize: vertical; }
    .form-card {
      background: rgba(13, 16, 27, 0.78);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 24px;
      padding: 24px;
    }
    .view {
      display: none;
      gap: 18px;
    }
    .view.active {
      display: grid;
    }
    .view-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 4px;
    }
    .view-heading p {
      margin: 10px 0 0;
    }
    .stack-card {
      display: grid;
      gap: 6px;
    }
    .stack-card p {
      margin: 0;
    }
    .buttons {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 22px;
    }
    button {
      border: 0;
      border-radius: 999px;
      padding: 12px 20px;
      font-weight: 700;
      cursor: pointer;
      background: linear-gradient(135deg, #7f8cff, #5865f2);
      color: #ffffff;
      box-shadow: 0 14px 34px rgba(88, 101, 242, 0.28);
    }
    .tab-button {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .ghost {
      background: rgba(255,255,255,0.08);
      color: #f6f1e9;
      box-shadow: none;
    }
    .outline {
      background: rgba(255,255,255,0.04);
      color: #eef2ff;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: none;
    }
    .error { color: #ff8a8a; }
    .ok { color: #7dffc4; }
    code { color: #8ba5ff; }
    .split {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 18px;
      align-items: start;
    }
    .preview-card {
      display: grid;
      gap: 10px;
    }
    .preview-shell {
      margin-top: 10px;
      border-radius: 24px;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,0.06);
      background: rgba(6, 9, 17, 0.76);
    }
    .preview-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      background: rgba(255,255,255,0.03);
    }
    .preview-body {
      padding: 18px;
      display: grid;
      gap: 12px;
    }
    .hint {
      margin-top: 10px;
      font-size: 0.92rem;
      color: rgba(246,241,233,0.62);
    }
    .section-note {
      font-size: 0.88rem;
      color: rgba(226, 232, 255, 0.58);
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .access-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .access-card {
      padding: 20px;
      border-radius: 24px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
    }
    .access-card p {
      margin: 10px 0 0;
    }
    @media (max-width: 920px) {
      .dashboard,
      .split,
      .sub-grid,
      .login-role-grid,
      .access-grid {
        grid-template-columns: 1fr;
      }
      .sidebar {
        position: static;
      }
      .view-heading,
      .topbar {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <div class="shell">${body}</div>
  <script>
    (() => {
      const roleInput = document.querySelector("[data-role-input]");
      const roleCards = [...document.querySelectorAll("[data-role-card]")];
      if (roleInput && roleCards.length) {
        const passwordWrap = document.querySelector("[data-password-wrap]");
        const passwordLabel = document.querySelector("[data-password-label]");
        const passwordInput = document.getElementById("password");
        const passwordHint = document.querySelector("[data-password-hint]");
        const guestHint = document.querySelector("[data-guest-hint]");
        const submitLabel = document.querySelector("[data-submit-label]");
        function activateRole(role) {
          roleInput.value = role;
          roleCards.forEach((card) => {
            card.classList.toggle("is-active", card.dataset.roleCard === role);
          });
          const guestMode = role === "guest";
          if (passwordWrap) passwordWrap.classList.toggle("is-hidden", guestMode);
          if (guestHint) guestHint.style.display = guestMode ? "block" : "none";
          if (submitLabel) submitLabel.textContent = guestMode ? "Continue as guest" : "Login as " + role;
          if (passwordInput) {
            passwordInput.required = !guestMode;
            if (guestMode) passwordInput.value = "";
          }
          if (passwordLabel) passwordLabel.textContent = role === "owner" ? "Owner password" : "Admin password";
          if (passwordHint) {
            passwordHint.textContent = role === "owner"
              ? "Use the owner password to unlock full access."
              : "Use the admin password to open the control center.";
          }
        }
        roleCards.forEach((card) => {
          card.addEventListener("click", () => activateRole(card.dataset.roleCard));
        });
        activateRole(roleInput.value || "admin");
      }

      const navItems = [...document.querySelectorAll("[data-tab-target]")];
      const views = [...document.querySelectorAll("[data-tab-view]")];
      if (!navItems.length || !views.length) return;

      const validTabs = new Set(views.map((view) => view.dataset.tabView));

      function activateTab(tabName) {
        const target = validTabs.has(tabName) ? tabName : "overview";
        views.forEach((view) => {
          view.classList.toggle("active", view.dataset.tabView === target);
        });
        navItems.forEach((item) => {
          item.classList.toggle("active", item.dataset.tabTarget === target);
        });
        if (window.location.hash !== "#" + target) {
          history.replaceState(null, "", "#" + target);
        }
      }

      navItems.forEach((item) => {
        item.addEventListener("click", (event) => {
          event.preventDefault();
          activateTab(item.dataset.tabTarget);
        });
      });

      const initial = window.location.hash.replace("#", "");
      activateTab(initial || "overview");
      window.addEventListener("hashchange", () => activateTab(window.location.hash.replace("#", "")));
    })();
  </script>
</body>
</html>`;
}

function sendHtml(res, statusCode, html, headers = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    ...headers
  });
  res.end(html);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload));
}

function isPanelApiAuthorized(req) {
  if (!panelApiSecret) return false;
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return safeCompare(token, panelApiSecret);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getPanelStats() {
  const openTickets = Object.values(tickets).filter((ticket) => ticket.status === "open").length;
  const activeWarns = Object.values(warnings).reduce((total, guildWarnings) => {
    return total + Object.values(guildWarnings).reduce((guildTotal, userWarning) => guildTotal + (userWarning.count || 0), 0);
  }, 0);

  return {
    botTag: client.isReady() ? client.user.tag : (discordReady ? "Starting..." : "Panel-only mode"),
    discordMode: discordReady ? "Enabled" : "Panel Only",
    guilds: client.guilds.cache.size,
    openTickets,
    activeWarns,
    modmailReady: isModmailConfigured() ? "Configured" : "Needs setup"
  };
}

function createApiResponse(res) {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      res.writeHead(this.statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        ...this.headers
      });
      res.end(JSON.stringify(payload));
    }
  };
}

async function serveWebsiteFile(req, res, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(projectRoot, safePath);

  if (!filePath.startsWith(projectRoot) || !existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": contentTypes[ext] || "application/octet-stream",
    "Content-Length": fileStats.size,
    "Cache-Control": "no-store"
  });
  createReadStream(filePath).pipe(res);
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, {
    Location: location,
    ...headers
  });
  res.end();
}

function parseFormBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      resolve(Object.fromEntries(new URLSearchParams(body)));
    });
    req.on("error", reject);
  });
}

function safeCompare(input, expected) {
  const a = Buffer.from(input || "", "utf8");
  const b = Buffer.from(expected || "", "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderLoginPage(message = "", selectedRole = "admin") {
  const role = ["guest", "admin", "owner"].includes(selectedRole) ? selectedRole : "admin";
  return htmlShell(
    "ETC Bot Login",
    `<div class="login-wrap">
      <main class="panel hero-panel" style="max-width: 760px;">
        <div class="brand-kicker">ETC Panel</div>
        <h1>Continue Or Login</h1>
        <p>Continue as a guest, or login as an owner or admin to open the bot panel.</p>
        ${message ? `<p class="error">${message}</p>` : ""}
        <form method="post" action="/login">
          <input type="hidden" name="role" value="${role}" data-role-input>
          <div class="login-role-grid">
            <button class="role-card role-guest${role === "guest" ? " is-active" : ""}" type="button" data-role-card="guest">
              <strong>Continue as guest</strong>
              <span>Public entrance</span>
            </button>
            <button class="role-card${role === "admin" ? " is-active" : ""}" type="button" data-role-card="admin">
              <strong>Login as admin</strong>
              <span>Bot panel access</span>
            </button>
            <button class="role-card${role === "owner" ? " is-active" : ""}" type="button" data-role-card="owner">
              <strong>Login as owner</strong>
              <span>Full bot panel access</span>
            </button>
          </div>
          <div class="password-wrap${role === "guest" ? " is-hidden" : ""}" data-password-wrap>
            <label for="password" data-password-label>${role === "owner" ? "Owner password" : "Admin password"}</label>
            <input id="password" name="password" type="password" autocomplete="current-password" ${role === "guest" ? "" : "required"}>
            <div class="hint" data-password-hint>${role === "owner" ? "Use the owner password to unlock full access." : "Use the admin password to open the control center."}</div>
          </div>
          <div class="hint" data-guest-hint${role === "guest" ? "" : ` style="display:none;"`}>Guest mode opens the public webapp view directly and skips the bot control panel.</div>
          <div class="buttons">
            <button type="submit" data-submit-label>${role === "guest" ? "Continue as guest" : `Login as ${role}`}</button>
          </div>
        </form>
      </main>
    </div>`
  );
}

function renderAdminPage(message = "", role = "admin") {
  const botTag = client.isReady() ? client.user.tag : (discordReady ? "Starting..." : "Panel-only mode");
  const guilds = client.guilds.cache.size;
  const openTickets = Object.values(tickets).filter((ticket) => ticket.status === "open").length;
  const activeWarns = Object.values(warnings).reduce((total, guildWarnings) => {
    return total + Object.values(guildWarnings).reduce((guildTotal, userWarning) => guildTotal + (userWarning.count || 0), 0);
  }, 0);
  const modmailReady = isModmailConfigured() ? "Configured" : "Needs setup";
  const isOwnerRole = role === "owner";

  return htmlShell(
    "ETC Bot Panel",
    `<div class="dashboard">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-kicker">ETC Bot Panel</div>
          <div class="brand-title">StartIT Style Panel</div>
          <div class="brand-copy">Run the ETC bot like a clean control center. The left menu now switches real panel views instead of dumping everything in one long page.</div>
        </div>
        <div class="nav-list">
          <a class="nav-item active" href="#overview" data-tab-target="overview"><span>Overview</span><small>01</small></a>
          <a class="nav-item" href="#bot-settings" data-tab-target="bot-settings"><span>Bot Settings</span><small>02</small></a>
          <a class="nav-item" href="#modmail" data-tab-target="modmail"><span>Modmail</span><small>03</small></a>
          <a class="nav-item" href="#preview" data-tab-target="preview"><span>Preview</span><small>04</small></a>
          ${isOwnerRole ? `<a class="nav-item" href="#access" data-tab-target="access"><span>Access</span><small>05</small></a>` : ""}
          <a class="nav-item" href="/?fromPanel=1"><span>Website</span><small>WEB</small></a>
        </div>
        <form method="post" action="/logout">
          <div class="buttons">
            <button class="ghost" type="submit">Log out</button>
          </div>
        </form>
      </aside>
      <main class="main-grid">
        <section class="view active" data-tab-view="overview">
          <section class="panel hero-panel">
            <div class="topbar">
              <div>
                <div class="brand-kicker">Dashboard</div>
                <h1>ETC Bot Control Panel</h1>
              </div>
              <div class="status-pill"><span class="status-dot"></span> Live panel</div>
            </div>
            <p>This is the same ETC bot panel, just cleaned up into proper working views. Use the menu like a real app, then save bot replies or modmail behavior without touching code.</p>
            ${message ? `<p class="ok">${message}</p>` : ""}
            <div class="hero-actions">
              <a class="tab-button" href="#bot-settings" data-tab-target="bot-settings"><button type="button">Open Bot Settings</button></a>
              <a class="tab-button" href="#modmail" data-tab-target="modmail"><button class="outline" type="button">Open Modmail</button></a>
              <a class="tab-button" href="#preview" data-tab-target="preview"><button class="ghost" type="button">Open Preview</button></a>
            </div>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">Bot Tag</div>
                <div class="stat-value">${escapeHtml(botTag)}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Discord Mode</div>
                <div class="stat-value">${discordReady ? "Enabled" : "Panel Only"}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Guilds</div>
                <div class="stat-value">${guilds}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Open Modmail</div>
                <div class="stat-value">${openTickets}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">No-Ping Warns</div>
                <div class="stat-value">${activeWarns}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Modmail</div>
                <div class="stat-value">${modmailReady}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Panel Port</div>
                <div class="stat-value">${port}</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Role</div>
                <div class="stat-value">${escapeHtml(role)}</div>
              </div>
            </div>
            <div class="sub-grid">
              <div class="mini-card">
                <h3>Bot replies</h3>
                <p>Edit the activity text, status answer, and ping answer from one view.</p>
              </div>
              <div class="mini-card">
                <h3>Modmail flow</h3>
                <p>Set the guild, panel channel, category, intro text, opened text, and closed text the team will use.</p>
              </div>
              <div class="mini-card">
                <h3>Live preview</h3>
                <p>Check how the current texts will look before you leave the panel.</p>
              </div>
              <div class="mini-card">
                <h3>No-ping guard</h3>
                <p>Staff role pings get warned. Three warns triggers a 3 hour mute. Use <code>/clean warn</code> to clear warns.</p>
              </div>
            </div>
          </section>
        </section>

        <section class="view" data-tab-view="bot-settings">
          <section class="panel form-card">
            <div class="view-heading">
              <div class="stack-card">
                <div class="section-note">Control</div>
                <h2>Live Bot Settings</h2>
                <p>These are the main bot texts people will see first when they use the basic ETC commands.</p>
              </div>
              <div class="status-pill"><span class="status-dot"></span> Replies ready</div>
            </div>
            <form method="post" action="/admin/save-bot">
              <label for="activityText">Bot activity text</label>
              <input id="activityText" name="activityText" value="${escapeHtml(botConfig.activityText)}" required>

              <label for="statusReply">/status reply</label>
              <textarea id="statusReply" name="statusReply" required>${escapeHtml(botConfig.statusReply)}</textarea>

              <label for="pingReply">/ping reply</label>
              <textarea id="pingReply" name="pingReply" required>${escapeHtml(botConfig.pingReply)}</textarea>
              <div class="hint">Use <code>{ping}</code> in the ping reply if you want the bot latency to appear automatically.</div>

              <label for="noPingStaffRoleId">Staff role ID for no-ping warns</label>
              <input id="noPingStaffRoleId" name="noPingStaffRoleId" value="${escapeHtml(botConfig.noPingStaffRoleId)}" placeholder="Discord Staff role ID">
              <div class="hint">Only this role gets protected. If empty, the bot protects a role named <code>staff</code>.</div>

              <div class="buttons">
                <button type="submit">Save bot settings</button>
                <a class="tab-button" href="#preview" data-tab-target="preview"><button class="ghost" type="button">Preview Texts</button></a>
              </div>
            </form>
          </section>
        </section>

        <section class="view" data-tab-view="modmail">
          <div class="split">
            <section class="panel form-card">
              <div class="section-note">PV / Welcome</div>
              <h2>Quick Settings</h2>
              <p>Welcome embed and PV modmail trigger can be configured here.</p>

              <form method="post" action="/admin/save-bot">
                <label for="welcomeJoinChannelId">Welcome channel (on server join)</label>
                <select id="welcomeJoinChannelId" name="welcomeJoinChannelId">
                  ${renderTextChannelOptions(botConfig.welcomeJoinChannelId)}
                </select>

                <label for="welcomeEmbedTitle">Welcome embed title</label>
                <input id="welcomeEmbedTitle" name="welcomeEmbedTitle" value="${escapeHtml(botConfig.welcomeEmbedTitle)}" required>

                <label for="welcomeEmbedDescription">Welcome embed description</label>
                <textarea id="welcomeEmbedDescription" name="welcomeEmbedDescription" required>${escapeHtml(botConfig.welcomeEmbedDescription)}</textarea>

                <label for="welcomeEmbedColor">Welcome embed color</label>
                <input id="welcomeEmbedColor" name="welcomeEmbedColor" value="${escapeHtml(botConfig.welcomeEmbedColor)}" required>

                <label for="welcomeEmbedImageUrl">Welcome embed image URL / filename</label>
                <input id="welcomeEmbedImageUrl" name="welcomeEmbedImageUrl" value="${escapeHtml(botConfig.welcomeEmbedImageUrl)}" placeholder="welcome message.png">

                <div class="buttons">
                  <button type="submit">Save welcome</button>
                </div>
              </form>

              <form method="post" action="/admin/save-bot" style="margin-top: 18px;">
                <label for="pvModmailEnabled">Enable PV auto-modmail from member DMs</label>
                <select id="pvModmailEnabled" name="pvModmailEnabled">
                  <option value="true"${botConfig.pvModmailEnabled ? " selected" : ""}>Enabled</option>
                  <option value="false"${!botConfig.pvModmailEnabled ? " selected" : ""}>Disabled</option>
                </select>

                <label for="pvEmbedTitle">PV embed title</label>
                <input id="pvEmbedTitle" name="pvEmbedTitle" value="${escapeHtml(botConfig.pvEmbedTitle)}" required>

                <label for="pvEmbedDescription">PV embed description (use ${"${content}"} placeholder)</label>
                <textarea id="pvEmbedDescription" name="pvEmbedDescription" required>${escapeHtml(botConfig.pvEmbedDescription)}</textarea>

                <label for="pvEmbedColor">PV embed color</label>
                <input id="pvEmbedColor" name="pvEmbedColor" value="${escapeHtml(botConfig.pvEmbedColor)}" required>

                <label for="pvEmbedImageUrl">PV embed image URL / filename</label>
                <input id="pvEmbedImageUrl" name="pvEmbedImageUrl" value="${escapeHtml(botConfig.pvEmbedImageUrl)}" placeholder="">

                <div class="buttons">
                  <button type="submit">Save PV trigger</button>
                </div>
              </form>

              <hr style="border:0;border-top:1px solid rgba(255,255,255,0.08);margin:22px 0;"/>

              <div class="section-note">Modmail</div>
              <h2>Modmail Setup</h2>
              <p>This section controls where the Open Modmail panel goes, where modmail channels are created, and what members see.</p>

              <div class="status-pill"><span class="status-dot"></span> ${modmailReady}</div>

              <form method="post" action="/admin/save-modmail">
                <label for="modmailGuildId">Modmail guild ID</label>
                <input id="modmailGuildId" name="modmailGuildId" value="${escapeHtml(botConfig.modmailGuildId)}" placeholder="Discord server ID">

                <label for="modmailCategoryId">Modmail category ID</label>
                <input id="modmailCategoryId" name="modmailCategoryId" value="${escapeHtml(botConfig.modmailCategoryId)}" placeholder="Category ID for modmail channels">

                <label for="modmailPanelChannelId">Modmail panel channel</label>
                <select id="modmailPanelChannelId" name="modmailPanelChannelId">
                  ${renderTextChannelOptions(botConfig.modmailPanelChannelId)}
                </select>
                <div class="hint">Save this channel, then use <code>/modmail panel</code> in Discord to post the Open Modmail panel there. You can also pass a channel directly in the command.</div>

                <label for="modmailIntroText">Modmail intro text</label>
                <textarea id="modmailIntroText" name="modmailIntroText" required>${escapeHtml(botConfig.modmailIntroText)}</textarea>

                <label for="modmailOpenedText">Modmail opened reply</label>
                <textarea id="modmailOpenedText" name="modmailOpenedText" required>${escapeHtml(botConfig.modmailOpenedText)}</textarea>

                <label for="modmailClosedText">Modmail closed reply</label>
                <textarea id="modmailClosedText" name="modmailClosedText" required>${escapeHtml(botConfig.modmailClosedText)}</textarea>

                <div class="buttons">
                  <button type="submit">Save modmail</button>
                  <a class="tab-button" href="#preview" data-tab-target="preview"><button class="ghost" type="button">See Preview</button></a>
                </div>
              </form>
              <div class="view-heading">
                <div class="stack-card">
                  <div class="section-note">Support</div>
                  <h2>Modmail Setup</h2>
                  <p>This section controls where the Open Modmail panel goes, where modmail channels are created, and what members see.</p>
                </div>
                <div class="status-pill"><span class="status-dot"></span> ${modmailReady}</div>
              </div>
              <form method="post" action="/admin/save-modmail">
                <label for="modmailGuildId">Modmail guild ID</label>
                <input id="modmailGuildId" name="modmailGuildId" value="${escapeHtml(botConfig.modmailGuildId)}" placeholder="Discord server ID">

                <label for="modmailCategoryId">Modmail category ID</label>
                <input id="modmailCategoryId" name="modmailCategoryId" value="${escapeHtml(botConfig.modmailCategoryId)}" placeholder="Category ID for modmail channels">

                <label for="modmailPanelChannelId">Modmail panel channel</label>
                <select id="modmailPanelChannelId" name="modmailPanelChannelId">
                  ${renderTextChannelOptions(botConfig.modmailPanelChannelId)}
                </select>
                <div class="hint">Save this channel, then use <code>/modmail panel</code> in Discord to post the Open Modmail panel there. You can also pass a channel directly in the command.</div>

                <label for="modmailIntroText">Modmail intro text</label>
                <textarea id="modmailIntroText" name="modmailIntroText" required>${escapeHtml(botConfig.modmailIntroText)}</textarea>

                <label for="modmailOpenedText">Modmail opened reply</label>
                <textarea id="modmailOpenedText" name="modmailOpenedText" required>${escapeHtml(botConfig.modmailOpenedText)}</textarea>

                <label for="modmailClosedText">Modmail closed reply</label>
                <textarea id="modmailClosedText" name="modmailClosedText" required>${escapeHtml(botConfig.modmailClosedText)}</textarea>

                <div class="buttons">
                  <button type="submit">Save modmail</button>
                  <a class="tab-button" href="#preview" data-tab-target="preview"><button class="ghost" type="button">See Preview</button></a>
                </div>
              </form>
            </section>
            <section class="panel form-card">
              <div class="section-note">Flow</div>
              <h2>How It Works</h2>
              <div class="mini-card" style="margin-top: 16px;">
                <h3>1. Member DMs the bot</h3>
                <p>The bot sends the intro text and the Open Modmail button.</p>
              </div>
              <div class="mini-card" style="margin-top: 14px;">
                <h3>2. Modmail channel opens</h3>
                <p>The modmail channel is created inside your chosen guild and category so staff can answer.</p>
              </div>
              <div class="mini-card" style="margin-top: 14px;">
                <h3>3. Staff and member reply</h3>
                <p>Messages relay between the DM and the modmail channel until someone runs <code>./close modmail</code> or <code>/close modmail</code>.</p>
              </div>
            </section>
          </div>
        </section>

        <section class="view" data-tab-view="preview">
          <section class="panel form-card preview-card">
            <div class="view-heading">
              <div class="stack-card">
                <div class="section-note">Preview</div>
                <h2>Panel Preview</h2>
                <p>This is the easiest way to check the current bot wording before you leave the dashboard.</p>
              </div>
              <a class="tab-button" href="#bot-settings" data-tab-target="bot-settings"><button class="ghost" type="button">Back To Settings</button></a>
            </div>
            <div class="preview-shell">
              <div class="preview-top">
                <strong>ETC Bot</strong>
                <div class="status-pill"><span class="status-dot"></span> Preview</div>
              </div>
              <div class="preview-body">
                <label>Activity preview</label>
                <input value="${escapeHtml(botConfig.activityText)}" readonly>
                <label>Modmail intro preview</label>
                <textarea readonly>${escapeHtml(botConfig.modmailIntroText)}</textarea>
                <label>Opened modmail preview</label>
                <textarea readonly>${escapeHtml(botConfig.modmailOpenedText)}</textarea>
                <label>Closed modmail preview</label>
                <textarea readonly>${escapeHtml(botConfig.modmailClosedText)}</textarea>
                <label>Status command preview</label>
                <textarea readonly>${escapeHtml(botConfig.statusReply)}</textarea>
                <label>Ping command preview</label>
                <textarea readonly>${escapeHtml(botConfig.pingReply.replaceAll("{ping}", "42"))}</textarea>
              </div>
            </div>
            <div class="hint">Members can use the Open Modmail panel or DM the bot, then close with <code>./close modmail</code>. Staff can close from the server modmail channel with the same command or <code>/close modmail</code>.</div>
          </section>
        </section>
        ${isOwnerRole ? `
        <section class="view" data-tab-view="access">
          <section class="panel form-card">
            <div class="view-heading">
              <div class="stack-card">
                <div class="section-note">Owner Only</div>
                <h2>Access Control</h2>
                <p>Only the owner can change the admin and owner passwords from inside the webapp.</p>
              </div>
              <div class="status-pill"><span class="status-dot"></span> Full access</div>
            </div>
            <div class="access-grid">
              <div class="access-card">
                <h3>Current roles</h3>
                <p>Admins and owners can access the bot panel. Guests stay outside the control area.</p>
              </div>
              <div class="access-card">
                <h3>Password editing</h3>
                <p>Saving this form updates the live panel passwords stored in the bot config file.</p>
              </div>
            </div>
            <form method="post" action="/admin/save-access">
              <label for="adminPassword">Admin password</label>
              <input id="adminPassword" name="adminPassword" type="password" value="${escapeHtml(botConfig.adminPassword)}" required>
              <label for="ownerPassword">Owner password</label>
              <input id="ownerPassword" name="ownerPassword" type="password" value="${escapeHtml(botConfig.ownerPassword)}" required>
              <div class="buttons">
                <button type="submit">Save access passwords</button>
              </div>
            </form>
          </section>
        </section>` : ""}
      </main>
    </div>`
  );
}

function startPanelServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || `localhost:${port}`}`);

      if (url.pathname === "/api/trucksbook-km") {
        const { default: trucksbookHandler } = await import("../../api/trucksbook-km.js");
        await trucksbookHandler(req, createApiResponse(res));
        return;
      }

      if (url.pathname === "/api/panel-state") {
        if (!isPanelApiAuthorized(req)) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        sendJson(res, 200, {
          config: botConfig,
          stats: getPanelStats()
        });
        return;
      }

      if (url.pathname === "/api/panel-config") {
        if (!isPanelApiAuthorized(req)) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
        if (req.method !== "POST" && req.method !== "PATCH") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }
        const payload = await parseJsonBody(req);
        await saveConfig({
          ...botConfig,
          ...(payload.config || {})
        });
        sendJson(res, 200, {
          ok: true,
          config: botConfig,
          stats: getPanelStats()
        });
        return;
      }

      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        await serveWebsiteFile(req, res, url.pathname);
        return;
      }

      if (req.method === "GET" && url.pathname === "/login") {
        sendHtml(res, 200, renderLoginPage("", url.searchParams.get("role") || "admin"));
        return;
      }

      if (req.method === "POST" && url.pathname === "/login") {
        const form = await parseFormBody(req);
        const role = form.role === "owner" ? "owner" : (form.role === "admin" ? "admin" : "guest");
        if (role === "guest") {
          redirect(res, "/site");
          return;
        }
        const expectedPassword = role === "owner" ? botConfig.ownerPassword : botConfig.adminPassword;
        if (!safeCompare(form.password, expectedPassword)) {
          sendHtml(res, 401, renderLoginPage(`Wrong ${role} password.`, role));
          return;
        }

        const sessionId = createSession(role);
        redirect(res, "/admin", {
          "Set-Cookie": `etc_panel_session=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/logout") {
        const sessionId = getCookieValue(req, "etc_panel_session");
        if (sessionId) sessions.delete(sessionId);
        redirect(res, "/login", {
          "Set-Cookie": "etc_panel_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/site") {
        sendHtml(
          res,
          200,
          htmlShell(
            "ETC Guest Access",
            `<div class="login-wrap">
              <main class="panel hero-panel" style="max-width: 760px;">
                <div class="brand-kicker">Guest Access</div>
                <h1>Public Website View</h1>
                <p>You entered as a guest, so the bot control panel stays hidden. Use the button below to open the main ETC website.</p>
                <div class="buttons">
                  <a class="tab-button" href="/"><button type="button">Open Website</button></a>
                  <a class="tab-button" href="/login?role=admin"><button class="ghost" type="button">Back To Login</button></a>
                </div>
              </main>
            </div>`
          )
        );
        return;
      }

      if (!hasPanelAccess(req)) {
        redirect(res, "/login");
        return;
      }

      if (req.method === "GET" && url.pathname === "/admin") {
        sendHtml(res, 200, renderAdminPage("", getSession(req)?.role || "admin"));
        return;
      }

      if (req.method === "POST" && url.pathname === "/admin/save-bot") {
        const form = await parseFormBody(req);

        const pvEnabledRaw = form.pvModmailEnabled;
        const pvModmailEnabled = pvEnabledRaw === "false" ? false : Boolean(pvEnabledRaw);

        await saveConfig({
          activityText: form.activityText?.trim() || defaultConfig.activityText,
          statusReply: form.statusReply?.trim() || defaultConfig.statusReply,
          pingReply: form.pingReply?.trim() || defaultConfig.pingReply,
          ownerPassword: botConfig.ownerPassword,
          adminPassword: botConfig.adminPassword,
          modmailGuildId: botConfig.modmailGuildId,
          modmailCategoryId: botConfig.modmailCategoryId,
          modmailPanelChannelId: botConfig.modmailPanelChannelId,

          noPingStaffRoleId: form.noPingStaffRoleId?.trim() || "",
          modmailIntroText: botConfig.modmailIntroText,
          modmailOpenedText: botConfig.modmailOpenedText,
          modmailClosedText: botConfig.modmailClosedText,

          // Welcome-on-join
          welcomeJoinChannelId: form.welcomeJoinChannelId?.trim() || "",
          welcomeEmbedTitle: form.welcomeEmbedTitle?.trim() || defaultConfig.welcomeEmbedTitle,
          welcomeEmbedDescription: form.welcomeEmbedDescription?.trim() || defaultConfig.welcomeEmbedDescription,
          welcomeEmbedColor: form.welcomeEmbedColor?.trim() || defaultConfig.welcomeEmbedColor,
          welcomeEmbedImageUrl: form.welcomeEmbedImageUrl?.trim() || "",

          // PV modmail trigger
          pvModmailEnabled: pvModmailEnabled,
          pvEmbedTitle: form.pvEmbedTitle?.trim() || defaultConfig.pvEmbedTitle,
          pvEmbedDescription: form.pvEmbedDescription?.trim() || defaultConfig.pvEmbedDescription,
          pvEmbedColor: form.pvEmbedColor?.trim() || defaultConfig.pvEmbedColor,
          pvEmbedImageUrl: form.pvEmbedImageUrl?.trim() || ""
        });
        sendHtml(res, 200, renderAdminPage("Bot settings saved successfully.", getSession(req)?.role || "admin"));
        return;
      }

      if (req.method === "POST" && url.pathname === "/admin/save-modmail") {
        const form = await parseFormBody(req);
        await saveConfig({
          activityText: botConfig.activityText,
          statusReply: botConfig.statusReply,
          pingReply: botConfig.pingReply,
          ownerPassword: botConfig.ownerPassword,
          adminPassword: botConfig.adminPassword,
          modmailGuildId: form.modmailGuildId?.trim() || "",
          modmailCategoryId: form.modmailCategoryId?.trim() || "",
          modmailPanelChannelId: form.modmailPanelChannelId?.trim() || "",
          noPingStaffRoleId: botConfig.noPingStaffRoleId,
          modmailIntroText: form.modmailIntroText?.trim() || defaultConfig.modmailIntroText,
          modmailOpenedText: form.modmailOpenedText?.trim() || defaultConfig.modmailOpenedText,
          modmailClosedText: form.modmailClosedText?.trim() || defaultConfig.modmailClosedText
        });
        sendHtml(res, 200, renderAdminPage("Modmail settings saved successfully.", getSession(req)?.role || "admin"));
        return;
      }

      if (req.method === "POST" && url.pathname === "/admin/save-access") {
        if (!isOwner(req)) {
          sendHtml(res, 403, htmlShell("Forbidden", `<main class="panel"><h1>403</h1><p>Only the owner can change access passwords.</p></main>`));
          return;
        }
        const form = await parseFormBody(req);
        await saveConfig({
          activityText: botConfig.activityText,
          statusReply: botConfig.statusReply,
          pingReply: botConfig.pingReply,
          ownerPassword: form.ownerPassword?.trim() || botConfig.ownerPassword,
          adminPassword: form.adminPassword?.trim() || botConfig.adminPassword,
          modmailGuildId: botConfig.modmailGuildId,
          modmailCategoryId: botConfig.modmailCategoryId,
          modmailPanelChannelId: botConfig.modmailPanelChannelId,
          noPingStaffRoleId: botConfig.noPingStaffRoleId,
          modmailIntroText: botConfig.modmailIntroText,
          modmailOpenedText: botConfig.modmailOpenedText,
          modmailClosedText: botConfig.modmailClosedText
        });
        sendHtml(res, 200, renderAdminPage("Access passwords saved successfully.", "owner"));
        return;
      }

      if (req.method === "GET") {
        await serveWebsiteFile(req, res, url.pathname);
        return;
      }

      sendHtml(res, 404, htmlShell("Not Found", `<main class="panel"><h1>404</h1><p>This page does not exist.</p></main>`));
    } catch (error) {
      sendHtml(
        res,
        500,
        htmlShell("Panel Error", `<main class="panel"><h1>Panel Error</h1><p>${escapeHtml(error.message || "Unknown error")}</p></main>`)
      );
    }
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. Stop the process using it or set BOT_PANEL_PORT to a different port.`);
    } else {
      console.error("Bot panel server error:", error);
    }
    process.exit(1);
  });

  server.listen(port, () => {
    console.log(`ETC website and bot panel running at http://localhost:${port}`);
  });
}

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity(botConfig.activityText);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "ping") {
      const reply = botConfig.pingReply.replaceAll("{ping}", String(client.ws.ping));
      await interaction.reply(reply);
      return;
    }

    if (interaction.commandName === "status") {
      await interaction.reply(botConfig.statusReply);
      return;
    }

    if (interaction.commandName === "panel") {
      await interaction.reply(`The ETC bot panel is running on port ${port}.`);
      return;
    }

    if (interaction.commandName === "help") {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("ETC Help")
            .setDescription(`Use slash commands like /help, /rules, /info, and /modmail panel, or text commands like =help, =rules, =info, and =close.`)
            .addFields(
              { name: "Modmail", value: "DM the bot or use /modmail panel to post a modmail button." },
              { name: "Rules", value: "Use /rules or =rules to open the rules channel." },
              { name: "Close", value: "Use /close modmail or =close to close your support request." }
            )
            .setColor(0x1ff2d2)
        ],
        ephemeral: true
      });
      return;
    }

    if (interaction.commandName === "rules") {
      const guild = interaction.guild;
      const rulesChannel = guild ? findRulesChannel(guild) : null;
      if (rulesChannel) {
        await interaction.reply({ content: `Please read the rules in ${rulesChannel}.`, ephemeral: true });
      } else if (guild) {
        await interaction.reply({ content: "Please ask a staff member for the rules channel or set rulesChannelId in the bot config.", ephemeral: true });
      } else {
        await interaction.reply({ content: "Use this command in the server to get the rules channel.", ephemeral: true });
      }
      return;
    }

    if (interaction.commandName === "info") {
      const queryType = interaction.options.getString("type") || "server";
      const guild = interaction.guild;
      const infoEmbed = new EmbedBuilder().setTitle("ETC Info").setColor(0x1ff2d2);

      if (queryType === "bot") {
        infoEmbed.setDescription(`Bot is online and ready. Latency: ${client.ws.ping}ms.`);
        infoEmbed.addFields(
          { name: "Panel Port", value: `${port}`, inline: true },
          { name: "Modmail", value: isModmailConfigured() ? "Configured" : "Not configured", inline: true }
        );
      } else if (queryType === "etc") {
        infoEmbed.setDescription("EU Tuning Crew support bot is here to help with modmail, logs, and server utilities.");
      } else {
        if (!guild) {
          infoEmbed.setDescription("Use /info bot for bot details, or use this command in a server for server info.");
        } else {
          infoEmbed.setDescription(`${guild.name} has ${guild.memberCount} members.`);
          const rulesChannel = findRulesChannel(guild);
          if (rulesChannel) {
            infoEmbed.addFields({ name: "Rules Channel", value: `${rulesChannel}`, inline: true });
          }
        }
      }

      await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
      return;
    }

    if (interaction.commandName === "modmail") {
      if (interaction.options.getSubcommand() !== "panel") return;
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
        await interaction.reply({ content: "You need Manage Server to post the modmail panel.", ephemeral: true });
        return;
      }
      const channel = interaction.options.getChannel("channel")
        || (botConfig.modmailPanelChannelId
          ? await client.channels.fetch(botConfig.modmailPanelChannelId).catch(() => null)
          : null);
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: "Please choose a text channel.", ephemeral: true });
        return;
      }
      await saveConfig({
        ...botConfig,
        modmailGuildId: interaction.guildId || botConfig.modmailGuildId,
        modmailPanelChannelId: channel.id
      });
      await sendModmailPanel(channel);
      await interaction.reply({ content: `Modmail panel posted in ${channel}.`, ephemeral: true });
      return;
    }

    if (interaction.commandName === "close") {
      if (interaction.options.getSubcommand() !== "modmail") return;
      const ticket = getTicketByChannelId(interaction.channelId) || getTicketByUserId(interaction.user.id);
      if (!ticket || ticket.status !== "open") {
        await interaction.reply({ content: "There is no open modmail here.", ephemeral: true });
        return;
      }
      await interaction.reply({ content: "Closing modmail and deleting the channel.", ephemeral: true });
      await closeTicket(ticket, interaction.channel?.type === ChannelType.DM ? "user" : "staff");
      return;
    }

    if (interaction.commandName === "noping") {
      if (!interaction.guildId) {
        await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        return;
      }
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
        await interaction.reply({ content: "You need Manage Messages to set up no-ping.", ephemeral: true });
        return;
      }

      const subcommand = interaction.options.getSubcommand();
      if (subcommand === "setup") {
        const role = interaction.options.getRole("role");
        await saveConfig({ ...botConfig, noPingStaffRoleId: role.id });
        await interaction.reply({ content: `No-ping guard now protects ${role}.`, ephemeral: true });
        return;
      }

      if (subcommand === "status") {
        const roleText = botConfig.noPingStaffRoleId ? `<@&${botConfig.noPingStaffRoleId}>` : "role named `staff`";
        await interaction.reply({ content: `No-ping guard protects ${roleText}. Three warns mutes for 3 hours.`, ephemeral: true });
        return;
      }

      if (subcommand === "clear") {
        const targetUser = interaction.options.getUser("user");
        const cleaned = await clearNoPingWarns(interaction.guildId, targetUser?.id || "");
        const message = targetUser
          ? `Cleared no-ping warns for ${targetUser}.`
          : `Cleared no-ping warns for ${cleaned} user${cleaned === 1 ? "" : "s"}.`;
        await interaction.reply({ content: message, ephemeral: true });
        return;
      }
    }

    if (interaction.commandName === "clean") {
      if (interaction.options.getSubcommand() !== "warn") return;
      if (!interaction.guildId) {
        await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
        return;
      }
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages)) {
        await interaction.reply({ content: "You need Manage Messages to clean warns.", ephemeral: true });
        return;
      }
      const targetUser = interaction.options.getUser("user");
      const cleaned = await clearNoPingWarns(interaction.guildId, targetUser?.id || "");
      const message = targetUser
        ? `Cleaned no-ping warns for ${targetUser}.`
        : `Cleaned no-ping warns for ${cleaned} user${cleaned === 1 ? "" : "s"}.`;
      await interaction.reply({ content: message, ephemeral: true });
      return;
    }
  }

  if (!interaction.isButton()) return;

  if (interaction.customId === "modmail_open") {
    if (!interaction.user) return;
    const ticket = await openTicketForUser(interaction.user);
    if (!ticket) {
      await interaction.reply({ content: "I could not open your modmail yet. Please try again later.", ephemeral: true });
      return;
    }
    await interaction.reply({ content: "Your modmail is ready. Send your message here and the ETC team will receive it.", ephemeral: true });
    return;
  }
});

client.on("guildMemberAdd", async (member) => {
  if (!member.guild || member.user?.bot) return;

  const channelId = botConfig.welcomeJoinChannelId;
  if (!channelId) return;

  const channel = await member.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const color = botConfig.welcomeEmbedColor ? Number(botConfig.welcomeEmbedColor) : 0x1ff2d2;
  const description = (botConfig.welcomeEmbedDescription || "")
    .replaceAll("${member}", member.toString())
    .replaceAll("${username}", member.user.username)
    .replaceAll("${tag}", member.user.tag)
    .replaceAll("${id}", member.user.id);

  const embed = new EmbedBuilder()
    .setTitle(botConfig.welcomeEmbedTitle || "Welcome")
    .setDescription(description)
    .setColor(Number.isFinite(color) ? color : 0x1ff2d2);

  if (botConfig.welcomeEmbedImageUrl) {
    // Use a publicly accessible URL. For local testing, set this to just the filename
    // when the panel server can serve it (e.g. "welcome message.png").
    embed.setImage(botConfig.welcomeEmbedImageUrl);
  }

  await channel.send({ embeds: [embed] }).catch(() => {});
});

function escapeForEmbedText(s) {
  return String(s ?? "");
}

function renderWelcomeEmbedForMember(member) {
  const color = botConfig.welcomeEmbedColor ? Number(botConfig.welcomeEmbedColor) : 0x1ff2d2;
  const descriptionTemplate = botConfig.welcomeEmbedDescription || "";
  const description = descriptionTemplate
    .replaceAll("${member}", member.toString())
    .replaceAll("${username}", member.user?.username || "")
    .replaceAll("${tag}", member.user?.tag || "")
    .replaceAll("${id}", member.user?.id || "");

  const embed = new EmbedBuilder()
    .setTitle(botConfig.welcomeEmbedTitle || "Welcome")
    .setDescription(description)
    .setColor(Number.isFinite(color) ? color : 0x1ff2d2);

  if (botConfig.welcomeEmbedImageUrl) {
    embed.setImage(botConfig.welcomeEmbedImageUrl);
  }

  return embed;
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const prefixCommand = parsePrefixCommand(message);
  if (prefixCommand) {
    const handled = await handleTextCommand(message, prefixCommand);
    if (handled) return;
  }

  if (message.channel.type === ChannelType.DM) {
    const existingTicket = getTicketByUserId(message.author.id);

    // PV / auto-modmail behavior: if user DMs the bot and has no open ticket,
    // auto-open a modmail channel and forward their message.
    if (!existingTicket || existingTicket.status !== "open") {
      if (botConfig.pvModmailEnabled) {
        const opened = await openTicketForUser(message.author);
        if (opened) {
          const relay = formatMessageContent(message);
          if (relay) {
            const staffChannel = await client.channels.fetch(opened.channelId).catch(() => null);
            if (staffChannel?.isTextBased()) {
              const title = botConfig.pvDmEmbedTitle || "PV";
              const descTemplate = botConfig.pvDmEmbedDescription || "${content}";
              const desc = descTemplate.replaceAll("${content}", escapeForEmbedText(relay));
              const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(desc)
                .setFooter({ text: `${message.author.tag} • ${message.author.id}` })
                .setColor(botConfig.pvDmEmbedColor ? Number(botConfig.pvDmEmbedColor) : 0x1ff2d2);
              if (botConfig.pvDmEmbedImageUrl) embed.setImage(botConfig.pvDmEmbedImageUrl);
              await staffChannel.send({ embeds: [embed] }).catch(() => {});
            }
          }
        }
        return;
      }

      if (!modmailHomePrompted.has(message.author.id)) {
        await sendModmailHome(message.author, "Press Open Modmail first, then send your message.");
      } else {
        await message.author.send("Please press Open Modmail or use =help to see available commands.").catch(() => {});
      }
      return;
    }

    const ticket = getTicketByUserId(message.author.id);
    if (!ticket || ticket.status !== "open") {
      await sendModmailHome(message.author, "Press Open Modmail first, then send your message.");
      return;
    }

    const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel?.isTextBased()) {
      await message.author.send("Your modmail channel is missing. Please open a new modmail.");
      return;
    }

    const relay = formatMessageContent(message);
    if (!relay) return;
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("Member Message")
          .setDescription(relay)
          .setFooter({ text: `${message.author.tag} • ${message.author.id}` })
          .setColor(0x1ff2d2)
      ]
    });
    return;
  }

  if (await hasNoPingViolation(message)) {
    await warnForNoPing(message);
  }

  const ticket = getTicketByChannelId(message.channelId);
  if (!ticket || ticket.status !== "open") return;

  const relay = formatMessageContent(message);
  if (!relay) return;

  const user = await client.users.fetch(ticket.userId).catch(() => null);
  if (!user) return;

  await user.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("ETC Staff Reply")
        .setDescription(relay)
        .setFooter({ text: `${message.author.tag}` })
        .setColor(0x1ff2d2)
    ],
    components: [openTicketRow]
  }).catch(() => {});
});

async function start() {
  try {
    await loadConfig();
    await loadTickets();
    await loadWarnings();
    startPanelServer();
    if (discordReady) {
      await registerCommands();
      await client.login(token);
    } else {
      console.log("Discord token or client ID missing. Starting panel-only mode.");
    }
  } catch (error) {
    console.error("Failed to start the ETC bot.");
    if (error?.code === 401 || String(error).includes("401")) {
      console.error("Discord login failed: unauthorized. Check DISCORD_TOKEN and CLIENT_ID in bot/.env and regenerate the bot token if needed.");
      return;
    }
    console.error(error);
    process.exit(1);
  }
}

start();
