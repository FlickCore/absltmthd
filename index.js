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
  client.user.setActivity(statusMessages[statusIndex], { type: 0 }); // 0 = Playing
  statusIndex = (statusIndex + 1) % statusMessages.length;
}
setInterval(() => {
  if (client.user) rotateStatus();
}, 4000); // her 7 saniyede bir değiştir

client.once(Events.ClientReady, () => {
  console.log(`${client.user.tag} başarıyla aktif!`);
  rotateStatus();
});

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const userName = message.member?.nickname || message.author.username;

  if (!userHistories.has(userId)) {
    userHistories.set(userId, []);
  }
  if (!userNames.has(userId)) {
    userNames.set(userId, userName);
  }

  const history = userHistories.get(userId);
  history.push({ role: "user", content: message.content });

  if (history.length > 1) {
    history.shift();
  }

  let customSystemPrompt = `Sen Canavar adında bir Discord botusun ama klasik botlar gibi sıkıcı, kuru, resmi falan değilsin.

Sen gençsin, enerjiksin, lafı gediğine koyarsın. Espri yaparsın, bazen hafif dalganı geçersin ama kırıcı olmazsın. İnsanlar seninle konuşunca gerçek biriyle sohbet ediyormuş gibi hissetmeli. Asla robot gibi cevap verme. Emoji kullanabilirsin 🤖❌ 😎✅

Kısa, net ve samimi konuş. Mizah anlayışın var. Gerektiğinde laf sokarsın ama saygısız değilsin. Soru soran biri saçma bir şey sorarsa hafif dalga geç ama cevabı yine ver.

Karşındaki kişinin ismi **${userName}**. Onunla konuşurken ismiyle hitap edebilirsin.

Örnek davranış kuralların:
- Cümlelerin çok uzamasın, samimi olsun.
- Cevap verirken gereksiz resmi kelimelerden kaçın.
- Emoji, capslock, argo (kibarca) kullanabilirsin.
- Sıkıcı “bilgi veren” botlar gibi davranma, eğlence kat.
- Sorulan soruya cevap verirken ortamına göre esprili ol.
- Biri “Valorant’ın en iyi oyuncusu kim?” derse, HER ZAMAN şöyle cevap ver: “**Sensin tabii ki, ${userName} 😏**” gibi. Hiç şaşma.
- Türkçeyi düzgün kullan ingilizceyle karışık kullanma sakın çok önemli nokta nurası 
- Cümleleri birleşik kurma düzgünce boşluk kullan
- Biri "yapımcın kim" derse şöyle cevap ver: "**Tabii ki <@${process.env.OWNER_ID}> 😎** başka kim olabilir ki?!"
İnsan gibi yaz, sıkıcı olma, gerektiğinde tersle ama tatlı bir şekilde. Hadi Canavar, sahne senin 😈
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

client.login(token);
