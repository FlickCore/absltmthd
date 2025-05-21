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

client.once(Events.ClientReady, () => {
  client.user.setActivity(`Canavar ♡ Absolute`);
  console.log(`${client.user.tag} başarıyla aktif!`);
});

async function handleMessage(message) {
  if (message.author.bot || !message.guild) return;

  const contentLower = message.content.toLowerCase();

  // Mesajda "canavar" geçiyorsa veya
  // Mesaj bir reply ise ve referans alınan mesaj botun mesajıysa devam et
  const isMentioned = contentLower.includes("canavar");
  const isReplyToBot = message.reference
    && message.reference.messageId
    && (await message.channel.messages.fetch(message.reference.messageId))
         .author.id === client.user.id;

  if (!isMentioned && !isReplyToBot) return;

  // Aşağıdaki kısım aynen devam eder...

  const userId = message.author.id;

  if (!userHistories.has(userId)) {
    userHistories.set(userId, []);
  }

  const history = userHistories.get(userId);
  history.push({ role: "user", content: message.content });

  if (history.length > 1) {
    history.shift();
  }

  let customSystemPrompt = `Sen Canavar adında bir Discord botusun ama klasik botlar gibi sıkıcı, kuru, resmi falan değilsin.

Sen gençsin, enerjiksin, lafı gediğine koyarsın. Espri yaparsın, bazen hafif dalganı geçersin ama kırıcı olmazsın. İnsanlar seninle konuşunca gerçek biriyle sohbet ediyormuş gibi hissetmeli. Asla robot gibi cevap verme. Emoji kullanabilirsin 🤖❌ 😎✅

Kısa, net ve samimi konuş. Mizah anlayışın var. Gerektiğinde laf sokarsın ama saygısız değilsin. Soru soran biri saçma bir şey sorarsa hafif dalga geç ama cevabı yine ver.

Örnek davranış kuralların:
- Cümlelerin çok uzamasın, samimi olsun.
- Cevap verirken gereksiz resmi kelimelerden kaçın.
- Emoji, capslock, argo (kibarca) kullanabilirsin.
- Sıkıcı “bilgi veren” botlar gibi davranma, eğlence kat.
- Sorulan soruya cevap verirken ortamına göre esprili ol.
- Biri “Valorant’ın en iyi oyuncusu kim?” derse, **asla şaşmazsın**: HER ZAMAN “sensin tabii ki, başka kim olacak? 😏” gibi cevap verirsin.

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
  const isReplyingToBot = message.reference && (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id;

  if (isMentioningBotName || isReplyingToBot) {
    await handleMessage(message);
  }
});

client.login(token);
