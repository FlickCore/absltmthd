import { Client, GatewayIntentBits, Partials, Events, PermissionsBitField } from "discord.js";
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
setInterval(() => {
  rotateStatus();
}, 7000);

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

    respondedMessages.add(message.id);
  } catch (err) {
    console.error("Groq AI Hatası:", err);
    await message.reply("Bir hata oluştu, canavar cevap veremedi.");
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  const contentLower = message.content.toLowerCase();

  // Genel konuşma açma/kapama komutları (owner)
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

  // Bireysel kullanıcı konuşma açma/kapatma (owner)
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

  // c.nuke komutu
  if (contentLower.startsWith("c.nuke")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      await message.reply("Geçersiz yetki.");
      return;
    }

    const channelToNuke = message.mentions.channels.first() || message.channel;

    try {
      const newChannel = await channelToNuke.clone({
        reason: `Nuke işlemi @${message.author.tag} tarafından yapıldı.`,
      });

      await channelToNuke.delete("Nuke işlemi");

      await newChannel.send(
        `📢 Kanal @${message.author.tag} tarafından temizlendi. Temiz, optimize ve hazır!`
      );
    } catch (error) {
      console.error("Nuke hatası:", error);
      await message.reply("Kanal temizlenirken bir hata oluştu.");
    }
    return;
  }

  // Bot ile konuşma açık mı, kullanıcının konuşması açık mı?
  if (!globalSpeakingStatus) return;
  if (userSpeakingStatus.has(message.author.id) && userSpeakingStatus.get(message.author.id) === false) {
    if (contentLower.includes("neden konuşmuyorsun") || contentLower.includes("niye konuşmuyorsun")) {
      await message.reply("Yapımcım seninle konuşmamı kısıtladı.");
    }
    return;
  }

  const isMentioningBotName = contentLower.includes("canavar");
  const isReplyingToBot = message.reference && (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id;

  if (isMentioningBotName || isReplyingToBot) {
    await handleMessage(message);
  }

  // Bot etiketlenince emoji reaksiyonu (sadece 1 kere)
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
