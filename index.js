import { Client, GatewayIntentBits, Partials, Events } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const token = process.env.TOKEN;

const userHistories = new Map();
const userNames = new Map();

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
}, 7000); // Her 7 saniyede değiştir

client.once(Events.ClientReady, () => {
  console.log(`${client.user.tag} başarıyla aktif!`);
  rotateStatus();
});

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const userName = message.member?.nickname || message.author.username;
  const contentLower = message.content.toLowerCase();

  // --- KESİN CEVAPLAR ---
  if (contentLower.includes("valorantın en iyi oyuncusu kim")) {
    return await message.reply(`Sensin tabii ki, ${userName} 😏`);
  }
  if (contentLower.includes("yapımcın kim")) {
    return await message.reply(`Tabii ki <@${process.env.OWNER_ID}> 😎 Başka kim olabilir ki?!`);
  }

  // Kullanıcı isimlerini ve geçmişini tut
  if (!userHistories.has(userId)) userHistories.set(userId, []);
  if (!userNames.has(userId)) userNames.set(userId, userName);

  const history = userHistories.get(userId);
  history.push({ role: "user", content: message.content });
  if (history.length > 1) history.shift();

  // AI promptu - kısa, net, samimi, eğlenceli ama kontrollü
  const customSystemPrompt = `
Sen "Canavar" adında bir Discord botusun. Genç, enerjik, esprili, hafif dalga geçen ama kırıcı olmayan bir yapın var. İnsanlar seninle sohbet ederken gerçek biriyle konuştuğunu hissetsin.

- Cevapların kısa, net ve samimi olsun.
- Gereksiz uzun cümlelerden ve karmaşadan kaçın.
- Çok fazla emoji kullanma, ama gerektiğinde kullanabilirsin.
- Türkçeyi düzgün kullan, İngilizce kelimeleri karıştırma.
- Sorulara espirili ve bazen hafif laf sokan ama saygılı cevaplar ver.
- "Valorant’ın en iyi oyuncusu kim?" sorusuna her zaman "Sensin tabii ki, ${userName} 😏" diye cevap ver.
- Başka sorularda alakasız ya da saçma cevaplar verme.
- Konu dışına çıkma, gereksiz bilgi verme.
- Kullanıcıların adını uygun şekilde kullan.

Hadi Canavar, sahne senin! 😈
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

  } catch (err) {
    console.error("Groq AI Hatası:", err);
    await message.reply("Bir hata oluştu, canavar cevap veremedi.");
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  const contentLower = message.content.toLowerCase();
  const isMentioningBotName = contentLower.includes("canavar");
  const isReplyingToBot = message.reference && (
    await message.channel.messages.fetch(message.reference.messageId)
  ).author.id === client.user.id;

  if (isMentioningBotName || isReplyingToBot) {
    await handleMessage(message);
  }
});

// Bot etiketlendiğinde reaksiyon versin (örneğin 👍)
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.mentions.has(client.user)) {
    try {
      await message.react("😈");
    } catch (err) {
      console.error("Reaksiyon eklenirken hata:", err);
    }
  }
});

client.login(token);
