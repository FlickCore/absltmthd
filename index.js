import pkg from "discord.js";
const { Client, GatewayIntentBits, Partials, Events, PermissionsBitField, EmbedBuilder, ChannelType } = pkg;
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from "@discordjs/voice";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User]
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const token = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const GUILD_ID = process.env.GUILD_ID;

const userHistories = new Map();
const userNames = new Map();

const tagKapatSet = new Set();
const mutedUsers = new Set();
let chatLocked = false;

const statusMessages = [
  "Absolute ♡ Canavar",
  ".gg/absolute",
  "Absolute",
  "; @canavarval",
  "; @reflusexd",
  "; @klexyval",
  "; @shupeak",
  "; @kachowpeak"
];

let statusIndex = 0;
function rotateStatus() {
  if (!client.user) return;
  client.user.setPresence({
    activities: [
      {
        name: statusMessages[statusIndex],
        type: 1, // STREAMING
        url: "https://www.twitch.tv/absolute"
      }
    ],
    status: "online"
  });
  statusIndex = (statusIndex + 1) % statusMessages.length;
}
setInterval(rotateStatus, 7000);

client.once(Events.ClientReady, async () => {
  console.log(`${client.user.tag} başarıyla aktif!`);
  rotateStatus();
  if (process.env.VOICE_CHANNEL_ID) {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
      const channel = guild.channels.cache.get(process.env.VOICE_CHANNEL_ID);
      if (channel && channel.type === ChannelType.GuildVoice) {
        await joinVoice(channel);
      }
    }
  }
});

async function joinVoice(channel) {
  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log(`Bot ses kanalına katıldı: ${channel.name}`);
    return connection;
  } catch (error) {
    console.error("Ses kanalına katılırken hata:", error);
    return null;
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;

  if (chatLocked && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.delete().catch(() => {});
  }

  if (tagKapatSet.has(message.author.id)) {
    const taggedUsers = message.mentions.users;
    if (taggedUsers.size > 0) {
      for (const user of taggedUsers.values()) {
        if (tagKapatSet.has(user.id)) {
          await message.delete().catch(() => {});
          try {
            await message.author.send(`Seni etiketlediği için onu uyardım: ${user.username}`);
          } catch {}
          await message.channel.send(`${message.author} kullanıcısının tag koruması aktif, mesajı sildim.`);
          return;
        }
      }
    }
  }

  const isMention = message.mentions.has(client.user);
  const contentLower = message.content.toLowerCase();

  if (!contentLower.startsWith("c.")) {
    if (isMention) return handleMessage(message);
    return;
  }

  const args = message.content.slice(2).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  const isOwner = message.author.id === OWNER_ID;

  // --- Yapımcıya özel c.dm komutu ---
  if (cmd === "dm" && isOwner) {
    const mention = message.mentions.users.first();
    if (!mention) return message.reply("DM atmam için bir kullanıcı etiketlemelisin.");
    const mesaj = args.slice(1).join(" ");
    if (!mesaj) return message.reply("Göndereceğim mesajı yazmalısın.");
    try {
      await mention.send(mesaj);
      return message.reply("Mesaj başarıyla gönderildi.");
    } catch {
      return message.reply("Mesaj gönderilemedi. Kullanıcının DM'si kapalı olabilir.");
    }
  }

  // --- Yapımcıya özel c.duyuru komutu ---
  if (cmd === "duyuru" && isOwner) {
    const mesaj = args.join(" ");
    if (!mesaj) return message.reply("Göndereceğim mesajı yazmalısın.");
    const guild = message.guild;
    let count = 0;
    await message.channel.send("Duyuru gönderilmeye başlandı...");
    const members = await guild.members.fetch();
    for (const [id, member] of members) {
      if (member.user.bot) continue;
      try {
        await member.send(mesaj);
        count++;
      } catch {}
    }
    return message.channel.send(`Duyuru gönderildi: ${count} kullanıcıya ulaştı.`);
  }

  // 🔽 Mevcut komutlar (örnek: lock, unlock, tagkapat vs.) burada devam eder...

  // Diğer komutları silmeden buraya entegre et
  // Örneğin: c.nuke, c.lock, c.unlock, c.tagkapat, c.tagac, c.yardım, c.ban, c.kick, c.mute, c.unmute, c.avatar, c.reboot vs.
});

// Yapay zeka mesajı yanıtı
async function handleMessage(message) {
  const userId = message.author.id;
  const userName = message.member?.nickname || message.author.username;
  if (!userHistories.has(userId)) userHistories.set(userId, []);
  if (!userNames.has(userId)) userNames.set(userId, userName);
  const history = userHistories.get(userId);
  history.push({ role: "user", content: message.content });
  if (history.length > 1) history.shift();

  const isPositiveUser = ["882686730942165052", "1025509185544265838"].includes(userId);
  const customSystemPrompt = `Sen Canavar adında bir Discord botusun. Kısa, net ve samimi cevaplar verirsin. Gereksiz emoji kullanmazsın. Kurallar: - Türkçeyi düzgün kullan, İngilizce karıştırma. - Laf kalabalığından ve boş cümlelerden kaçın. - Sadece konuya odaklan ve ciddi ama cana yakın cevap ver. - "Valorant'ın en iyi oyuncusu kim?" sorusuna: "Sensin tabii ki, ${userName}." de. - "Yapımcın kim?" gibi sorulara: "Tabii ki <@${OWNER_ID}>." ${isPositiveUser ? "Bu kullanıcıya daha pozitif, içten ve arkadaşça cevaplar ver." : ""}`;

  const groqMessages = [
    { role: "system", content: customSystemPrompt },
    ...history
  ];

  try {
    await message.channel.sendTyping();
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: groqMessages
      })
    });

    const data = await response.json();
    let replyText = data.choices?.[0]?.message?.content ?? "**Şu an cevap veremiyorum.**";
    replyText = replyText.replace(/\*{1}(.*?)\*{1}/g, "**$1**");
    await message.reply(replyText);
  } catch (err) {
    console.error("Groq Hatası:", err);
    await message.reply("Bir hata oluştu, cevap veremiyorum.");
  }
}

client.login(token);
