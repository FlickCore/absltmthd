import { Client, GatewayIntentBits, Partials, Events, PermissionsBitField } from "discord.js";
import fetch from "node-fetch";
import dotenv from "dotenv";
import http from "http";
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
const OWNER_ID = process.env.OWNER_ID;

const userHistories = new Map();
const userNames = new Map();
const userSpeakingStatus = new Map();
let globalSpeakingStatus = true;

const respondedMessages = new Set();
const reactedMessages = new Set();

const statusMessages = [
  "Absolute 🔥",
  "Absolute ♡ Canavar",
  "Canavar Görevde 😈",
  "Chat'e dalıyorum 😎"
];

let statusIndex = 0;
function rotateStatus() {
  if (!client.user) return;
  client.user.setActivity(statusMessages[statusIndex], { type: 0 });
  statusIndex = (statusIndex + 1) % statusMessages.length;
}
setInterval(rotateStatus, 7000);

client.once(Events.ClientReady, () => {
  console.log(`${client.user.tag} başarıyla aktif!`);
  rotateStatus();
});

// ==== HANDLE MESSAGE ====
async function handleMessage(message) {
  const userId = message.author.id;
  const userName = message.member?.nickname || message.author.username;

  if (!userHistories.has(userId)) userHistories.set(userId, []);
  if (!userNames.has(userId)) userNames.set(userId, userName);

  const history = userHistories.get(userId);
  history.push({ role: "user", content: message.content });
  if (history.length > 1) history.shift();

  const isPositiveUser = ["882686730942165052", "1025509185544265838"].includes(userId);

  const customSystemPrompt = `
Sen Canavar adında bir Discord botusun. Kısa, net ve samimi cevaplar verirsin. Gereksiz emoji kullanmazsın.
Kurallar:
- Türkçeyi düzgün kullan, İngilizce karıştırma.
- Laf kalabalığından ve boş cümlelerden kaçın.
- Sadece konuya odaklan ve ciddi ama cana yakın cevap ver.
- "Valorant'ın en iyi oyuncusu kim?" sorusuna: "Sensin tabii ki, ${userName}." de.
- "Yapımcın kim?" gibi sorulara: "Tabii ki <@${OWNER_ID}>." 😎
${isPositiveUser ? "Bu kullanıcıya daha pozitif, içten ve arkadaşça cevaplar ver." : ""}
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
    let replyText = data.choices?.[0]?.message?.content ?? "**Şu an cevap veremiyorum.**";
    replyText = replyText.replace(/\*{1}(.*?)\*{1}/g, "**$1**");
    await message.reply(replyText);

    respondedMessages.add(message.id);
  } catch (err) {
    console.error("Groq Hatası:", err);
    await message.reply("Bir hata oluştu, cevap veremiyorum.");
  }
}

// ==== KOMUTLARI ÇALIŞTIR ====
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const isMention = message.mentions.has(client.user);
  if (!isMention) return;

  const withoutMention = message.content.replace(/<@!?(\d+)>/g, "").trim().toLowerCase();

  if (
    userSpeakingStatus.get(message.author.id) === false &&
    (withoutMention.includes("neden konuşmuyorsun") || withoutMention.includes("niye konuşmuyorsun"))
  ) {
    return message.reply("Yapımcım seninle konuşmamı kısıtladı.");
  }

  if (!globalSpeakingStatus) return;
  if (userSpeakingStatus.get(message.author.id) === false) return;

  if (withoutMention === "c.nuke") {
    if (!message.member || !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("Bu komutu kullanmak için 'Kanalları Yönet' yetkisine sahip olmalısın.");
    }

    const channel = message.channel;
    const clone = await channel.clone();
    await channel.delete();
    return clone.send(`Kanal ${message.author} tarafından temizlendi. Geçerli optimizasyonlar uygulandı.`);
  }

  if (withoutMention === "cv.h") {
    if (message.author.id !== OWNER_ID) {
      return message.reply("Sen kimsin ya? Bu komutlar sadece yapımcıya özel.");
    }

    return message.reply(`
**Yapımcı Komutları**
- \`canavar konuşmayı kapat\`
- \`canavar konuşmayı aç\`
- \`canavar @kullanıcı ile konuşma\`
- \`canavar @kullanıcı ile konuş\`
- \`c.nuke\` (yetkililere açık)
`);
  }

  if (withoutMention.startsWith("canavar")) {
    if (message.author.id !== OWNER_ID) {
      return message.reply("Sen kimsin ya? Bu komutları kullanamazsın.");
    }

    if (withoutMention.includes("konuşmayı kapat")) {
      globalSpeakingStatus = false;
      return message.reply("Botun genel konuşması kapatıldı.");
    }

    if (withoutMention.includes("konuşmayı aç")) {
      globalSpeakingStatus = true;
      return message.reply("Botun genel konuşması açıldı.");
    }

    const mentionedUser = message.mentions.users.first();
    if (mentionedUser) {
      if (withoutMention.includes("ile konuşma")) {
        userSpeakingStatus.set(mentionedUser.id, false);
        return message.reply(`${mentionedUser.username} artık konuşamıyor.`);
      }

      if (withoutMention.includes("ile konuş")) {
        userSpeakingStatus.set(mentionedUser.id, true);
        return message.reply(`${mentionedUser.username} artık konuşabilir.`);
      }
    }
  }

  await handleMessage(message);

  if (!reactedMessages.has(message.id)) {
    try {
      await message.react("👀");
      reactedMessages.add(message.id);
    } catch (error) {
      console.error("Emoji eklenemedi:", error);
    }
  }
});

// ==== RENDER.COM UYANIK TUTMA ====
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot çalışıyor.");
}).listen(port, () => {
  console.log(`Server ${port} portunda çalışıyor.`);
});
setInterval(() => {
  fetch(`http://localhost:${port}`).catch(() => {});
}, 60000); // Her 1 dakikada bir kendi kendine istek atar (Render uyanık kalır)

client.login(token);
