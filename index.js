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
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const token = process.env.TOKEN;

const userHistories = new Map();
const userNames = new Map();
const userSpeakingStatus = new Map(); // Kullanıcı ID → true/false (konuşabilir mi)
let globalSpeakingStatus = true; // Genel bot konuşma durumu (true=aktif, false=kapalı)

const respondedMessages = new Set(); // Mesaj ID'si tekrar cevap vermemek için
const reactedMessages = new Set(); // Reaksiyon eklenen mesajlar

// Animasyonlu statusler
const statusMessages = [
  "Absolute 🔥",
  "Absolute ♡ Canavar",
  "Canavar Görevde 😈",
  "Chat'e dalıyorum 😎"
];

let statusIndex = 0;
function rotateStatus() {
  if (!client.user) return;
  client.user.setActivity(statusMessages[statusIndex], { type: 0 }); // 0 = Playing
  statusIndex = (statusIndex + 1) % statusMessages.length;
}
setInterval(() => {
  rotateStatus();
}, 7000); // 7 saniyede bir değiştir

client.once(Events.ClientReady, () => {
  console.log(`${client.user.tag} başarıyla aktif!`);
  rotateStatus();
});

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;
  if (respondedMessages.has(message.id)) return; // Aynı mesaja 2. kez cevap verme

  const userId = message.author.id;
  const userName = message.member?.nickname || message.author.username;

  // Genel konuşma kapalıysa cevap verme
  if (!globalSpeakingStatus) return;

  // Eğer kullanıcı konuşması kapalıysa cevap verme
  if (userSpeakingStatus.has(userId) && userSpeakingStatus.get(userId) === false) {
    return;
  }

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
- "Yapımcın kim?" veya "Rabbin kim?" sorulursa şu cevabı ver: "Tabii ki <@${process.env.OWNER_ID}>." 😎
- Owner dışındaki kullanıcılar botun ayar komutlarını kullanmaya kalkarsa, onlara "Sen kimsin ya? Bunu yapamazsın." de.
- Sana gelen sorulara sadece soruyla ilgili cevap ver, gereksiz eklemeler yapma.
- Samimi, eğlenceli ama asla kaba olmayan bir tonda ol.
- Bazen hafif espri, bazen tatlı laf sokabilirsin ama sınırı aşma.

Hadi Canavar, şimdi cevap ver!
`;

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
        model: "llama-3.3-70b-versatile",
        messages: groqMessages
      })
    });

    const data = await response.json();
    console.log("Groq cevabı:", JSON.stringify(data, null, 2));

    let replyText = data.choices?.[0]?.message?.content ?? "**Şu an cevap veremiyorum.**";
    replyText = replyText.replace(/\*{1}(.*?)\*{1}/g, "**$1**");

    await message.reply(replyText);

    respondedMessages.add(message.id); // cevap verildi işaretle
  } catch (err) {
    console.error("Groq AI Hatası:", err);
    await message.reply("Bir hata oluştu, canavar cevap veremedi.");
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const contentLower = message.content.toLowerCase();

  // Owner kontrolü ile genel konuşma açma/kapama
  if (contentLower === "canavar konuşmayı kapat") {
    if (message.author.id !== process.env.OWNER_ID) {
      await message.reply("Sen kimsin ya? Bunu yapamazsın.");
      return;
    }
    globalSpeakingStatus = false;
    await message.reply("Botun genel konuşması kapatıldı.");
    return;
  }
  if (contentLower === "canavar konuşmayı aç") {
    if (message.author.id !== process.env.OWNER_ID) {
      await message.reply("Sen kimsin ya? Bunu yapamazsın.");
      return;
    }
    globalSpeakingStatus = true;
    await message.reply("Botun genel konuşması açıldı.");
    return;
  }

  // Owner kontrolü ile bireysel kullanıcı konuşma açma/kapatma komutları
  if (contentLower.startsWith("canavar") && (contentLower.includes("ile konuşma") || contentLower.includes("ile konuş"))) {
    if (message.author.id !== process.env.OWNER_ID) {
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

  // Eğer genel konuşma kapalıysa veya kullanıcı konuşması kapalıysa cevap verme
  if (!globalSpeakingStatus) return;
  if (userSpeakingStatus.has(message.author.id) && userSpeakingStatus.get(message.author.id) === false) return;

  const isMentioningBotName = contentLower.includes("canavar");

  const isReplyingToBot = message.reference && (
    await message.channel.messages.fetch(message.reference.messageId)
  ).author.id === client.user.id;

  if (isMentioningBotName || isReplyingToBot) {
    await handleMessage(message);
  }

  // Bot etiketlenince emoji reaksiyonu ekle (sadece 1 kere)
  if (message.mentions.has(client.user) && !reactedMessages.has(message.id)) {
    try {
      await message.react("👀");
      reactedMessages.add(message.id);
    } catch (error) {
      console.error("Emoji reaksiyonu eklenirken hata:", error);
    }
  }
});

client.login(token);
