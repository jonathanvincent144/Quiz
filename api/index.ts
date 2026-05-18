import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Global state (Note: Ephemeral in Vercel)
let relayStates = {
  relay1: { pin: 5, state: false, name: 'Main Lights' },
  relay2: { pin: 19, state: false, name: 'Cooling Fan' },
  relay3: { pin: 18, state: false, name: 'Water Pump' },
  relay4: { pin: 23, state: false, name: 'External Aux' },
};

let sensorData = { temperature: 0, humidity: 0, lastUpdate: Date.now() };
let sensorHistory: any[] = [];
let espStatus = { isOnline: false, lastPing: 0 };

const config = {
  botToken: process.env.BOT_TOKEN || '',
  chatId: process.env.CHAT_ID || '',
};

async function sendTelegram(message: string) {
  if (!config.botToken || !config.chatId) return;
  try {
    await axios.post(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      chat_id: config.chatId,
      text: message,
      parse_mode: 'Markdown',
    });
  } catch (error) {
    console.error('Telegram error:', error);
  }
}

// Routes
app.get('/api/status', (req, res) => {
  const isOnline = Date.now() - espStatus.lastPing < 60000;
  res.json({
    relayStates,
    sensorData,
    espStatus: { ...espStatus, isOnline },
    telegramConfigured: !!(config.botToken && config.chatId),
    apiStatus: 'Online',
  });
});

app.get('/api/history', (req, res) => res.json(sensorHistory));

app.post('/api/esp/data', (req, res) => {
  const { temperature, humidity } = req.body;
  if (temperature !== undefined) {
    sensorData = { temperature, humidity, lastUpdate: Date.now() };
    sensorHistory.push({
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      temperature,
      humidity
    });
    if (sensorHistory.length > 50) sensorHistory.shift();
  }
  
  espStatus.lastPing = Date.now();
  espStatus.isOnline = true;

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
    await sendTelegram(`🔌 *Relay Alert*: ${relay.name} is now *${relay.state ? 'ON' : 'OFF'}*`);
    res.json({ success: true, newState: relay.state });
  } else {
    res.status(404).json({ error: 'Relay not found' });
  }
});

app.post('/api/config', (req, res) => {
  const { botToken, chatId } = req.body;
  if (botToken) config.botToken = botToken;
  if (chatId) config.chatId = chatId;
  res.json({ success: true });
});

export default app;
