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
const OWNER_ID = process.env.OWNER_ID;

const userHistories = new Map();
const userNames = new Map();
const userSpeakingStatus = new Map(); // Kullanıcı ID → true/false (konuşabilir mi)
const userCustomNames = new Map();   // Kullanıcı ID → alternatif isim
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
}, 7000);

client.once(Events.ClientReady, () => {
  console.log(`${client.user.tag} başarıyla aktif!`);
  rotateStatus();
});

const ownerCommandsList = `
**Canavar Owner Komutları:**
- \`canavar konuşmayı kapat\` → Botun genel konuşmasını kapatır.
- \`canavar konuşmayı aç\` → Botun genel konuşmasını açar.
- \`canavar @kullanıcı ile konuşma\` → Belirtilen kullanıcı ile konuşmayı kapatır.
- \`canavar @kullanıcı ile konuş\` → Belirtilen kullanıcı ile konuşmayı açar.
- \`canavar konuşma durumu\` → Genel ve kullanıcı bazlı konuşma durumlarını gösterir.
- \`canavar kullanıcılar\` → Konuşması kapalı olan kullanıcıları listeler.
- \`canavar reset @kullanıcı\` → Kullanıcının geçmişini temizler ve konuşmasını açar.
- \`canavar setisim @kullanıcı yeniAd\` → Kullanıcı için özel isim belirler.
- \`canavar isim sıfırla @kullanıcı\` → Kullanıcı özel ismini sıfırlar.
- \`canavar yardım\` veya \`cv\` veya \`cv.\` → Owner komutlarını gösterir.
`;

async function handleMessage(message) {
  if (message.author.bot) return;
  // message.guild kontrolü kaldırıldı, DM de çalışabilir

  if (respondedMessages.has(message.id)) return; // Aynı mesaja 2. kez cevap verme

  const userId = message.author.id;
  // Kullanıcı özel ismi varsa onu kullan, yoksa nickname veya username
  const userName = userCustomNames.get(userId) || message.member?.nickname || message.author.username;

  if (!globalSpeakingStatus) return;
  if (userSpeakingStatus.has(userId) && userSpeakingStatus.get(userId) === false) {
    // Kullanıcı kapalı ise ve "neden az önce konuşmadın" tarzı soru sorarsa cevap ver
    const lowerContent = message.content.toLowerCase();
    if (
      lowerContent.includes("neden") &&
      (lowerContent.includes("konuşmadın") || lowerContent.includes("cevap vermedin") || lowerContent.includes("neden cevap vermiyorsun"))
    ) {
      await message.reply(`Yapımcım <@${OWNER_ID}> seninle konuşmamı kısıtladı, ben suçsuzum.`);
      respondedMessages.add(message.id);
      return;
    }
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
- "Yapımcın kim?" veya "Rabbin kim?" sorulursa şu cevabı ver: "Tabii ki <@${OWNER_ID}>." 😎
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

  // Owner komutlarını göster
  if (contentLower === "cv" || contentLower === "cv." || contentLower === "canavar yardım") {
    if (message.author.id !== OWNER_ID) {
      await message.reply("Sen kimsin ya? Bunu yapamazsın.");
      return;
    }
    await message.reply(ownerCommandsList);
    return;
  }

  // Owner Komutları
  if (contentLower.startsWith("canavar ")) {
    if (message.author.id !== OWNER_ID) {
      await message.reply("Sen kimsin ya? Bunu yapamazsın.");
      return;
    }

    // konuşmayı kapat / aç
    if (contentLower.includes("konuşmayı kapat")) {
      globalSpeakingStatus = false;
      await message.reply("Botun genel konuşması kapatıldı.");
      return;
    }
    if (contentLower.includes("konuşmayı aç")) {
      globalSpeakingStatus = true;
      await message.reply("Botun genel konuşması açıldı.");
      return;
    }

    // kullanıcı ile konuşma kapat / aç
    if (contentLower.includes("ile konuşma")) {
      const user = message.mentions.users.first();
      if (!user) {
        await message.reply("Bir kullanıcı etiketle.");
        return;
      }
      userSpeakingStatus.set(user.id, false);
      await message.reply(`${user.username} ile konuşma kapatıldı.`);
      return;
    }
    if (contentLower.includes("ile konuş")) {
      const user = message.mentions.users.first();
      if (!user) {
        await message.reply("Bir kullanıcı etiketle.");
        return;
      }
      userSpeakingStatus.set(user.id, true);
      await message.reply(`${user.username} ile konuşma açıldı.`);
      return;
    }

    // konuşma durumu
    if (contentLower.includes("konuşma durumu")) {
      const kapaliKullanicilar = [];
      for (const [uid, status] of userSpeakingStatus.entries()) {
        if (!status) kapaliKullanicilar.push(`<@${uid}>`);
      }
      const liste = kapaliKullanicilar.length ? kapaliKullanicilar.join(", ") : "Yok";
      await message.reply(`Genel konuşma durumu: **${globalSpeakingStatus ? "Açık" : "Kapalı"}**\nKonuşması kapalı kullanıcılar: ${liste}`);
      return;
    }

    // kullanıcıları listele (konuşması kapalı)
    if (contentLower.includes("kullanıcılar")) {
      const kapaliKullanicilar = [];
      for (const [uid, status] of userSpeakingStatus.entries()) {
        if (!status) kapaliKullanicilar.push(`<@${uid}>`);
      }
      const liste = kapaliKullanicilar.length ? kapaliKullanicilar.join("\n") : "Hiçbiri";
      await message.reply(`Konuşması kapalı kullanıcılar:\n${liste}`);
      return;
    }

    // reset komutu
    if (contentLower.startsWith("canavar reset")) {
      const user = message.mentions.users.first();
      if (!user) {
        await message.reply("Bir kullanıcı etiketle.");
        return;
      }
      userHistories.delete(user.id);
      userSpeakingStatus.set(user.id, true);
      userCustomNames.delete(user.id);
      await message.reply(`${user.username} için geçmiş sıfırlandı ve konuşma açıldı.`);
      return;
    }

    // setisim komutu
    if (contentLower.startsWith("canavar setisim")) {
      const user = message.mentions.users.first();
      if (!user) {
        await message.reply("Bir kullanıcı etiketle.");
        return;
      }
      const args = message.content.split(" ").slice(3);
      if (args.length < 1) {
        await message.reply("Yeni isim belirtmelisin.");
        return;
      }
      const yeniIsim = args.join(" ");
      userCustomNames.set(user.id, yeniIsim);
      await message.reply(`${user.username} için yeni isim olarak "${yeniIsim}" ayarlandı.`);
      return;
    }

    // isim sıfırla
    if (contentLower.startsWith("canavar isim sıfırla")) {
      const user = message.mentions.users.first();
      if (!user) {
        await message.reply("Bir kullanıcı etiketle.");
        return;
      }
      userCustomNames.delete(user.id);
      await message.reply(`${user.username} için özel isim sıfırlandı.`);
      return;
    }
  }

  // Eğer mesaj botu etiketliyorsa veya direkt DM ise cevap ver
  const botMentioned = message.mentions.has(client.user);
  if (botMentioned || message.channel.type === 1) {
    await handleMessage(message);
  }
});

client.login(token);
