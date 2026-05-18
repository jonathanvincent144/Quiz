import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
export { app }; 
const PORT = 3000;

app.use(express.json());

// In-memory state
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
const MAX_HISTORY = 100;

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

// API Routes
app.get('/api/status', (req, res) => {
  const now = Date.now();
  // Simple online check (within 1 minute)
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

// ESP32 Pushes data
app.post('/api/esp/data', (req, res) => {
  const { temperature, humidity } = req.body;
  
  if (temperature !== undefined && humidity !== undefined) {
    sensorData = {
      temperature,
      humidity,
      lastUpdate: Date.now(),
    };
    
    sensorHistory.push({
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      temperature,
      humidity,
      timestamp: Date.now(),
    });

    if (sensorHistory.length > MAX_HISTORY) {
      sensorHistory.shift();
    }
  }

  const wasOffline = !espStatus.isOnline;
  espStatus.lastPing = Date.now();
  espStatus.isOnline = true;

  if (wasOffline) {
    sendTelegram('✅ *ESP32 Connected* - Device is online.');
  }

  // Return expected relay states to ESP32
  res.json({
    relays: {
      '5': relayStates.relay1.state ? 1 : 0,
      '19': relayStates.relay2.state ? 1 : 0,
      '18': relayStates.relay3.state ? 1 : 0,
      '23': relayStates.relay4.state ? 1 : 0,
    }
  });
});

// ESP32 Pings simple status
app.get('/api/esp/ping', (req, res) => {
  const wasOffline = !espStatus.isOnline;
  espStatus.lastPing = Date.now();
  espStatus.isOnline = true;

  if (wasOffline) {
    sendTelegram('✅ *ESP32 Connected* - Device reached out.');
  }

  res.json({ status: 'ok', relays: relayStates });
});

// Web interface Toggles Relay
app.post('/api/relay/toggle', async (req, res) => {
  const { relayId } = req.body;
  const relay = (relayStates as any)[relayId];
  
  if (relay) {
    relay.state = !relay.state;
    const msg = `🔌 *Relay Alert*: ${relay.name} (Pin ${relay.pin}) is now *${relay.state ? 'ON' : 'OFF'}*`;
    await sendTelegram(msg);
    res.json({ success: true, newState: relay.state });
  } else {
    res.status(404).json({ error: 'Relay not found' });
  }
});

// Config Telegram
app.post('/api/config', (req, res) => {
  const { botToken, chatId } = req.body;
  if (botToken) config.botToken = botToken;
  if (chatId) config.chatId = chatId;
  
  sendTelegram('🚀 *Telegram Configured* - Web Interface is now connected to this bot.');
  res.json({ success: true, configured: !!(config.botToken && config.chatId) });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get(/^(?!\/api).+/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

if (!process.env.VERCEL || process.env.NODE_ENV !== 'production') {
  startServer();
}

export default app;
