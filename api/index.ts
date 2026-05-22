import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// In-memory state (acts as cache/fallback)
let relayStates = {
  relay1: { pin: 5, state: false, name: 'Relay 1' },
  relay2: { pin: 19, state: false, name: 'Relay 2' },
  relay3: { pin: 18, state: false, name: 'Relay 3' },
  relay4: { pin: 23, state: false, name: 'Relay 4' },
};

let sensorData = {
  temperature: 0,
  humidity: 0,
  lastUpdate: Date.now(),
};

let sensorHistory: any[] = [];
const MAX_HISTORY = 15;

let espStatus = {
  isOnline: false,
  lastPing: 0,
  ip: '',
  publicIp: '',
};

// Telegram Config
const config = {
  botToken: process.env.BOT_TOKEN || '',
  chatId: process.env.CHAT_ID || '',
};

let lastPullTime = 0;
let lastWebhookUrl = '';
let runningBackendVariation = false;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Setup Telegram Webhook automatically based on request origin/host
async function setupWebhook(req: express.Request) {
  if (!config.botToken) return;
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const cleanProtocol = String(protocol).split(',')[0].trim();
    const host = req.headers.host;
    if (!host) return;
    const webhookUrl = `${cleanProtocol}://${host}/api/telegram/webhook`;
    
    if (webhookUrl === lastWebhookUrl) return; // Already configured recently for this host
    
    const url = `https://api.telegram.org/bot${config.botToken}/setWebhook`;
    await axios.post(url, { url: webhookUrl }, { timeout: 4000 });
    lastWebhookUrl = webhookUrl;
    console.log('Telegram Webhook successfully set to:', webhookUrl);
  } catch (err: any) {
    console.log('Error registering Telegram webhook automatically in prod:', err.message);
  }
}

// Backend-side variation runner
async function runVariationSequence(version: number) {
  if (runningBackendVariation) {
    await sendTelegram(`⚠️ *Gagal:* Variasi lain sedang berjalan.`);
    return;
  }
  runningBackendVariation = true;
  await sendTelegram(`🎬 *Menjalankan Variasi ${version}...* \n(Relay akan berurutan hidup & mati)`);
  
  try {
    const sequence = version === 1 
      ? ['relay1', 'relay2', 'relay3', 'relay4'] 
      : ['relay1', 'relay3', 'relay2', 'relay4'];
      
    for (let i = 0; i < 2; i++) {
      // ON cycle
      for (const id of sequence) {
        const relay = (relayStates as any)[id];
        if (relay) {
          relay.state = true;
          await pushState();
          await sleep(500);
        }
      }
      await sleep(1000);
      // OFF cycle
      for (const id of sequence) {
        const relay = (relayStates as any)[id];
        if (relay) {
          relay.state = false;
          await pushState();
          await sleep(500);
        }
      }
      if (i === 0) await sleep(1000);
    }
    await sendTelegram(`✅ *Variasi ${version} selesai dijalankan.*`);
  } catch (err: any) {
    console.error(`Backend variation ${version} failed:`, err.message);
    await sendTelegram(`❌ *Error:* Gagal menjalankan Variasi ${version}.`);
  } finally {
    runningBackendVariation = false;
  }
}

// Sync helpers
async function pullState() {
  const now = Date.now();
  if (now - lastPullTime < 5000) {
    return; // Throttling: only pull once every 5 seconds maximum
  }
  lastPullTime = now;

  try {
    const url = 'https://keyvalue.immanuel.co/api/KeyVal/GetValue/987ff58c_iotel/state';
    const res = await axios.get(url, { timeout: 3000 });
    if (res.data && typeof res.data === 'string') {
      let cleanHex = res.data.trim();
      if (cleanHex.startsWith('"') && cleanHex.endsWith('"')) {
        cleanHex = cleanHex.slice(1, -1);
      }
      if (cleanHex && /^[0-9a-fA-F]+$/.test(cleanHex)) {
        const decoded = Buffer.from(cleanHex, 'hex').toString('utf8');
        const db = JSON.parse(decoded);
        if (db.relayStates) {
          relayStates = {
            relay1: { pin: 5, state: db.relayStates.relay1?.state ?? false, name: db.relayStates.relay1?.name || 'Relay 1' },
            relay2: { pin: 19, state: db.relayStates.relay2?.state ?? false, name: db.relayStates.relay2?.name || 'Relay 2' },
            relay3: { pin: 18, state: db.relayStates.relay3?.state ?? false, name: db.relayStates.relay3?.name || 'Relay 3' },
            relay4: { pin: 23, state: db.relayStates.relay4?.state ?? false, name: db.relayStates.relay4?.name || 'Relay 4' },
          };
        }
        if (db.sensorData) sensorData = db.sensorData;
        if (db.sensorHistory) sensorHistory = db.sensorHistory;
        if (db.espStatus) espStatus = db.espStatus;
        if (db.config) {
          if (db.config.botToken) config.botToken = db.config.botToken;
          if (db.config.chatId) config.chatId = db.config.chatId;
        }
      }
    }
  } catch (error: any) {
    console.log('Sync pull note in prod:', error.message);
  }
}

async function pushState() {
  try {
    const stateObj = {
      relayStates,
      sensorData,
      sensorHistory,
      espStatus,
      config
    };
    const serialized = JSON.stringify(stateObj);
    const hexValue = Buffer.from(serialized, 'utf8').toString('hex');
    const url = `https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/987ff58c_iotel/state/${hexValue}`;
    await axios.post(url, {}, { timeout: 3000 });
  } catch (error: any) {
    console.log('Sync push error in prod:', error.message);
  }
}

// Helper: Send Telegram Notification
async function sendTelegram(message: string) {
  if (!config.botToken || !config.chatId) return;
  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    await axios.post(url, {
      chat_id: config.chatId,
      text: message,
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error('Telegram notification failed:', error);
  }
}

// Telegram command message dispatcher
async function handleTelegramMessage(body: any) {
  if (!body || !body.message) return;
  const message = body.message;
  const chatId = message.chat.id;
  const text = message.text ? message.text.trim() : '';
  
  if (!text) return;
  
  const token = config.botToken;
  if (!token) return;
  
  // Helper: Reply back
  const reply = async (msg: string) => {
    try {
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: msg,
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [{ text: '📊 Status & DHT11' }, { text: '🎬 Variasi 1' }, { text: '🎬 Variasi 2' }],
            [{ text: `🔌 Toggle ${relayStates.relay1.name}` }, { text: `🔌 Toggle ${relayStates.relay2.name}` }],
            [{ text: `🔌 Toggle ${relayStates.relay3.name}` }, { text: `🔌 Toggle ${relayStates.relay4.name}` }],
            [{ text: '⚡ Nyalakan Semua' }, { text: '❌ Matikan Semua' }]
          ],
          resize_keyboard: true,
        }
      }, { timeout: 4000 });
    } catch (e: any) {
      console.error('Error replying to Telegram:', e.message);
    }
  };

  // Pairing workflow: If chatId config is not set, assist the user to pair
  if (!config.chatId) {
    if (text.toLowerCase() === '/start' || text.toLowerCase().includes('pair')) {
      await reply(`👋 *Halo! Selamat datang di Telegram Bot IOTEL!*\n\nID Chat Anda adalah: \`${chatId}\`\n\nSilakan masukkan ID ini ke dalam kolom *Primary Chat ID* di halaman Dashboard IOTEL Anda untuk menghubungkan bot.`);
      return;
    }
    await reply(`⚠️ *Bot belum terhubung.*\n\nID Chat Anda: \`${chatId}\`\nSalin ID ini dan simpan di halaman pengaturan Dashboard IOTEL.`);
    return;
  }
  
  // Security check: Only accept messages from the configured Chat ID
  if (String(chatId) !== String(config.chatId)) {
    await reply(`🚫 *Akses Ditolak.*\n\nBot ini dikonfigurasi untuk operator lain. ID Chat terdaftar berbeda dengan \`${chatId}\`.`);
    return;
  }

  const cleanText = text.toLowerCase();

  // 1. HELP / START MENU
  if (cleanText === '/start' || cleanText === '/help' || cleanText.includes('menu') || cleanText.includes('bantuan')) {
    await reply(`📱 *Menu Kontrol Telegram IOTEL Bot*\n\nGunakan tombol di bawah keyboard Anda, atau kirim perintah teks untuk mengoperasikan:\n\n` +
      `*Perintah Status:*\n` +
      `• *status* atau *dht11* - Cek Sensor & Relay\n\n` +
      `*Perintah Relay Individu:*\n` +
      `• *hidupkan ${relayStates.relay1.name.toLowerCase()}* (atau *relay 1 on*)\n` +
      `• *matikan ${relayStates.relay1.name.toLowerCase()}* (atau *relay 1 off*)\n\n` +
      `*Perintah Massal & Variasi:*\n` +
      `• *nyalakan semua* / *matikan semua*\n` +
      `• *variasi 1* (v1) / *variasi 2* (v2)`);
    return;
  }

  // 2. STATUS & DHT11
  if (cleanText.includes('status') || cleanText.includes('dht') || cleanText.includes('suhu') || cleanText.includes('kelembaban') || cleanText.includes('temp') || cleanText.includes('humid')) {
    const isOnline = Date.now() - espStatus.lastPing < 60000;
    const timeString = sensorData.lastUpdate ? new Date(sensorData.lastUpdate).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : 'N/A';
    
    let relayStatusText = '';
    Object.keys(relayStates).forEach((key) => {
      const relay = (relayStates as any)[key];
      relayStatusText += `• ${relay.name}: *${relay.state ? '🟢 HIDUP (ON)' : '🔴 MATI (OFF)'}*\n`;
    });

    await reply(`📊 *STATUS SISTEM IOTEL (DHT11)*\n\n` +
      `🌡️ *Suhu:* ${sensorData.temperature}°C\n` +
      `💧 *Kelembaban:* ${sensorData.humidity}%\n` +
      `🕒 *Update Terakhir:* ${timeString}\n\n` +
      `📡 *Status Alat:* ${isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}\n` +
      (espStatus.ip ? `🔗 *IP Lokal:* \`${espStatus.ip}\`\n` : '') +
      `🌐 *Public IP:* \`${espStatus.publicIp || 'N/A'}\`\n\n` +
      `🔌 *Status Relay:*\n${relayStatusText}`);
    return;
  }

  // 3. RUN VARIATION 1
  if (cleanText.includes('variasi 1') || cleanText === 'variasi satu' || cleanText === '/v1' || cleanText === 'v1' || cleanText.includes('🎬 variasi 1')) {
    runVariationSequence(1).catch((err) => console.log('Err running v1 from TG in prod:', err.message));
    return;
  }

  // 4. RUN VARIATION 2
  if (cleanText.includes('variasi 2') || cleanText === 'variasi dua' || cleanText === '/v2' || cleanText === 'v2' || cleanText.includes('🎬 variasi 2')) {
    runVariationSequence(2).catch((err) => console.log('Err running v2 from TG in prod:', err.message));
    return;
  }

  // 5. MASTER ALL ON
  if (cleanText.includes('nyalakan semua') || cleanText.includes('hidupkan semua') || cleanText.includes('all on') || cleanText === '⚡ nyalakan semua') {
    Object.keys(relayStates).forEach((key) => {
      (relayStates as any)[key].state = true;
    });
    await sendTelegram(`🔌 *Telegram Control*: All relays are now *ON*`);
    await pushState();
    await reply(`⚡ *Semua relay berhasil diaktifkan (ON)!*`);
    return;
  }

  // 6. MASTER ALL OFF
  if (cleanText.includes('matikan semua') || cleanText.includes('all off') || cleanText === '❌ matikan semua') {
    Object.keys(relayStates).forEach((key) => {
      (relayStates as any)[key].state = false;
    });
    await sendTelegram(`🔌 *Telegram Control*: All relays are now *OFF*`);
    await pushState();
    await reply(`🔌 *Semua relay berhasil dinonaktifkan (OFF).*`);
    return;
  }

  // Helper macro for checking individual relay commands
  const matchAndToggleRelay = async (relayKey: string, idNum: number) => {
    const relay = (relayStates as any)[relayKey];
    if (!relay) return false;
    
    const lowerName = relay.name.toLowerCase();
    
    // Check toggle
    if (cleanText === `toggle ${lowerName}` || cleanText.includes(`🔌 toggle ${lowerName}`)) {
      relay.state = !relay.state;
      await sendTelegram(`🔌 *Telegram Toggle*: ${relay.name} is now *${relay.state ? 'ON' : 'OFF'}*`);
      await pushState();
      await reply(`🔌 *${relay.name}* berhasil di-toggle menjadi *${relay.state ? 'HIDUP (ON)' : 'MATI (OFF)'}*.`);
      return true;
    }

    // Check ON Command
    if (
      cleanText.includes(`hidupkan relay ${idNum}`) || 
      cleanText.includes(`nyalakan relay ${idNum}`) || 
      cleanText.includes(`relay ${idNum} on`) ||
      cleanText.includes(`hidupkan ${lowerName}`) || 
      cleanText.includes(`nyalakan ${lowerName}`)
    ) {
      if (relay.state) {
        await reply(`💡 *${relay.name}* memang sudah *HIDUP (ON)*.`);
      } else {
        relay.state = true;
        await sendTelegram(`🔌 *Telegram Control*: ${relay.name} is now *ON*`);
        await pushState();
        await reply(`🟢 *${relay.name}* berhasil dinyalakan (ON).`);
      }
      return true;
    }

    // Check OFF Command
    if (
      cleanText.includes(`matikan relay ${idNum}`) || 
      cleanText.includes(`relay ${idNum} off`) ||
      cleanText.includes(`matikan ${lowerName}`)
    ) {
      if (!relay.state) {
        await reply(`🔌 *${relay.name}* memang sudah *MATI (OFF)*.`);
      } else {
        relay.state = false;
        await sendTelegram(`🔌 *Telegram Control*: ${relay.name} is now *OFF*`);
        await pushState();
        await reply(`🔴 *${relay.name}* berhasil dimatikan (OFF).`);
      }
      return true;
    }

    return false;
  };

  // Try matching individual relays
  if (await matchAndToggleRelay('relay1', 1)) return;
  if (await matchAndToggleRelay('relay2', 2)) return;
  if (await matchAndToggleRelay('relay3', 3)) return;
  if (await matchAndToggleRelay('relay4', 4)) return;

  // 7. DEFAULT FALLBACK
  await reply(`❓ *Perintah tidak dikenali.*\n\nKetik *menu* atau *bantuan* untuk melihat daftar kontrol.`);
}

// Router for modular syncing
const apiRouter = express.Router();

apiRouter.use((req, res, next) => {
  pullState().catch((err) => console.log('Background pull error in prod:', err.message));
  setupWebhook(req).catch((err) => console.log('Telegram Webhook Setup Error in prod:', err.message));
  next();
});

// Routes Definitions
apiRouter.get('/status', (req, res) => {
  const now = Date.now();
  espStatus.isOnline = now - espStatus.lastPing < 60000;
  res.json({
    relayStates,
    sensorData,
    espStatus,
    telegramConfigured: !!(config.botToken && config.chatId),
    apiStatus: 'Online',
  });
});

apiRouter.get('/history', (req, res) => {
  res.json(sensorHistory);
});

apiRouter.post('/esp/data', async (req, res) => {
  const { temperature, humidity, ip } = req.body;
  if (temperature !== undefined && humidity !== undefined) {
    sensorData = { temperature, humidity, lastUpdate: Date.now() };
    sensorHistory.push({
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      temperature,
      humidity,
    });
    if (sensorHistory.length > 50) sensorHistory.shift();
  }

  const wasOffline = !espStatus.isOnline;
  espStatus.lastPing = Date.now();
  espStatus.isOnline = true;
  
  if (ip) {
    espStatus.ip = ip;
  }
  
  const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (typeof rawIp === 'string' && rawIp) {
    espStatus.publicIp = rawIp.split(',')[0].trim();
  }

  if (wasOffline) {
    await sendTelegram('✅ *ESP32 Connected*');
  }

  pushState().catch((err) => console.log('Background push error in prod:', err.message));

  res.json({
    relays: {
      '5': relayStates.relay1.state ? 1 : 0,
      '19': relayStates.relay2.state ? 1 : 0,
      '18': relayStates.relay3.state ? 1 : 0,
      '23': relayStates.relay4.state ? 1 : 0,
    }
  });
});

apiRouter.post('/relay/toggle', async (req, res) => {
  const { relayId } = req.body;
  const relay = (relayStates as any)[relayId];
  if (relay) {
    relay.state = !relay.state;
    await sendTelegram(`🔌 *Relay*: ${relay.name} is *${relay.state ? 'ON' : 'OFF'}*`);
    pushState().catch((err) => console.log('Background push error in prod:', err.message));
    res.json({ success: true, newState: relay.state });
  } else {
    res.status(404).json({ error: 'Relay not found' });
  }
});

apiRouter.post('/relay/all', async (req, res) => {
  const { state } = req.body;
  const isOn = !!state;
  Object.keys(relayStates).forEach((key) => {
    (relayStates as any)[key].state = isOn;
  });
  await sendTelegram(`🔌 *Master Control*: All relays are now *${isOn ? 'ON' : 'OFF'}*`);
  pushState().catch((err) => console.log('Background push error in prod:', err.message));
  res.json({ success: true, state: isOn });
});

apiRouter.post('/config', async (req, res) => {
  const { botToken, chatId } = req.body;
  if (botToken) config.botToken = botToken;
  if (chatId) config.chatId = chatId;
  await sendTelegram('🚀 *Config Updated*');
  
  // Try dynamic webhook registration immediately
  setupWebhook(req).catch((err) => console.log('Immediate configuration webhook setup error in prod:', err.message));
  
  pushState().catch((err) => console.log('Background push error in prod:', err.message));
  res.json({ success: true });
});

apiRouter.post('/telegram/webhook', async (req, res) => {
  try {
    await handleTelegramMessage(req.body);
  } catch (err: any) {
    console.error('Webhook processing error in prod:', err.message);
  }
  res.json({ ok: true });
});

app.use('/api', apiRouter);

export default app;
