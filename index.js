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
  if (!contentLower.includes("canavar")) return;

  const userId = message.author.id;

  if (!userHistories.has(userId)) {
    userHistories.set(userId, []);
  }

  const history = userHistories.get(userId);
  history.push({ role: "user", content: message.content });

  if (history.length > 1) {
    history.shift();
  }

  let customSystemPrompt = `Sen canavar adında ciddi, resmi ve teknik bilgisi yüksek bir Discord botusun.`;

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
  await handleMessage(message);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  const contentLower = message.content.toLowerCase();

  if (contentLower.includes("canavar") && message.reference && message.reference.messageId) {
    const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);

    if (referencedMessage.author.id === client.user.id) {
      await handleMessage(message);
    }
  }
});

client.login(token);
