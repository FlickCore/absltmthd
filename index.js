import pkg from "discord.js";
const { Client, GatewayIntentBits, Partials, Events, PermissionsBitField, EmbedBuilder } = pkg;
import { joinVoiceChannel, entersState, VoiceConnectionStatus } from "@discordjs/voice";
import fetch from "node-fetch";
import dotenv from "dotenv";
import http from "http";
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
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const token = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const GUILD_ID = process.env.GUILD_ID;

const userHistories = new Map();
const userNames = new Map();
const userSpeakingStatus = new Map();
let globalSpeakingStatus = true;

const respondedMessages = new Set();
const reactedMessages = new Set();

const tagKapatSet = new Set(); // tag kapatılan kullanıcılar id
const mutedUsers = new Set(); // sunucuda mute edilen kullanıcılar
let chatLocked = false; // sohbet kilitli mi

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
  // Yayında (streaming) olarak ayarla
  client.user.setActivity(statusMessages[statusIndex], { type: "STREAMING", url: "discord.gg/absolute" });
  statusIndex = (statusIndex + 1) % statusMessages.length;
}
setInterval(rotateStatus, 7000);

// SES OYNATMA ÖZELLİĞİ KALDIRILDI (hata veriyordu)

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

client.once(Events.ClientReady, async () => {
  console.log(`${client.user.tag} başarıyla aktif!`);
  rotateStatus();
  if (process.env.VOICE_CHANNEL_ID) {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (guild) {
      const channel = guild.channels.cache.get(process.env.VOICE_CHANNEL_ID);
      if (channel && channel.type === 2) {
        await joinVoice(channel);
      }
    }
  }
});

// Onay için reaction emojileri
const CHECK_EMOJI = "✅";
const CROSS_EMOJI = "❌";

async function askConfirmation(message, question) {
  const filter = (reaction, user) => {
    return [CHECK_EMOJI, CROSS_EMOJI].includes(reaction.emoji.name) && user.id === message.author.id;
  };

  const confirmMessage = await message.channel.send(question);
  await confirmMessage.react(CHECK_EMOJI);
  await confirmMessage.react(CROSS_EMOJI);

  try {
    const collected = await confirmMessage.awaitReactions({ filter, max: 1, time: 15000, errors: ["time"] });
    const reaction = collected.first();
    return reaction.emoji.name === CHECK_EMOJI;
  } catch {
    await message.channel.send("İşlem zaman aşımına uğradı.");
    return false;
  }
}

async function handleMessage(message) {
  // Yapay zeka sadece bot etiketlenince ya da reply yapılınca cevap versin
  if (
    !message.mentions.has(client.user) &&
    !message.reference
  ) return;

  const userId = message.author.id;
  const userName = message.member?.nickname || message.author.username;
  if (!userHistories.has(userId)) userHistories.set(userId, []);
  if (!userNames.has(userId)) userNames.set(userId, userName);
  const history = userHistories.get(userId);
  history.push({ role: "user", content: message.content });
  if (history.length > 1) history.shift();

  const isPositiveUser = ["882686730942165052", "1025509185544265838"].includes(userId);
  const customSystemPrompt = ` Sen Canavar adında bir Discord botusun. Kısa, net ve samimi cevaplar verirsin. Gereksiz emoji kullanmazsın. Kurallar: - Türkçeyi düzgün kullan, İngilizce karıştırma. - Laf kalabalığından ve boş cümlelerden kaçın. - Sadece konuya odaklan ve ciddi ama cana yakın cevap ver. - "Valorant'ın en iyi oyuncusu kim?" sorusuna: "Sensin tabii ki, ${userName}." de. - "Yapımcın kim?" gibi sorulara: "Tabii ki <@${OWNER_ID}>." 😎 ${isPositiveUser ? "Bu kullanıcıya daha pozitif, içten ve arkadaşça cevaplar ver." : ""} `;

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
    respondedMessages.add(message.id);
  } catch (err) {
    console.error("Groq Hatası:", err);
    await message.reply("Bir hata oluştu, cevap veremiyorum.");
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // Chat kilitleme kontrolü
  if (chatLocked && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.delete().catch(() => { });
  }

  // Tag kapalıysa, tagı engelle
  if (tagKapatSet.has(message.author.id)) {
    // Taglanan kişi varsa ve mesajda tag var mı?
    const taggedUsers = message.mentions.users;
    if (taggedUsers.size > 0) {
      for (const user of taggedUsers.values()) {
        if (tagKapatSet.has(user.id)) {
          // Mesajı sil ve özelden uyar
          await message.delete().catch(() => { });
          try {
            await message.author.send(`Seni etiketlediği için onu uyardım: ${user.username}`);
          } catch { }
          await message.channel.send(`${message.author} kullanıcısının tag koruması aktif, mesajı sildim.`);
          return;
        }
      }
    }
  }

  const isMention = message.mentions.has(client.user);
  const contentLower = message.content.toLowerCase();

  // Prefix: c. olarak ayarlandı
  if (!contentLower.startsWith("c.")) return;

  const args = message.content.slice(2).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  // Komutlar:

  if (cmd === "connect") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Connect)) {
      return message.reply("Ses kanalına bağlanmak için yetkin yok.");
    }
    if (args.length < 1) return message.reply("Lütfen bir ses kanalı ID'si belirt.");
    const channelId = args[0];
    const guild = message.guild;
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== 2) return message.reply("Geçerli bir ses kanalı ID'si gir.");
    await joinVoice(channel);
    return message.reply(`Ses kanalına bağlandım: **${channel.name}**`);
  }

  if (cmd === "nuke") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("Bu komutu kullanmak için 'Kanalları Yönet' yetkisine sahip olmalısın.");
    }
    const onay = await askConfirmation(message, `${message.author}, gerçekten bu kanalı silmek istediğine emin misin?`);
    if (!onay) return message.channel.send("İşlem iptal edildi.");
    try {
      await message.channel.delete();
    } catch {
      return message.channel.send("Kanalı silerken bir hata oluştu.");
    }
    return;
  }

  if (cmd === "ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply("Üyeleri yasaklamak için yetkin yok.");
    }
    const user = message.mentions.users.first();
    if (!user) return message.reply("Lütfen banlamak istediğin kullanıcıyı etiketle.");
    const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
    try {
      const member = message.guild.members.cache.get(user.id);
      if (!member) return message.reply("Kullanıcı sunucuda değil.");
      await member.ban({ reason });
      return message.channel.send(`${user.tag} sunucudan yasaklandı. Sebep: ${reason}`);
    } catch {
      return message.reply("Ban işlemi sırasında hata oluştu.");
    }
  }

  if (cmd === "kick") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return message.reply("Üyeleri atmak için yetkin yok.");
    }
    const user = message.mentions.users.first();
    if (!user) return message.reply("Lütfen atmak istediğin kullanıcıyı etiketle.");
    const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
    try {
      const member = message.guild.members.cache.get(user.id);
      if (!member) return message.reply("Kullanıcı sunucuda değil.");
      await member.kick(reason);
      return message.channel.send(`${user.tag} sunucudan atıldı. Sebep: ${reason}`);
    } catch {
      return message.reply("Atma işlemi sırasında hata oluştu.");
    }
  }

  if (cmd === "mute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.MuteMembers)) {
      return message.reply("Üyeleri susturmak için yetkin yok.");
    }
    const user = message.mentions.users.first();
    if (!user) return message.reply("Lütfen susturmak istediğin kullanıcıyı etiketle.");
    mutedUsers.add(user.id);
    return message.channel.send(`${user.tag} susturuldu.`);
  }

  if (cmd === "unmute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.MuteMembers)) {
      return message.reply("Üyelerin susturmasını kaldırmak için yetkin yok.");
    }
    const user = message.mentions.users.first();
    if (!user) return message.reply("Lütfen susturmasını kaldırmak istediğin kullanıcıyı etiketle.");
    mutedUsers.delete(user.id);
    return message.channel.send(`${user.tag} susturulması kaldırıldı.`);
  }

  if (cmd === "yazdir") {
    if (message.author.id !== OWNER_ID) return message.reply("Bu komutu sadece yapımcım kullanabilir.");
    if (args.length < 1) return message.reply("Yazdırmak istediğin metni belirt.");
    const text = args.join(" ");
    return message.channel.send(text);
  }

  if (cmd === "tagkapat") {
    // Tag koruma aç/kapat
    if (tagKapatSet.has(message.author.id)) {
      tagKapatSet.delete(message.author.id);
      return message.reply("Tag koruması kapatıldı.");
    } else {
      tagKapatSet.add(message.author.id);
      return message.reply("Tag koruması açıldı. Artık seni etiketleyenlere uyarı mesajı gönderilecektir.");
    }
  }

  if (cmd === "avatar") {
    const user = message.mentions.users.first() || message.author;
    const embed = new EmbedBuilder()
      .setTitle(`${user.username}#${user.discriminator} - Avatar`)
      .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }))
      .setColor("#00ff00");
    return message.channel.send({ embeds: [embed] });
  }

  if (cmd === "dm") {
    if (message.author.id !== OWNER_ID) return message.reply("Bu komutu sadece yapımcım kullanabilir.");
    if (args.length < 2) return message.reply("Lütfen kullanıcı ID'si ve mesaj belirt.");
    const userId = args.shift();
    const dmMessage = args.join(" ");
    try {
      const user = await client.users.fetch(userId);
      await user.send(dmMessage);
      return message.reply("Mesaj gönderildi.");
    } catch {
      return message.reply("Mesaj gönderilirken hata oluştu.");
    }
  }

  if (cmd === "yardim") {
    const embed = new EmbedBuilder()
      .setColor("#0099ff")
      .setTitle("Canavar Bot Komutları")
      .setDescription(`
**c.nuke** - Kanalı siler (yönetici yetkisi gerektirir).
**c.ban @kullanıcı [sebep]** - Kullanıcıyı banlar.
**c.kick @kullanıcı [sebep]** - Kullanıcıyı sunucudan atar.
**c.mute @kullanıcı** - Kullanıcıyı susturur.
**c.unmute @kullanıcı** - Susturmayı kaldırır.
**c.yazdir [metin]** - Bot metin yazdırır (sadece yapımcı).
**c.tagkapat** - Tag korumasını açar/kapatır.
**c.avatar [@kullanıcı]** - Kullanıcının avatarını gösterir.
**c.dm [kullanıcıID] [mesaj]** - Yapımcıya özel DM gönderir.
`);

    return message.channel.send({ embeds: [embed] });
  }

  if (cmd === "reboot") {
    if (message.author.id !== OWNER_ID) return message.reply("Bu komutu sadece yapımcım kullanabilir.");
    await message.reply("Bot yeniden başlatılıyor...");
    process.exit(0);
  }

  // Eğer komut değilse ve bot etiketlenmişse yapay zekaya yönlendir
  if (isMention) {
    return handleMessage(message);
  }
});

client.login(token);

// HTTP server, Render.com için canlı tutar
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Canavar Bot aktif!");
}).listen(process.env.PORT || 3000);
