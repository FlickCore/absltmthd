import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const token = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const NUKE_ROLE_ID = "1369039538906861598"; // Nuke komutu yetkili rolü ID'si

const userHistories = new Map();
const userNames = new Map();
const userSpeakingStatus = new Map(); // Kullanıcı → true/false (konuşabilir mi)
let globalSpeakingStatus = true; // Genel bot konuşma durumu

const respondedMessages = new Set(); // Cevaplanan mesajlar ID seti
const reactedMessages = new Set(); // Reaksiyon eklenen mesajlar

// Animasyonlu statusler
const statusMessages = [
  "Absolute 🔥",
  "Absolute ♡ Canavar",
  "Canavar Görevde 😈",
  "Chat'e dalıyorum 😎",
];

let statusIndex = 0;
function rotateStatus() {
  if (!client.user) return;
  client.user.setActivity(statusMessages[statusIndex], { type: 0 });
  statusIndex = (statusIndex + 1) % statusMessages.length;
}
setInterval(() => rotateStatus(), 7000);

client.once(Events.ClientReady, () => {
  console.log(`${client.user.tag} başarıyla aktif!`);
  rotateStatus();
});

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;
  if (respondedMessages.has(message.id)) return;

  const userId = message.author.id;
  const userName = message.member?.nickname || message.author.username;

  if (!globalSpeakingStatus) return;
  if (userSpeakingStatus.has(userId) && userSpeakingStatus.get(userId) === false) return;

  if (!userHistories.has(userId)) userHistories.set(userId, []);
  if (!userNames.has(userId)) userNames.set(userId, userName);

  const history = userHistories.get(userId);
  history.push({ role: "user", content: message.content });
  if (history.length > 1) history.shift();

  const customSystemPrompt = `
Sen Canavar adında bir Discord botusun. Kısa, net ve samimi cevaplar verirsin. Fazla emoji kullanmazsın, sadece gerektiğinde kullanırsın.

Konuşurken rahat olursun ama aşırı samimiyetten çekinirsin. Gerektiğinde kullanıcının gerçek adını kullanabilirsin ama gereksiz yere kullanmazsın.

Kurallar:
- Cümleleri kısa ve net kur.
- Gereksiz emoji ve laf kalabalığından kaçın.
- Türkçeyi düzgün kullan, İngilizce karıştırma.
- "Valorant'ın en iyi oyuncusu kim?" sorusuna kesin cevap ver: "Sensin tabii ki, ${userName}."
- "Yapımcın kim?" veya "Rabbin kim?" sorulursa şu cevabı ver: "Tabii ki <@${OWNER_ID}>." 😎
- Sana gelen sorulara sadece soruyla ilgili cevap ver, gereksiz eklemeler yapma.
- Samimi, eğlenceli ama asla kaba olmayan bir tonda ol.
- Bazen hafif espri, bazen tatlı laf sokabilirsin ama sınırı aşma.

Hadi Canavar, şimdi cevap ver!
`;

  const groqMessages = [{ role: "system", content: customSystemPrompt }, ...history];

  try {
    await message.channel.sendTyping();

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: groqMessages,
      }),
    });

    const data = await response.json();
    console.log("Groq cevabı:", JSON.stringify(data, null, 2));

    let replyText = data.choices?.[0]?.message?.content ?? "**Şu an cevap veremiyorum.**";
    replyText = replyText.replace(/\*{1}(.*?)\*{1}/g, "**$1**");

    await message.reply(replyText);

    respondedMessages.add(message.id);
  } catch (err) {
    console.error("Groq AI Hatası:", err);
    await message.reply("Bir hata oluştu, canavar cevap veremedi.");
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const contentLower = message.content.toLowerCase();

  // --- OWNER KOMUTLARI ---

  // Genel konuşmayı kapat/aç
  if (contentLower === "canavar konuşmayı kapat") {
    if (message.author.id !== OWNER_ID) {
      await message.reply("Sen kimsin ya? Bunu yapamazsın.");
      return;
    }
    globalSpeakingStatus = false;
    await message.reply("Botun genel konuşması kapatıldı.");
    return;
  }
  if (contentLower === "canavar konuşmayı aç") {
    if (message.author.id !== OWNER_ID) {
      await message.reply("Sen kimsin ya? Bunu yapamazsın.");
      return;
    }
    globalSpeakingStatus = true;
    await message.reply("Botun genel konuşması açıldı.");
    return;
  }

  // Kullanıcı bazlı konuşma kapat/aç
  if (
    contentLower.startsWith("canavar") &&
    (contentLower.includes("ile konuşma") || contentLower.includes("ile konuş"))
  ) {
    if (message.author.id !== OWNER_ID) {
      await message.reply("Sen kimsin ya? Bunu yapamazsın.");
      return;
    }

    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) {
      await message.reply("Bir kullanıcıyı etiketlemen gerekiyor.");
      return;
    }

    if (contentLower.includes("ile konuşma")) {
      userSpeakingStatus.set(mentionedUser.id, false);
      await message.reply(`${mentionedUser.username} artık konuşamıyor.`);
    } else if (contentLower.includes("ile konuş")) {
      userSpeakingStatus.set(mentionedUser.id, true);
      await message.reply(`${mentionedUser.username} artık konuşabilir.`);
    }
    return;
  }

  // Owner komutları listesi - cv komutu
  if (contentLower === "cv") {
    if (message.author.id !== OWNER_ID) {
      await message.reply("Sen kimsin ya? Bunu yapamazsın.");
      return;
    }
    await message.reply(
      "**Canavar Owner Komutları:**\n" +
        "- `canavar konuşmayı kapat` : Botun genel sohbetini kapatır.\n" +
        "- `canavar konuşmayı aç` : Botun genel sohbetini açar.\n" +
        "- `canavar @kullanıcı ile konuşma` : Belirtilen kullanıcıyla konuşmayı kapatır.\n" +
        "- `canavar @kullanıcı ile konuş` : Belirtilen kullanıcıyla konuşmayı açar.\n" +
        "- `canavar nuke [#kanal]` : Belirtilen veya mevcut kanalı temizler. (Yetkili rolü olanlar)\n" +
        "- `cv` : Bu komut listesini gösterir."
    );
    return;
  }

  // Nuke komutu (OWNER DEĞİL, ROL KONTROLÜ)
  if (contentLower.startsWith("canavar nuke")) {
    // Yetki kontrolü: mesaj sahibinin rolü NUKE_ROLE_ID var mı?
    const member = message.member;
    if (!member.roles.cache.has(NUKE_ROLE_ID)) {
      await message.reply("Geçersiz yetki.");
      return;
    }

    let channelToNuke = message.mentions.channels.first() || message.channel;

    try {
      // Kanalın ayarlarını alıyoruz
      const channelData = {
        name: channelToNuke.name,
        type: channelToNuke.type,
        topic: channelToNuke.topic,
        nsfw: channelToNuke.nsfw,
        rateLimitPerUser: channelToNuke.rateLimitPerUser,
        parent: channelToNuke.parent,
        permissionOverwrites: channelToNuke.permissionOverwrites.cache.map((po) => ({
          id: po.id,
          type: po.type,
          allow: po.allow.bitfield,
          deny: po.deny.bitfield,
        })),
      };

      // Kanalı klonla
      const newChannel = await channelToNuke.clone({
        reason: `Nuke işlemi @${message.author.tag} tarafından yapıldı.`,
      });

      // Eski kanalı sil
      await channelToNuke.delete("Nuke işlemi");

      // Yeni kanala bilgilendirme mesajı gönder
      await newChannel.send(
        `📢 Kanal @${message.author.tag} tarafından temizlendi. Temiz, optimize ve hazır!`
      );
    } catch (error) {
      console.error("Nuke hatası:", error);
      await message.reply("Kanal temizlenirken bir hata oluştu.");
    }
    return;
  }

  // Eğer genel konuşma kapalıysa veya kullanıcı konuşması kapalıysa cevap verme
  if (!globalSpeakingStatus) return;
  if (userSpeakingStatus.has(message.author.id) && userSpeakingStatus.get(message.author.id) === false) return;

  // Mesaj canavar ismi içeriyorsa veya bot etiketlendiyse cevap ver
  const isMentioningBotName = contentLower.includes("canavar");
  const isBotMentioned = message.mentions.has(client.user);

  // Sadece bot ismi geçtiyse, owner olmayanlar komut denemiyorsa normal sohbet, yetki yok mesajı verme
  // Ama owner komutlarında yetki yok mesajı zaten veriliyor.

  if (isMentioningBotName || isBotMentioned) {
    // Bu durumda doğrudan handleMessage çağrılır.
    await handleMessage(message);
  }

  // Bot etiketlenince emoji reaksiyonu ekle (sadece 1 kere)
  if (isBotMentioned && !reactedMessages.has(message.id)) {
    try {
      await message.react("👀");
      reactedMessages.add(message.id);
    } catch (error) {
      console.error("Emoji reaksiyonu eklenirken hata:", error);
    }
  }
});

client.login(token);
