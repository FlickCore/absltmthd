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
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const token = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const GUILD_ID = process.env.GUILD_ID;

const userHistories = new Map();
const userNames = new Map();

const tagKapatSet = new Set(); // tag koruması kapalı olan kullanıcılar
const mutedUsers = new Set(); // mute edilenler
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
  client.user.setActivity(statusMessages[statusIndex], { type: "STREAMING", url: "https://twitch.tv/absolute" });
  statusIndex = (statusIndex + 1) % statusMessages.length;
}
setInterval(rotateStatus, 7000);

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
    const guild = client.guilds.cache.get(GUILD_ID);
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

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (chatLocked && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return message.delete().catch(() => { });
  }

  if (tagKapatSet.has(message.author.id)) {
    const taggedUsers = message.mentions.users;
    if (taggedUsers.size > 0) {
      for (const user of taggedUsers.values()) {
        if (tagKapatSet.has(user.id)) {
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

  if (!contentLower.startsWith("c.")) {
    // Yapay zekaya sadece etiketlenince yanıt veriyor
    if (isMention) return handleMessage(message);
    return;
  }

  const args = message.content.slice(2).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  // Komutlar

  if (cmd === "connect") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Connect)) {
      return message.reply("Ses kanalına bağlanmak için yetkin yok.");
    }
    if (args.length < 1) return message.reply("Lütfen bir ses kanalı ID'si belirt.");
    const channelId = args[0];
    const guild = message.guild;
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) return message.reply("Geçerli bir ses kanalı ID'si gir.");
    await joinVoice(channel);
    return message.reply(`Ses kanalına bağlandım: **${channel.name}**`);
  }

  if (cmd === "nuke") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("Bu komutu kullanmak için 'Kanalları Yönet' yetkisine sahip olmalısın.");
    }
    const onay = await askConfirmation(message, `${message.author}, gerçekten bu kanalı silmek istediğine emin misin?`);
    if (!onay) return message.channel.send("İşlem iptal edildi.");

    const oldChannel = message.channel;
    const guild = oldChannel.guild;
    try {
      // Kanalın özelliklerini kopyala
      const position = oldChannel.position;
      const name = oldChannel.name;
      const type = oldChannel.type;
      const parentId = oldChannel.parentId;
      const permissionOverwrites = oldChannel.permissionOverwrites.cache.map(po => ({
        id: po.id,
        type: po.type,
        allow: po.allow.bitfield.toString(),
        deny: po.deny.bitfield.toString()
      }));

      // Kanalı sil
      await oldChannel.delete();

      // Yeni kanal oluştur
      const newChannel = await guild.channels.create({
        name,
        type,
        parent: parentId,
        permissionOverwrites: permissionOverwrites.map(po => ({
          id: po.id,
          type: po.type,
          allow: BigInt(po.allow),
          deny: BigInt(po.deny)
        }))
      });

      // Pozisyonu ayarla
      await newChannel.setPosition(position);

      // Bilgi mesajı gönder
      await newChannel.send(`${message.author} kanalı nuke'ladı, kanal yenilendi.`);

    } catch (error) {
      console.error("Nuke hatası:", error);
      return message.channel.send("Kanalı yenilerken bir hata oluştu.");
    }
    return;
  }

  if (cmd === "lock") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("Bu komutu kullanmak için 'Kanalları Yönet' yetkisine sahip olmalısın.");
    }
    const channel = message.channel;
    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      await message.channel.send("Kanal kilitlendi, sadece yetkililer yazabilir.");
    } catch {
      await message.channel.send("Kanal kilitlenirken bir hata oluştu.");
    }
    return;
  }

  if (cmd === "unlock") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("Bu komutu kullanmak için 'Kanalları Yönet' yetkisine sahip olmalısın.");
    }
    const channel = message.channel;
    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: true });
      await message.channel.send("Kanalın kilidi kaldırıldı, herkes yazabilir.");
    } catch {
      await message.channel.send("Kanal kilit açılırken bir hata oluştu.");
    }
    return;
  }

  if (cmd === "tagkapat") {
    if (tagKapatSet.has(message.author.id)) {
      tagKapatSet.delete(message.author.id);
      return message.reply("Tag koruması kapatıldı.");
    } else {
      tagKapatSet.add(message.author.id);
      return message.reply("Tag koruması açıldı.");
    }
  }

  if (cmd === "tagac") {
    if (tagKapatSet.has(message.author.id)) {
      tagKapatSet.delete(message.author.id);
      return message.reply("Tag koruması açıldı.");
    } else {
      return message.reply("Tag koruması zaten açık.");
    }
  }

  if (cmd === "yardım" || cmd === "help") {
    const helpEmbed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle("Canavar Bot Komutları")
      .setDescription("Prefix: `c.`\n\n" +
        "`c.nuke` - Kanalı silip yeniler (Yetkili)\n" +
        "`c.lock` - Kanalı kilitler (Yetkili)\n" +
        "`c.unlock` - Kanal kilidini açar (Yetkili)\n" +
        "`c.tagkapat` - Kendi için tag korumasını aç/kapat\n" +
        "`c.tagac` - Kendi için tag korumasını açar\n" +
        "`c.yazdir` - Yapımcıya özel, botun mesaj yazması\n" +
        "`c.ban` - Üyeyi yasaklar (Yetkili)\n" +
        "`c.kick` - Üyeyi atar (Yetkili)\n" +
        "`c.mute` - Üyeyi susturur (Yetkili)\n" +
        "`c.unmute` - Üyeyi susturmayı kaldırır (Yetkili)\n" +
        "`c.avatar` - Kullanıcının avatarını gösterir\n" +
        "`c.reboot` - Botu yeniden başlatır (Yapımcı)\n"
      )
      .setFooter({ text: "Canavar Bot © 2025" });
    return message.channel.send({ embeds: [helpEmbed] });
  }

  // Diğer komutlar burada...

});

client.login(token);
