import pkg from "discord.js";
const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  PermissionsBitField,
  EmbedBuilder,
  ChannelType
} = pkg;

import { joinVoiceChannel, entersState, VoiceConnectionStatus } from "@discordjs/voice";
import fetch from "node-fetch";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences // Yayında durumu için önemli!
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User]
});

// Yayın mesajları
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
  client.user.setActivity(statusMessages[statusIndex], {
    type: "STREAMING",
    url: "https://www.twitch.tv/absolute"
  });
  statusIndex = (statusIndex + 1) % statusMessages.length;
}

client.on('ready', () => {
  console.log(`${client.user.tag} hazır!`);
  rotateStatus(); // İlk durum
  setInterval(rotateStatus, 7000); // Her 7 saniyede bir değiştir
});
// SES OYNATMA ÖZELLİĞİ KALDIRILDI

async function joinVoice(channel) {
  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log(`Bot ses kanalına katıldı: ${channel.name}`);
    return connection;
  } catch (error) {
    console.error("Ses kanalına katılırken hata:", error);
    return null;
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`${client.user.tag} başarıyla aktif!`);
  rotateStatus();
  if (process.env.VOICE_CHANNEL_ID) {
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (guild) {
      const channel = guild.channels.cache.get(process.env.VOICE_CHANNEL_ID);
      if (channel && channel.type === ChannelType.GuildVoice) {
        await joinVoice(channel);
      }
    }
  }
});

// Onay emoji
const CHECK_EMOJI = "✅";
const CROSS_EMOJI = "❌";

async function askConfirmation(message, question) {
  const filter = (reaction, user) => {
    return [CHECK_EMOJI, CROSS_EMOJI].includes(reaction.emoji.name) && user.id === message.author.id;
  };

  const confirmMessage = await message.channel.send(question);
  await confirmMessage.react(CHECK_EMOJI);
  await confirmMessage.react(CROSS_EMOJI);

  try {
    const collected = await confirmMessage.awaitReactions({ filter, max: 1, time: 15000, errors: ["time"] });
    const reaction = collected.first();
    return reaction.emoji.name === CHECK_EMOJI;
  } catch {
    await message.channel.send("İşlem zaman aşımına uğradı.");
    return false;
  }
}

// Mute rolünü yönetmek için
async function getMuteRole(guild) {
  let muteRole = guild.roles.cache.find(r => r.name === "Canavar Mute");
  if (!muteRole) {
    try {
      muteRole = await guild.roles.create({
        name: "Canavar Mute",
        color: "GRAY",
        reason: "Mute rolü oluşturuldu"
      });
      for (const channel of guild.channels.cache.values()) {
        await channel.permissionOverwrites.edit(muteRole, {
          SendMessages: false,
          Speak: false,
          AddReactions: false
        });
      }
    } catch (err) {
      console.error("Mute rolü oluşturulamadı:", err);
    }
  }
  return muteRole;
}

async function handleMessage(message) {
  if (message.author.bot) return;

  // Chat kilitliyse, admin değilse mesajı sil
  if (chatLocked && !message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    await message.delete().catch(() => {});
    return;
  }

  // Tag koruması aktif mi?
  if (tagKapatSet.has(message.author.id)) {
    const taggedUsers = message.mentions.users;
    if (taggedUsers.size > 0) {
      for (const user of taggedUsers.values()) {
        if (tagKapatSet.has(user.id)) {
          await message.delete().catch(() => {});
          try {
            await message.author.send(`Seni etiketlediği için onu uyardım: ${user.username}`);
          } catch {}
          await message.channel.send(`${message.author} kullanıcısının tag koruması aktif, mesajı sildim.`);
          return;
        }
      }
    }
  }

  // Yapay zekaya sadece bot etiketlenince yanıt verir
  const isMention = message.mentions.has(client.user);
  if (!message.content.toLowerCase().startsWith("c.") && !isMention) return;
  if (isMention && !message.content.toLowerCase().startsWith("c.")) {
    // Yapay zeka cevabı için (etiketlenince)
    const userId = message.author.id;
    const userName = message.member?.nickname || message.author.username;
    if (!userHistories.has(userId)) userHistories.set(userId, []);
    if (!userNames.has(userId)) userNames.set(userId, userName);
    const history = userHistories.get(userId);
    history.push({ role: "user", content: message.content });
    if (history.length > 1) history.shift();

    const isPositiveUser = ["882686730942165052", "1025509185544265838"].includes(userId);
    const customSystemPrompt = `Sen Canavar adında bir Discord botusun. Kısa, net ve samimi cevaplar verirsin. Gereksiz emoji kullanmazsın. Kurallar:
- Türkçeyi düzgün kullan, İngilizce karıştırma.
- Laf kalabalığından ve boş cümlelerden kaçın.
- Sadece konuya odaklan ve ciddi ama cana yakın cevap ver.
- "Valorant'ın en iyi oyuncusu kim?" sorusuna: "Sensin tabii ki, ${userName}." de.
- "Yapımcın kim?" gibi sorulara: "Tabii ki <@${OWNER_ID}>."
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
    } catch (err) {
      console.error("Groq Hatası:", err);
      await message.reply("Bir hata oluştu, cevap veremiyorum.");
    }
    return;
  }

  // Prefix ile başlayan komut işlemleri
  const args = message.content.slice(2).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();

  // --- KOMUTLAR ---

  if (cmd === "nuke") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("Bu komutu kullanmak için 'Kanalları Yönet' yetkisine sahip olmalısın.");
    }
    const onay = await askConfirmation(message, `${message.author}, gerçekten bu kanalı silmek istediğine emin misin?`);
    if (!onay) return message.channel.send("İşlem iptal edildi.");

    const oldChannel = message.channel;
    const guild = oldChannel.guild;
    try {
      // Kanalın özelliklerini kopyala
      const position = oldChannel.position;
      const name = oldChannel.name;
      const type = oldChannel.type;
      const parentId = oldChannel.parentId;
      const permissionOverwrites = oldChannel.permissionOverwrites.cache.map(po => ({
        id: po.id,
        type: po.type,
        allow: po.allow.bitfield.toString(),
        deny: po.deny.bitfield.toString()
      }));

      // Kanalı sil
      await oldChannel.delete();

      // Yeni kanal oluştur
      const newChannel = await guild.channels.create({
        name,
        type,
        parent: parentId,
        permissionOverwrites: permissionOverwrites.map(po => ({
          id: po.id,
          type: po.type,
          allow: BigInt(po.allow),
          deny: BigInt(po.deny)
        }))
      });

      // Pozisyonu ayarla
      await newChannel.setPosition(position);

      // Bilgi mesajı gönder
      await newChannel.send(`${message.author} kanalı nuke'ladı, kanal yenilendi.`);

    } catch (error) {
      console.error("Nuke hatası:", error);
      return message.channel.send("Kanalı yenilerken bir hata oluştu.");
    }
    return;
  }

  if (cmd === "lock") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("Bu komutu kullanmak için 'Kanalları Yönet' yetkisine sahip olmalısın.");
    }
    const channel = message.channel;
    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
      await message.channel.send("Kanal kilitlendi, sadece yetkililer yazabilir.");
    } catch {
      await message.channel.send("Kanal kilitlenirken bir hata oluştu.");
    }
    return;
  }

  if (cmd === "unlock") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply("Bu komutu kullanmak için 'Kanalları Yönet' yetkisine sahip olmalısın.");
    }
    const channel = message.channel;
    try {
      await channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
      await message.channel.send("Kanal kilidi kaldırıldı, herkes yazabilir.");
    } catch {
      await message.channel.send("Kanal kilidi açılırken bir hata oluştu.");
    }
    return;
  }

  if (cmd === "ban") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply("Bu komutu kullanmak için 'Üyeleri Engelle' yetkisine sahip olmalısın.");
    }
    if (!args[0]) return message.reply("Lütfen banlanacak kullanıcıyı etiketle veya ID gir.");
    let banMember;
    try {
      banMember = await message.guild.members.fetch(args[0].replace(/[<@!>]/g, ""));
    } catch {
      return message.reply("Kullanıcı bulunamadı.");
    }
    if (!banMember) return message.reply("Kullanıcı bulunamadı.");
    if (banMember.id === message.author.id) return message.reply("Kendini banlayamazsın.");
    if (!banMember.bannable) return message.reply("Bu kullanıcıyı banlayamam.");
    const reason = args.slice(1).join(" ") || "Belirtilmedi";
    try {
      await banMember.ban({ reason });
      await message.channel.send(`${banMember.user.tag} başarıyla banlandı. Sebep: ${reason}`);
    } catch {
      await message.channel.send("Ban işlemi başarısız oldu.");
    }
    return;
  }

  if (cmd === "kick") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return message.reply("Bu komutu kullanmak için 'Üyeleri At' yetkisine sahip olmalısın.");
    }
    if (!args[0]) return message.reply("Lütfen atılacak kullanıcıyı etiketle veya ID gir.");
    let kickMember;
    try {
      kickMember = await message.guild.members.fetch(args[0].replace(/[<@!>]/g, ""));
    } catch {
      return message.reply("Kullanıcı bulunamadı.");
    }
    if (!kickMember) return message.reply("Kullanıcı bulunamadı.");
    if (kickMember.id === message.author.id) return message.reply("Kendini atamazsın.");
    if (!kickMember.kickable) return message.reply("Bu kullanıcıyı atamam.");
    const reason = args.slice(1).join(" ") || "Belirtilmedi";
    try {
      await kickMember.kick(reason);
      await message.channel.send(`${kickMember.user.tag} başarıyla atıldı. Sebep: ${reason}`);
    } catch {
      await message.channel.send("Atma işlemi başarısız oldu.");
    }
    return;
  }

  if (cmd === "mute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("Bu komutu kullanmak için 'Üyeleri Sustur' yetkisine sahip olmalısın.");
    }
    if (!args[0]) return message.reply("Lütfen susturulacak kullanıcıyı etiketle veya ID gir.");
    let muteMember;
    try {
      muteMember = await message.guild.members.fetch(args[0].replace(/[<@!>]/g, ""));
    } catch {
      return message.reply("Kullanıcı bulunamadı.");
    }
    if (!muteMember) return message.reply("Kullanıcı bulunamadı.");
    if (muteMember.id === message.author.id) return message.reply("Kendini susturamazsın.");
    if (mutedUsers.has(muteMember.id)) return message.reply("Bu kullanıcı zaten susturulmuş.");
    const muteRole = await getMuteRole(message.guild);
    if (!muteRole) return message.reply("Mute rolü oluşturulamadı veya erişilemiyor.");
    try {
      await muteMember.roles.add(muteRole);
      mutedUsers.add(muteMember.id);
      await message.channel.send(`${muteMember.user.tag} susturuldu.`);
    } catch {
      await message.channel.send("Susturma işlemi başarısız oldu.");
    }
    return;
  }

  if (cmd === "unmute") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("Bu komutu kullanmak için 'Üyeleri Sustur' yetkisine sahip olmalısın.");
    }
    if (!args[0]) return message.reply("Lütfen susturması kaldırılacak kullanıcıyı etiketle veya ID gir.");
    let unmuteMember;
    try {
      unmuteMember = await message.guild.members.fetch(args[0].replace(/[<@!>]/g, ""));
    } catch {
      return message.reply("Kullanıcı bulunamadı.");
    }
    if (!unmuteMember) return message.reply("Kullanıcı bulunamadı.");
    const muteRole = await getMuteRole(message.guild);
    if (!muteRole) return message.reply("Mute rolü oluşturulamadı veya erişilemiyor.");
    try {
      await unmuteMember.roles.remove(muteRole);
      mutedUsers.delete(unmuteMember.id);
      await message.channel.send(`${unmuteMember.user.tag} susturması kaldırıldı.`);
    } catch {
      await message.channel.send("Susturmayı kaldırma işlemi başarısız oldu.");
    }
    return;
  }

  if (cmd === "yazdir") {
    if (message.author.id !== OWNER_ID) return message.reply("Bu komutu sadece yapımcım kullanabilir.");
    if (args.length === 0) return message.reply("Lütfen yazdırmak istediğin metni yaz.");
    const text = args.join(" ");
    await message.channel.send(text);
    return;
  }

  if (cmd === "tagkapat") {
    if (tagKapatSet.has(message.author.id)) {
      return message.reply("Zaten tag koruması kapalı.");
    }
    tagKapatSet.add(message.author.id);
    await message.reply("Tag koruması kapatıldı.");
    return;
  }

  if (cmd === "tagac") {
    if (!tagKapatSet.has(message.author.id)) {
      return message.reply("Tag koruması zaten açık.");
    }
    tagKapatSet.delete(message.author.id);
    await message.reply("Tag koruması açıldı.");
    return;
  }

if (cmd === "avatar") {
  let user = message.mentions.users.first() || message.author;
  const embed = new EmbedBuilder()
    .setTitle(`${user.username} kullanıcısının avatarı`)
    .setImage(user.displayAvatarURL({ dynamic: true, size: 1024 }))
    .setColor("#00FFFF");
  await message.channel.send({ embeds: [embed] });
  return;
}
  if (cmd === "reboot") {
    if (message.author.id !== OWNER_ID) return message.reply("Bu komutu sadece yapımcım kullanabilir.");
    await message.channel.send("Bot yeniden başlatılıyor...");
    process.exit(0);
    return;
  }

  if (cmd === "dm") {
    if (message.author.id !== OWNER_ID) return message.reply("Bu komutu sadece yapımcım kullanabilir.");
    if (args.length < 2) return message.reply("Kullanıcı ID'si ve mesajı gir.");
    const targetId = args.shift();
    const dmMessage = args.join(" ");
    try {
      const user = await client.users.fetch(targetId);
      await user.send(dmMessage);
      await message.channel.send("Mesaj gönderildi.");
    } catch {
      await message.channel.send("Mesaj gönderilemedi, kullanıcı bulunamadı veya DM kapalı.");
    }
    return;
  }

  if (cmd === "duyuru") {
    if (message.author.id !== OWNER_ID) return message.reply("Bu komutu sadece yapımcım kullanabilir.");
    if (args.length === 0) return message.reply("Duyuru metni yaz.");
    const text = args.join(" ");
    const members = await message.guild.members.fetch();
    let count = 0;
    for (const [id, member] of members) {
      if (!member.user.bot) {
        try {
          await member.send(text);
          count++;
        } catch {}
      }
    }
    await message.channel.send(`Duyuru ${count} üyeye gönderildi.`);
    return;
  }

  if (cmd === "tagkapat") {
    // Yukarıda zaten var, ekleme yok
  }
// Tag aç komutu
if (cmd === "tagac") {
  if (!tagKapatSet.has(message.author.id)) {
    return message.reply("Tag koruması zaten açık.");
  }
  tagKapatSet.delete(message.author.id);
  await message.reply("Tag koruması açıldı.");
  return;
}

// Unban komutu
if (cmd === "unban") {
  if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    return message.reply("Bu komutu kullanmak için 'Üyeleri Engelle' yetkisine sahip olmalısın.");
  }
  if (!args[0]) return message.reply("Lütfen banı kaldırılacak kullanıcının ID'sini yaz.");
  
  try {
    await message.guild.members.unban(args[0]);
    await message.channel.send(`${args[0]} kullanıcısının banı kaldırıldı.`);
  } catch (error) {
    await message.channel.send("Ban kaldırma işlemi başarısız oldu veya kullanıcı banlı değil.");
  }
  return;
}
  if (cmd === "yardım") {
    const embed = new EmbedBuilder()
      .setTitle("Canavar Bot Komutları")
      .setDescription("Prefix: `c.`\n\n**Yetkili Komutlar:**\n" +
        "`nuke` - Kanalı yeniler\n" +
        "`lock` - Kanalı kilitler\n" +
        "`unlock` - Kanal kilidini açar\n" +
        "`ban` - Üyeyi banlar\n" +
        "`kick` - Üyeyi atar\n" +
        "`mute` - Üyeyi susturur\n" +
        "`unmute` - Üyenin susturmasını kaldırır\n\n" +
        "**Genel Komutlar:**\n" +
        "`yazdir` - Yapımcıya özel, bot mesajı yazdırır\n" +
        "`avatar` - Kullanıcının avatarını gösterir\n" +
        "`dm` - Yapımcıya özel DM gönderme komutu\n" +
        "`duyuru` - Yapımcıya özel tüm üyelere DM gönderir\n" +
        "`reboot` - Yapımcıya özel botu yeniden başlatır\n" +
        "`tagkapat` / `tagac` - Etiket korumasını açar/kapatır")
      .setColor("#00FFFF")
      .setFooter({ text: "Canavar Bot © 2025" });

    await message.channel.send({ embeds: [embed] });
    return;
  }

  // Eğer komut tanımlı değilse bir şey yapma
}

client.on("messageCreate", handleMessage);

client.login(process.env.TOKEN).catch(err => {
  console.error("Bot giriş hatası:", err);
});
