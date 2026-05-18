import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
app.use(express.json());

// In-memory state (Note: ephemeral in Vercel)
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
const MAX_HISTORY = 50;

let espStatus = {
  isOnline: false,
  lastPing: 0,
};

// Telegram Config
const config = {
  botToken: process.env.BOT_TOKEN || '',
  chatId: process.env.CHAT_ID || '',
};

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

// Routes
app.get('/api/status', (req, res) => {
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

app.get('/api/history', (req, res) => {
  res.json(sensorHistory);
});

app.post('/api/esp/data', (req, res) => {
  const { temperature, humidity } = req.body;
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

  if (wasOffline) sendTelegram('✅ *ESP32 Connected*');

  res.json({
    relays: {
      '5': relayStates.relay1.state ? 1 : 0,
      '19': relayStates.relay2.state ? 1 : 0,
      '18': relayStates.relay3.state ? 1 : 0,
      '23': relayStates.relay4.state ? 1 : 0,
    }
  });
});

app.post('/api/relay/toggle', async (req, res) => {
  const { relayId } = req.body;
  const relay = (relayStates as any)[relayId];
  if (relay) {
    relay.state = !relay.state;
    await sendTelegram(`🔌 *Relay*: ${relay.name} is *${relay.state ? 'ON' : 'OFF'}*`);
    res.json({ success: true, newState: relay.state });
  } else {
    res.status(404).json({ error: 'Relay not found' });
  }
});

app.post('/api/relay/all', async (req, res) => {
  const { state } = req.body;
  const isOn = !!state;
  
  Object.keys(relayStates).forEach((key) => {
    (relayStates as any)[key].state = isOn;
  });

  await sendTelegram(`🔌 *Master Control*: All relays are now *${isOn ? 'ON' : 'OFF'}*`);
  res.json({ success: true, state: isOn });
});

app.post('/api/config', (req, res) => {
  const { botToken, chatId } = req.body;
  if (botToken) config.botToken = botToken;
  if (chatId) config.chatId = chatId;
  sendTelegram('🚀 *Config Updated*');
  res.json({ success: true });
});

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
