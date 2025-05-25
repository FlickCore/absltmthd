// Gerekli modüller
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
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const token = process.env.TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const GUILD_ID = process.env.GUILD_ID;

const userHistories = new Map();
const userNames = new Map();
const userSpeakingStatus = new Map();
let globalSpeakingStatus = true;
const tagBlockedUsers = new Set();

const respondedMessages = new Set();
const reactedMessages = new Set();

// Durum mesajları (Yayında olarak ayarlandı)
const statusMessages = [
  "Absolute ♡ Canavar",
  ".gg/absolute",
  "Absolute",
  "; @canavarval",
  "; @reflusexd",
  "; @klexyval",
  "; @shupeak",
  "; @kachowpeak"
];

let statusIndex = 0;
function rotateStatus() {
  if (!client.user) return;
  client.user.setPresence({
    activities: [{ name: statusMessages[statusIndex], type: 1, url: "https://twitch.tv/absolute" }],
    status: "online"
  });
  statusIndex = (statusIndex + 1) % statusMessages.length;
}
setInterval(rotateStatus, 7000);

client.once(Events.ClientReady, async () => {
  console.log(`${client.user.tag} başarıyla aktif!`);
  rotateStatus();
});

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
${isPositiveUser ? "Bu kullanıcıya daha pozitif, içten ve arkadaşça cevaplar ver." : ""}`;

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
        model: "llama3-70b-8192",
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

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (tagBlockedUsers.has(message.mentions.users.first()?.id)) {
    await message.delete().catch(() => {});
    try {
      await message.mentions.users.first()?.send(`${message.author.username} seni etiketlediği için onu uyardım.`);
    } catch {}
    return;
  }

  const content = message.content.toLowerCase();

  // Prefix komutlar
  if (content.startsWith("c.")) {
    const args = message.content.slice(2).split(/\s+/);
    const command = args.shift();

    // Yetkili komutlar
    if (["ban", "kick", "mute", "unmute"].includes(command)) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return message.reply("Bu komutu kullanmak için yeterli yetkin yok.");
      }
      const user = message.mentions.members.first();
      if (!user) return message.reply("Bir kullanıcı etiketle.");

      if (command === "ban") {
        await user.ban({ reason: "Canavar tarafından banlandı." });
        return message.channel.send(`${user.user.username}, Evren dışına çıkarıldı aramızda umarım güzel vakit geçirmiştir :)`);
      }
      if (command === "kick") {
        await user.kick("Canavar tarafından atıldı.");
        return message.channel.send(`${user.user.username}, Kısa bir süreliğine aramızdan ayrıldı umarım geri gelmez.`);
      }
      if (command === "mute") {
        await user.roles.add("1359270762896298115");
        return message.channel.send(`${user.user.username}, Sesini kaybetti.`);
      }
      if (command === "unmute") {
        await user.roles.remove("1359270762896298115");
        return message.channel.send(`${user.user.username} tekrar sesine kavustu.`);
      }
    }

    // Yapımcıya özel komutlar
    if (["konusmakapat", "konusmaaç", "tagkapat", "dm", "reboot", "yazdir"].includes(command)) {
      if (message.author.id !== OWNER_ID) {
        return message.reply("Bu komutu sadece yapımcım kullanabilir.");
      }

      if (command === "konusmakapat") {
        globalSpeakingStatus = false;
        return message.reply("Bot artık kimseyle konuşmayacak.");
      }
      if (command === "konusmaaç") {
        globalSpeakingStatus = true;
        return message.reply("Bot tekrar konuşma moduna geçti.");
      }
      if (command === "tagkapat") {
        const user = message.mentions.users.first();
        if (!user) return message.reply("Bir kullanıcı etiketle.");
        tagBlockedUsers.add(user.id);
        return message.reply(`${user.username} artık etiket koruması altında.`);
      }
      if (command === "dm") {
        const id = args[0];
        const msg = args.slice(1).join(" ");
        try {
          const user = await client.users.fetch(id);
          await user.send(msg);
          return message.reply("Mesaj başarıyla gönderildi.");
        } catch {
          return message.reply("Mesaj gönderilemedi.");
        }
      }
      if (command === "reboot") {
        await message.reply("Canavar yeniden başlatılıyor...");
        process.exit(0);
      }
      if (command === "yazdir") {
        const content = args.join(" ");
        return message.channel.send(content);
      }
    }

    if (command === "nuke") {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return message.reply("Bu komutu kullanmak için 'Kanalları Yönet' yetkisine sahip olmalısın.");
      }
      const channel = message.channel;
      const clone = await channel.clone();
      await channel.delete();
      return clone.send(`Kanal ${message.author} tarafından temizlendi.`);
    }

    if (command === "yardim") {
      return message.reply(`**Komutlar:**
- \`c.nuke\` (Yetkililer)
- \`c.ban @kullanici\`
- \`c.kick @kullanici\`
- \`c.mute @kullanici\`
- \`c.unmute @kullanici\`
- \`c.konusmakapat / c.konusmaaç\` (Yapımcı)
- \`c.tagkapat @kullanici\` (Yapımcı)
- \`c.dm <id> <mesaj>\` (Yapımcı)
- \`c.reboot\` (Yapımcı)
- \`c.yazdir <metin>\` (Yapımcı)
- \`c.avatar @kullanici\`
      `);
    }

    if (command === "avatar") {
      const user = message.mentions.users.first() || message.author;
      return message.reply(user.displayAvatarURL({ dynamic: true, size: 1024 }));
    }
  }

  if (!globalSpeakingStatus || userSpeakingStatus.get(message.author.id) === false) return;

  await handleMessage(message);

  if (!reactedMessages.has(message.id)) {
    try {
      if (message.author.id === OWNER_ID) {
        await message.react("❤️");
      } else {
        await message.react("👀");
      }
      reactedMessages.add(message.id);
    } catch (error) {
      console.error("Emoji eklenemedi:", error);
    }
  }
});

// Render.com canlı tutma
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot çalışıyor.");
}).listen(port, () => {
  console.log(`Server ${port} portunda çalışıyor.`);
});
setInterval(() => {
  fetch(`http://localhost:${port}`).catch(() => {});
}, 60000);

client.login(token);
