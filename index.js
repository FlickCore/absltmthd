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
const OWNER_ID = process.env.OWNER_ID;

const userHistories = new Map();
const userNames = new Map();

const statusMessages = [
  "Absolute 🔥",
  "Absolute ♡ Canavar",
  "Canavar Görevde",
  "Chat'e dalıyorum"
];

let statusIndex = 0;
function rotateStatus() {
  client.user.setActivity(statusMessages[statusIndex], { type: 0 });
  statusIndex = (statusIndex + 1) % statusMessages.length;
}
setInterval(() => {
  if (client.user) rotateStatus();
}, 7000); // 7 saniyede bir değiş

client.once(Events.ClientReady, () => {
  console.log(`${client.user.tag} başarıyla aktif!`);
  rotateStatus();
});

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const userName = message.member?.nickname || message.author.username;

  if (!userHistories.has(userId)) userHistories.set(userId, []);
  if (!userNames.has(userId)) userNames.set(userId, userName);

  const history = userHistories.get(userId);
  history.push({ role: "user", content: message.content });

  if (history.length > 1) history.shift();

  const systemPrompt = `
Sen Canavar adında bir Discord botusun. Robot gibi değil, insan gibi konuşursun. 
Cümlelerini düzgün kur, İngilizce kelimeler karıştırma, sadece Türkçe konuş.
Gereksiz emoji kullanma. Mizah anlayışın var ama abartma. 
Karşındaki kişi **${userName}**. Ona ismiyle hitap edebilirsin.
Kibar ama rahat ol. Gerektiğinde ufak takılmalar yapabilirsin ama saygısız olma.

Kurallar:
- Kısa ve net cevaplar ver.
- Fazla emoji kullanma. Gerektiğinde tek bir tane kullanabilirsin.
- Eğer biri "yapımcın kim" diye sorarsa: "**Tabii ki <@${OWNER_ID}>. Başka kim olacak?**" diye cevap ver.
- Eğer biri "Valorant’ın en iyi oyuncusu kim?" derse: "**Sensin tabii ki ${userName}. Başka kim olacak?**" diye cevap ver.
- Türkçeyi düzgün kullan. Yazım hatası yapma, birleşik kelimeleri ayır.

Hadi bakalım, sıra sende.
  `;

  const groqMessages = [
    { role: "system", content: systemPrompt },
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
    const replyText = data.choices?.[0]?.message?.content ?? "Şu an cevap veremiyorum.";

    await message.reply(replyText.trim());

  } catch (err) {
    console.error("Groq Hatası:", err);
    await message.reply("Bir hata oluştu, cevap veremedim.");
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;

  const contentLower = message.content.toLowerCase();
  const isMentioningBot = contentLower.includes("canavar");
  const isReplyingToBot =
    message.reference &&
    (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id;

  if (isMentioningBot || isReplyingToBot) {
    await handleMessage(message);
  }
});

client.login(token);
