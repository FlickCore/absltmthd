import pkg from "discord.js";
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  PermissionsBitField,
  EmbedBuilder,
  ChannelType
} = pkg;

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
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences // Yayında durumu için önemli!
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User]
});

// Yayın mesajları
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
  client.user.setActivity(statusMessages[statusIndex], {
    type: "STREAMING",
    url: "https://www.twitch.tv/absolute"
  });
  statusIndex = (statusIndex + 1) % statusMessages.length;
}

client.on('ready', () => {
  console.log(`${client.user.tag} hazır!`);
  rotateStatus(); // İlk durum
  setInterval(rotateStatus, 7000); // Her 7 saniyede bir değiştir
});
// SES OYNATMA ÖZELLİĞİ KALDIRILDI

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
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (guild) {
      const channel = guild.channels.cache.get(process.env.VOICE_CHANNEL_ID);
      if (channel && channel.type === ChannelType.GuildVoice) {
        await joinVoice(channel);
      }
    }
  }
});

// Onay emoji
const CHECK_EMOJI = "✅";
const CROSS_EMOJI = "❌";

// Global değişkenler (eksik olanlar)
const chatLocked = false; // Chat kilit durumu için; bunu kendi mantığına göre yönetmelisin
const tagKapatSet = new Set(); // Tag koruması için
const mutedUsers = new Set(); // Susturulan kullanıcılar için
const userHistories = new Map(); // Yapay zeka sohbet geçmişi için
const userNames = new Map(); // Kullanıcı isimleri için
const OWNER_ID = process.env.OWNER_ID || "SahipIDBuraya"; // Yapımcı ID'si mutlaka .env veya burada tanımlı olmalı
const GROQ_API_KEY = process.env.GROQ_API_KEY || ""; // API anahtarı .env'den alınmalı

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

// Mute rolünü yönetmek için
async function getMuteRole(guild) {
  let muteRole = guild.roles.cache.find(r => r.name === "Canavar Mute");
  if (!muteRole) {
    try {
      muteRole = await guild.roles.create({
        name: "Canavar Mute",
        color: "GRAY",
        reason: "Mute rolü oluşturuldu"
      });
      for (const channel of guild.channels.cache.values()) {
        await channel.permissionOverwrites.edit(muteRole, {
          SendMessages: false,
          Speak: false,
          AddReactions: false
        });
      }
    } catch (err) {
      console.error("Mute rolü oluşturulamadı:", err);
      return null;
    }
  }
  return muteRole;
}

client.on(Events.MessageCreate, async (message) => {
  await handleMessage(message);
});

async function handleMessage(message) {
  if (message.author.bot) return;

  // Chat kilitliyse, admin değilse mesajı sil
  if (chatLocked && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    await message.delete().catch(() => {});
    return;
  }

  // Tag koruması aktif mi?
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

  // Yapay zekaya sadece bot etiketlenince veya prefix ile komut girilince yanıt verir
  const isMention = message.mentions.has(client.user);
  if (!message.content.toLowerCase().startsWith("c.") && !isMention) return;

  if (isMention && !message.content.toLowerCase().startsWith("c.")) {
    // Yapay zeka cevabı için (etiketlenince)
    const userId = message.author.id;
    const userName = message.member?.nickname || message.author.username;
    if (!userHistories.has(userId)) userHistories.set(userId, []);
    if (!userNames.has(userId)) userNames.set(userId, userName);
    const history = userHistories.get(userId);
    history.push({ role: "user", content: message.content });
    if (history.length > 1) history.shift();

    const isPositiveUser = ["882686730942165052", "1025509185544265838"].includes(userId);
    const customSystemPrompt = `Sen Canavar adında bir Discord botusun. Kısa, net ve samimi cevaplar verirsin. Gereksiz emoji kullanmazsın. Kurallar:
- Türkçeyi düzgün kullan, İngilizce karıştırma.
- Laf kalabalığından ve boş cümlelerden kaçın.
- Sadece konuya odaklan ve ciddi ama cana yakın cevap ver.
- "Valorant'ın en iyi oyuncusu kim?" sorusuna: "Sensin tabii ki, ${userName}." de.
- "Yapımcın kim?" gibi sorulara: "Tabii ki <@${OWNER_ID}>."
${isPositiveUser ? "Bu kullanıcıya daha pozitif, içten ve arkadaşça cevaplar ver." : ""}`;

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
    return;
  }

  // Prefix komutları: c.nuke, c.kick, c.ban, c.mute, c.unmute, c.yardım, c.tagkapat, c.yazdir, c.avatar, c.dm, c.reboot vb.

  const args = message.content.slice(2).trim().split(/ +/g);
  const command = args.shift().toLowerCase();

  // Admin ve yapımcı kontrolleri
  const isOwner = message.author.id === OWNER_ID;
  const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);

  // Komutlar:

  if (command === "nuke") {
    if (!isAdmin) return message.reply("Bu komutu kullanmak için yönetici olmalısın.");
    const count = parseInt(args[0]) || 50;
    try {
      const messages = await message.channel.messages.fetch({ limit: count });
      await message.channel.bulkDelete(messages, true);
      message.channel.send(`${messages.size} mesaj silindi.`).then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
    } catch (err) {
      message.reply("Mesajlar silinirken hata oluştu.");
    }
  } else if (command === "kick") {
    if (!isAdmin) return message.reply("Bu komutu kullanmak için yönetici olmalısın.");
    const user = message.mentions.members.first();
    if (!user) return message.reply("Bir kullanıcıyı etiketlemelisin.");
    if (!user.kickable) return message.reply("Bu kullanıcıyı atamıyorum.");
    const reason = args.slice(1).join(" ") || "Belirtilmedi";
    try {
      await user.kick(reason);
      message.channel.send(`${user.user.tag} sunucudan atıldı.`);
    } catch {
      message.reply("Kullanıcı atılamadı.");
    }
  } else if (command === "ban") {
    if (!isAdmin) return message.reply("Bu komutu kullanmak için yönetici olmalısın.");
    const user = message.mentions.members.first();
    if (!user) return message.reply("Bir kullanıcıyı etiketlemelisin.");
    if (!user.bannable) return message.reply("Bu kullanıcıyı banlayamıyorum.");
    const reason = args.slice(1).join(" ") || "Belirtilmedi";
    try {
      await user.ban({ reason });
      message.channel.send(`${user.user.tag} sunucudan yasaklandı.`);
    } catch {
      message.reply("Kullanıcı banlanamadı.");
    }
  } else if (command === "mute") {
    if (!isAdmin) return message.reply("Bu komutu kullanmak için yönetici olmalısın.");
    const user = message.mentions.members.first();
    if (!user) return message.reply("Bir kullanıcıyı etiketlemelisin.");
    const muteRole = await getMuteRole(message.guild);
    if (!muteRole) return message.reply("Mute rolü bulunamadı veya oluşturulamadı.");
    if (user.roles.cache.has(muteRole.id)) return message.reply("Bu kullanıcı zaten susturulmuş.");
    try {
      await user.roles.add(muteRole);
      mutedUsers.add(user.id);
      message.channel.send(`${user.user.tag} susturuldu.`);
    } catch {
      message.reply("Susturma işlemi başarısız.");
    }
  } else if (command === "unmute") {
    if (!isAdmin) return message.reply("Bu komutu kullanmak için yönetici olmalısın.");
    const user = message.mentions.members.first();
    if (!user) return message.reply("Bir kullanıcıyı etiketlemelisin.");
    const muteRole = await getMuteRole(message.guild);
    if (!muteRole) return message.reply("Mute rolü bulunamadı veya oluşturulamadı.");
    if (!user.roles.cache.has(muteRole.id)) return message.reply("Bu kullanıcı susturulmamış.");
    try {
      await user.roles.remove(muteRole);
      mutedUsers.delete(user.id);
      message.channel.send(`${user.user.tag} susturulması kaldırıldı.`);
    } catch {
      message.reply("Susturma kaldırma işlemi başarısız.");
    }
  } else if (command === "yardım" || command === "help") {
    const embed = new EmbedBuilder()
      .setTitle("Canavar Bot Komutları")
      .setDescription("Tüm komutlar `c.` prefixi ile çalışır.\n\n" +
        "**c.nuke [sayı]** - Son mesajları siler\n" +
        "**c.kick @kullanıcı [sebep]** - Kullanıcıyı atar\n" +
        "**c.ban @kullanıcı [sebep]** - Kullanıcıyı banlar\n" +
        "**c.mute @kullanıcı** - Kullanıcıyı susturur\n" +
        "**c.unmute @kullanıcı** - Susturmayı kaldırır\n" +
        "**c.tagkapat** - Etiket korumasını aç/kapat\n" +
        "**c.yazdir [metin]** - Botun yazmasını sağlar (Yapımcıya özel)\n" +
        "**c.avatar [@kullanıcı]** - Kullanıcının avatarını gösterir\n" +
        "**c.dm @kullanıcı [mesaj]** - Yapımcıdan DM gönderir\n" +
        "**c.reboot** - Botu yeniden başlatır (Yapımcıya özel)")
      .setColor("DarkBlue")
      .setFooter({ text: "Canavar Bot" });

    await message.channel.send({ embeds: [embed] });
  } else if (command === "tagkapat") {
    if (!isAdmin) return message.reply("Bu komutu kullanmak için yönetici olmalısın.");
    if (tagKapatSet.has(message.author.id)) {
      tagKapatSet.delete(message.author.id);
      message.channel.send("Tag koruması kapatıldı.");
    } else {
      tagKapatSet.add(message.author.id);
      message.channel.send("Tag koruması açıldı.");
    }
  } else if (command === "yazdir") {
    if (!isOwner) return message.reply("Bu komutu sadece yapımcım kullanabilir.");
    if (args.length === 0) return message.reply("Yazdırmak için bir metin gir.");
    const text = args.join(" ");
    await message.channel.send(text);
  } else if (command === "avatar") {
    let user = message.mentions.users.first() || message.author;
    const avatarUrl = user.displayAvatarURL({ dynamic: true, size: 512 });
    const embed = new EmbedBuilder()
      .setTitle(`${user.username} kullanıcısının avatarı`)
      .setImage(avatarUrl)
      .setColor("DarkGreen");
    await message.channel.send({ embeds: [embed] });
  } else if (command === "dm") {
    if (!isOwner) return message.reply("Bu komutu sadece yapımcım kullanabilir.");
    const user = message.mentions.users.first();
    if (!user) return message.reply("Bir kullanıcıyı etiketlemelisin.");
    const dmMessage = args.slice(1).join(" ");
    if (!dmMessage) return message.reply("Gönderilecek mesajı yazmalısın.");
    try {
      await user.send(dmMessage);
      message.channel.send("Mesaj gönderildi.");
    } catch {
      message.reply("Mesaj gönderilemedi.");
    }
  } else if (command === "reboot") {
    if (!isOwner) return message.reply("Bu komutu sadece yapımcım kullanabilir.");
    await message.channel.send("Bot yeniden başlatılıyor...");
    process.exit(0);
  }
}

// Render.com için otomatik yeniden başlatma
process.on("uncaughtException", (err) => {
  console.error("Beklenmeyen hata:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

client.login(process.env.TOKEN);
