import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

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
    console.log('Sync pull note in dev:', error.message);
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
    console.log('Sync push error in dev:', error.message);
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

// Router for modular syncing
const apiRouter = express.Router();

apiRouter.use((req, res, next) => {
  pullState().catch((err) => console.log('Background pull error in dev:', err.message));
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
    if (sensorHistory.length > MAX_HISTORY) sensorHistory.shift();
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

  pushState().catch((err) => console.log('Background push error in dev:', err.message));

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
    pushState().catch((err) => console.log('Background push error in dev:', err.message));
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
  pushState().catch((err) => console.log('Background push error in dev:', err.message));
  res.json({ success: true, state: isOn });
});

apiRouter.post('/config', async (req, res) => {
  const { botToken, chatId } = req.body;
  if (botToken) config.botToken = botToken;
  if (chatId) config.chatId = chatId;
  await sendTelegram('🚀 *Config Updated*');
  pushState().catch((err) => console.log('Background push error in dev:', err.message));
  res.json({ success: true });
});

app.use('/api', apiRouter);

// Vite/Serve Logic for Local Development
async function startServer() {
  const PORT = 3000;
  
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export { app };
export default app;
