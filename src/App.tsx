import React, { useState, useEffect } from 'react';
import { 
  Thermometer, 
  Droplets, 
  Zap, 
  Send, 
  Cpu, 
  Globe, 
  Settings,
  Bell,
  RefreshCw,
  Power,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Mic,
  MicOff,
  Radio
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import axios from 'axios';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [btnLoading, setBtnLoading] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState({ botToken: '', chatId: '' });
  const [isListening, setIsListening] = useState(false);
  const [voiceTooltip, setVoiceTooltip] = useState<string | null>(null);
  const [isRunningVariation, setIsRunningVariation] = useState<string | null>(null);

  // Direct LAN control state variables
  const [directLanMode, setDirectLanMode] = useState<boolean>(() => {
    return localStorage.getItem('directLanMode') === 'true';
  });
  const [espIp, setEspIp] = useState<string>(() => {
    return localStorage.getItem('espIp') || '10.236.137.114';
  });
  const [lanEndpointPattern, setLanEndpointPattern] = useState<string>(() => {
    return localStorage.getItem('lanEndpointPattern') || 'json_post';
  });

  const [localIpInput, setLocalIpInput] = useState(espIp);
  const [localLanToggle, setLocalLanToggle] = useState(directLanMode);
  const [localPattern, setLocalPattern] = useState(lanEndpointPattern);

  const fetchData = async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        axios.get('/api/status'),
        axios.get('/api/history')
      ]);
      
      // If direct LAN mode is enabled, we merge fetched data but keep local optimistic updates primary
      if (directLanMode) {
        setData((prev: any) => {
          if (!prev) return statusRes.data;
          // Only pull sensors & other parameters from the cloud, and keep relayStates if they are being updated locally
          return {
            ...statusRes.data,
            relayStates: prev.relayStates || statusRes.data.relayStates
          };
        });
      } else {
        setData(statusRes.data);
      }
      setHistory(historyRes.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Gagal mengambil data dari server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [directLanMode]);

  useEffect(() => {
    if (configOpen) {
      setLocalIpInput(espIp);
      setLocalLanToggle(directLanMode);
      setLocalPattern(lanEndpointPattern);
    }
  }, [configOpen, espIp, directLanMode, lanEndpointPattern]);

  const toggleRelay = async (relayId: string) => {
    setBtnLoading(relayId);

    if (directLanMode) {
      const pinMap: Record<string, number> = { relay1: 5, relay2: 19, relay3: 18, relay4: 23 };
      const currentRelay = data?.relayStates?.[relayId];
      const targetState = currentRelay ? !currentRelay.state : true;

      // Optimistic update for zero-delay feed back
      setData((prev: any) => {
        if (!prev || !prev.relayStates) return prev;
        return {
          ...prev,
          relayStates: {
            ...prev.relayStates,
            [relayId]: {
              ...prev.relayStates[relayId],
              state: targetState
            }
          }
        };
      });

      try {
        if (lanEndpointPattern === 'query_pin') {
          const pin = pinMap[relayId] || 5;
          await axios.get(`http://${espIp}/toggle?pin=${pin}&state=${targetState ? 1 : 0}`, { timeout: 1500 });
        } else if (lanEndpointPattern === 'query_relayId') {
          await axios.get(`http://${espIp}/toggle?relayId=${relayId}`, { timeout: 1500 });
        } else {
          // json_post API (matches our standard backend `/api/relay/toggle` body format)
          await axios.post(`http://${espIp}/api/relay/toggle`, { relayId }, { timeout: 1500 });
        }

        // Keep cloud syncing in the background for active integration logs and consistency
        axios.post('/api/relay/toggle', { relayId }).catch((e) => console.log('Cloud sync error:', e.message));
      } catch (err: any) {
        console.error('Direct LAN request failed:', err);
        // Revert optimistic update
        setData((prev: any) => {
          if (!prev || !prev.relayStates) return prev;
          return {
            ...prev,
            relayStates: {
              ...prev.relayStates,
              [relayId]: {
                ...prev.relayStates[relayId],
                state: !targetState
              }
            }
          };
        });
        alert(`Koneksi Langsung ke ESP32 Gagal!\nIP: http://${espIp}\nError: ${err.message}\n\nPastikan HP/Laptop Anda berada dalam satu jaringan Wi-Fi dengan ESP32.\n\nCatatan Keamanan HTTPS: Browser memblokir HTTP secara default. Jika gagal, silakan aktifkan "Insecure Content" di Pengaturan Origin browser Anda.`);
      } finally {
        setBtnLoading(null);
      }
      return;
    }

    try {
      await axios.post('/api/relay/toggle', { relayId });
      await fetchData();
    } catch (err) {
      alert('Gagal mengubah status relay');
    } finally {
      setBtnLoading(null);
    }
  };

  const toggleAll = async (state: boolean) => {
    setBtnLoading('master-' + state);

    if (directLanMode) {
      // Optimistic update
      setData((prev: any) => {
        if (!prev || !prev.relayStates) return prev;
        const updated = { ...prev.relayStates };
        Object.keys(updated).forEach(k => {
          updated[k] = { ...updated[k], state };
        });
        return { ...prev, relayStates: updated };
      });

      try {
        if (lanEndpointPattern === 'query_pin') {
          await Promise.all([
            axios.get(`http://${espIp}/toggle?pin=5&state=${state ? 1 : 0}`, { timeout: 1500 }),
            axios.get(`http://${espIp}/toggle?pin=19&state=${state ? 1 : 0}`, { timeout: 1500 }),
            axios.get(`http://${espIp}/toggle?pin=18&state=${state ? 1 : 0}`, { timeout: 1500 }),
            axios.get(`http://${espIp}/toggle?pin=23&state=${state ? 1 : 0}`, { timeout: 1500 }),
          ]);
        } else {
          await axios.post(`http://${espIp}/api/relay/all`, { state }, { timeout: 1500 });
        }

        // Keep cloud syncing in background
        axios.post('/api/relay/all', { state }).catch((e) => console.log('Cloud master state sync error:', e.message));
      } catch (err: any) {
        console.error('Direct LAN Master toggle failed:', err);
        fetchData();
        alert(`Koneksi Langsung Master Gagal!\nIP: http://${espIp}\nError: ${err.message}`);
      } finally {
        setBtnLoading(null);
      }
      return;
    }

    try {
      await axios.post('/api/relay/all', { state });
      await fetchData();
    } catch (err) {
      alert('Gagal mengubah status semua relay');
    } finally {
      setBtnLoading(null);
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const runVariation1 = async () => {
    if (isRunningVariation) return;
    setIsRunningVariation('v1');
    setVoiceTooltip("Menjalankan Variasi 1...");
    try {
      const sequence = ['relay1', 'relay2', 'relay3', 'relay4'];
      for (let i = 0; i < 2; i++) {
        // ON
        for (const id of sequence) {
          await axios.post('/api/relay/toggle', { relayId: id });
          await sleep(500);
          await fetchData();
        }
        await sleep(1000);
        // OFF
        for (const id of sequence) {
          await axios.post('/api/relay/toggle', { relayId: id });
          await sleep(500);
          await fetchData();
        }
        if (i === 0) await sleep(1000);
      }
    } catch (err) {
      console.error('Variation 1 failed', err);
    } finally {
      setIsRunningVariation(null);
      setVoiceTooltip(null);
    }
  };

  const runVariation2 = async () => {
    if (isRunningVariation) return;
    setIsRunningVariation('v2');
    setVoiceTooltip("Menjalankan Variasi 2...");
    try {
      const sequence = ['relay1', 'relay3', 'relay2', 'relay4'];
      for (let i = 0; i < 2; i++) {
        // ON
        for (const id of sequence) {
          await axios.post('/api/relay/toggle', { relayId: id });
          await sleep(500);
          await fetchData();
        }
        await sleep(1000);
        // OFF
        for (const id of sequence) {
          await axios.post('/api/relay/toggle', { relayId: id });
          await sleep(500);
          await fetchData();
        }
        if (i === 0) await sleep(1000);
      }
    } catch (err) {
      console.error('Variation 2 failed', err);
    } finally {
      setIsRunningVariation(null);
      setVoiceTooltip(null);
    }
  };

  const handleVoiceCommand = (command: string) => {
    const cmd = command.toLowerCase();
    setVoiceTooltip(`Mendengar: "${command}"`);
    setTimeout(() => { if (!isRunningVariation) setVoiceTooltip(null); }, 3000);

    if (cmd.includes('variasi 1') || cmd.includes('variasi satu')) {
      runVariation1();
    } else if (cmd.includes('variasi 2') || cmd.includes('variasi dua')) {
      runVariation2();
    } else if (cmd.includes('hidupkan semua') || cmd.includes('nyalakan semua')) {
      toggleAll(true);
    } else if (cmd.includes('matikan semua')) {
      toggleAll(false);
    } else if (cmd.includes('hidupkan relay 1') || cmd.includes('nyalakan relay 1')) {
      if (!relayStates.relay1.state) toggleRelay('relay1');
    } else if (cmd.includes('matikan relay 1')) {
      if (relayStates.relay1.state) toggleRelay('relay1');
    } else if (cmd.includes('hidupkan relay 2') || cmd.includes('nyalakan relay 2')) {
      if (!relayStates.relay2.state) toggleRelay('relay2');
    } else if (cmd.includes('matikan relay 2')) {
      if (relayStates.relay2.state) toggleRelay('relay2');
    } else if (cmd.includes('hidupkan relay 3') || cmd.includes('nyalakan relay 3')) {
      if (!relayStates.relay3.state) toggleRelay('relay3');
    } else if (cmd.includes('matikan relay 3')) {
      if (relayStates.relay3.state) toggleRelay('relay3');
    } else if (cmd.includes('hidupkan relay 4') || cmd.includes('nyalakan relay 4')) {
      if (!relayStates.relay4.state) toggleRelay('relay4');
    } else if (cmd.includes('matikan relay 4')) {
      if (relayStates.relay4.state) toggleRelay('relay4');
    }
  };

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Browser Anda tidak mendukung perintah suara.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const speechToText = event.results[0][0].transcript;
      handleVoiceCommand(speechToText);
    };

    recognition.start();
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/config', configForm);
      
      // Save direct LAN variables
      localStorage.setItem('directLanMode', String(localLanToggle));
      localStorage.setItem('espIp', localIpInput);
      localStorage.setItem('lanEndpointPattern', localPattern);
      
      setDirectLanMode(localLanToggle);
      setEspIp(localIpInput);
      setLanEndpointPattern(localPattern);

      setConfigOpen(false);
      fetchData();
    } catch (err) {
      alert('Gagal menyimpan konfigurasi');
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-brand-bg text-white flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="animate-spin text-indigo-500" size={48} />
          <p className="text-slate-500 uppercase tracking-widest text-sm">System Initializing...</p>
        </div>
      </div>
    );
  }

  const { relayStates, sensorData, espStatus, telegramConfigured, apiStatus } = data || {};

  return (
    <div className="min-h-screen bg-brand-bg text-slate-300 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      {/* Header */}
      <header className="h-16 border-b border-slate-800 bg-brand-header flex items-center justify-between px-8 sticky top-0 z-40">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <Zap className="w-5 h-5 text-white fill-white" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">IOTEL <span className="text-indigo-400 font-normal">Dashboard</span></h1>
        </div>
        <div className="flex items-center space-x-6">
          {directLanMode && (
            <div className="flex items-center space-x-1.5 border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 rounded-full text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
              <Cpu size={12} className="text-emerald-400 animate-pulse" />
              <span>LAN AKTIF ({espIp})</span>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <span className={cn("w-2 h-2 rounded-full", espStatus?.isOnline ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500")} />
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              {espStatus?.isOnline ? 'System Live' : 'System Offline'}
            </span>
          </div>
          <div className="hidden lg:block text-sm text-slate-500 font-mono">ID: ESP32_4A9B11</div>
          <button 
            onClick={startListening}
            className={cn(
              "p-2 rounded-lg transition-all relative group",
              isListening ? "bg-red-500/10 text-red-500" : "hover:bg-slate-800 text-slate-400 hover:text-white"
            )}
          >
            {isListening ? (
              <div className="relative">
                <Mic size={20} className="animate-pulse" />
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
              </div>
            ) : <Mic size={20} />}
            
            {voiceTooltip && (
              <div className="absolute top-full right-0 mt-3 bg-brand-card border border-slate-700 px-3 py-1.5 rounded-lg text-[10px] whitespace-nowrap shadow-2xl z-50 text-indigo-400">
                {voiceTooltip}
              </div>
            )}
          </button>
          <button 
            onClick={() => setConfigOpen(true)}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors group"
          >
            <Settings className="text-slate-400 group-hover:text-white transition-colors" size={20} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6 pb-24">
        
        {/* Left Column: Sensors & Controls (8/12) */}
        <div className="md:col-span-8 space-y-6 flex flex-col">
          
          {/* Sensor Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Temperature Card */}
            <div className="bg-brand-card border border-slate-800 rounded-2xl p-6 relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Temperature</p>
                <div className="mt-2 flex items-baseline">
                  <span className="text-5xl font-light text-white tabular-nums">{sensorData?.temperature || 0}</span>
                  <span className="text-2xl text-slate-500 ml-1">°C</span>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-16 opacity-10 transition-opacity group-hover:opacity-20 pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history.slice(-20)}>
                    <Area type="monotone" dataKey="temperature" stroke="#6366f1" fill="#6366f1" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="absolute top-6 right-6 text-indigo-400 opacity-40">
                <Thermometer size={24} />
              </div>
            </div>

            {/* Humidity Card */}
            <div className="bg-brand-card border border-slate-800 rounded-2xl p-6 relative overflow-hidden group">
              <div className="relative z-10">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Humidity</p>
                <div className="mt-2 flex items-baseline">
                  <span className="text-5xl font-light text-white tabular-nums">{sensorData?.humidity || 0}</span>
                  <span className="text-2xl text-slate-500 ml-1">%</span>
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-16 opacity-10 transition-opacity group-hover:opacity-20 pointer-events-none">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history.slice(-20)}>
                    <Area type="monotone" dataKey="humidity" stroke="#22d3ee" fill="#22d3ee" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="absolute top-6 right-6 text-cyan-400 opacity-40">
                <Droplets size={24} />
              </div>
            </div>
          </div>

          {/* Relay Control Interface */}
          <div className="flex-1 bg-brand-card border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col gap-6 mb-8">
              <h3 className="text-sm font-semibold text-white flex items-center">
                <span className="w-1.5 h-4 bg-indigo-500 rounded-full mr-2"></span>
                RELAY CONTROL INTERFACE
              </h3>
              
              <div className="flex flex-col gap-4">
                {/* Global Controls Row */}
                <div className="flex gap-3">
                  <button 
                    onClick={() => toggleAll(true)}
                    disabled={!!btnLoading || !!isRunningVariation}
                    className="flex-1 px-4 py-3 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-xl border border-emerald-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    {btnLoading === 'master-true' ? <RefreshCw size={14} className="animate-spin" /> : <Power size={14} />}
                    ON ALL
                  </button>
                  <button 
                    onClick={() => toggleAll(false)}
                    disabled={!!btnLoading || !!isRunningVariation}
                    className="flex-1 px-4 py-3 bg-red-600/10 hover:bg-red-600/20 text-red-400 text-[10px] font-bold uppercase tracking-widest rounded-xl border border-red-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    {btnLoading === 'master-false' ? <RefreshCw size={14} className="animate-spin" /> : <Power size={14} />}
                    OFF ALL
                  </button>
                </div>

                {/* Variations Row */}
                <div className="flex gap-3">
                  <button 
                    onClick={runVariation1}
                    disabled={!!isRunningVariation}
                    className={cn(
                      "flex-1 px-4 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl border transition-all flex items-center justify-center gap-2",
                      isRunningVariation === 'v1' 
                        ? "bg-indigo-600 text-white border-indigo-500 shadow-[0_0_15px_rgba(79,70,229,0.4)]" 
                        : "bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border-indigo-500/30"
                    )}
                  >
                    <Radio size={14} className={isRunningVariation === 'v1' ? "animate-pulse" : ""} />
                    VARIASI 1
                  </button>
                  <button 
                    onClick={runVariation2}
                    disabled={!!isRunningVariation}
                    className={cn(
                      "flex-1 px-4 py-3 text-[10px] font-bold uppercase tracking-widest rounded-xl border transition-all flex items-center justify-center gap-2",
                      isRunningVariation === 'v2' 
                        ? "bg-amber-600 text-white border-amber-500 shadow-[0_0_15px_rgba(217,119,6,0.4)]" 
                        : "bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border-amber-500/30"
                    )}
                  >
                    <Radio size={14} className={isRunningVariation === 'v2' ? "animate-pulse" : ""} />
                    VARIASI 2
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(relayStates || {}).map(([id, relay]: any, idx: number) => (
                <div key={id} className="bg-brand-bg border border-slate-700 p-5 rounded-xl flex items-center justify-between hover:border-slate-500 transition-colors">
                  <div>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-0.5">Ch-0{idx + 1}</p>
                    <h4 className="text-base font-medium text-white">{relay.name}</h4>
                  </div>
                  <button 
                    onClick={() => toggleRelay(id)}
                    disabled={btnLoading === id}
                    className={cn(
                      "w-14 h-8 rounded-full flex items-center px-1 transition-all duration-300 relative focus:outline-none",
                      relay.state ? "bg-emerald-500/10 border border-emerald-500/50" : "bg-slate-800 border border-slate-600"
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-full shadow-lg transition-transform duration-300",
                      relay.state ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] translate-x-6" : "bg-slate-600 translate-x-0"
                    )} />
                    {btnLoading === id && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <RefreshCw className="animate-spin text-white w-3 h-3" />
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Status & Logs (4/12) */}
        <div className="md:col-span-4 space-y-6">
          
          {/* Connectivity Status */}
          <div className="bg-brand-card border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Connectivity</h3>
            <div className="space-y-3">
              <StatusRow label="Telegram Bot" status={telegramConfigured ? 'READY' : 'OFFLINE'} type={telegramConfigured ? 'success' : 'danger'} />
              <StatusRow label="ESP32 Device" status={espStatus?.isOnline ? 'ONLINE' : 'OFFLINE'} type={espStatus?.isOnline ? 'success' : 'danger'} />
              <StatusRow label="Backend API" status={apiStatus || (error ? 'ERROR' : 'OFFLINE')} type={apiStatus === 'Online' ? 'success' : (error ? 'danger' : 'warning')} />
            </div>
            {(espStatus?.ip || espStatus?.publicIp) && (
              <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2">
                <div className="flex justify-between items-center text-[11px] font-mono">
                  <span className="text-slate-500">Public IP:</span>
                  <span className="text-indigo-400 font-semibold">{espStatus.publicIp || 'N/A'}</span>
                </div>
                {espStatus.ip && (
                  <div className="flex justify-between items-center text-[11px] font-mono">
                    <span className="text-slate-500">Local IP:</span>
                    <span className="text-emerald-400 font-semibold">{espStatus.ip}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Telegram Logs Area */}
          <div className="bg-brand-card border border-slate-800 rounded-2xl p-5 flex flex-col h-[380px]">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Activity Logs</h3>
            <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
              {history.length > 0 ? (
                history.slice(-8).reverse().map((entry, idx) => (
                  <div key={idx} className="flex space-x-3">
                    <div className={cn("w-1.5 h-1.5 rounded-full mt-2 shrink-0 shadow-sm", idx === 0 ? "bg-indigo-500 animate-pulse shadow-indigo-500/50" : "bg-slate-700")} />
                    <div className="min-w-0">
                      <p className="text-xs text-white leading-snug break-words">
                        Sensors: <span className="text-indigo-400 font-mono">{entry.temperature}°C</span> / <span className="text-cyan-400 font-mono border-b border-cyan-900">{entry.humidity}%</span>
                      </p>
                      <p className="text-[10px] text-slate-600 font-mono mt-0.5">{entry.time}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-2">
                  <RefreshCw className="animate-spin-slow opacity-20" size={32} />
                  <p className="italic text-[10px] tracking-widest uppercase">Waiting for telemetry...</p>
                </div>
              )}
            </div>
          </div>

          {/* Credentials Info Panel */}
          <div className="bg-indigo-600/5 border border-indigo-500/20 rounded-2xl p-4">
            <div className="flex items-center space-x-2 mb-2">
              <div className="w-4 h-4 text-indigo-400"><Send size={14} /></div>
              <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-tight">Telegram Endpoint</span>
            </div>
            <p className="text-[11px] font-mono text-slate-500 truncate mb-1">
              TOKEN: {process.env.BOT_TOKEN ? `6812${'•'.repeat(16)}${process.env.BOT_TOKEN.slice(-4)}` : 'NULL_TOKEN'}
            </p>
            <p className="text-[11px] font-mono text-slate-500">
              CHAT_ID: {process.env.CHAT_ID ? `${process.env.CHAT_ID.slice(0, 4)}${'•'.repeat(process.env.CHAT_ID.length - 4)}` : 'NULL_ID'}
            </p>
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="fixed bottom-0 left-0 right-0 h-10 bg-brand-bg border-t border-slate-800 px-8 flex items-center justify-between z-40">
        <p className="text-[10px] text-slate-600 tracking-tighter uppercase font-mono">DEPLOYED ON VERCEL &bull; NO EXTERNAL DATABASE &bull; REAL-TIME SYNC</p>
        <div className="flex space-x-6 items-center">
           <div className="flex items-center space-x-1.5">
            <span className={cn("w-1.5 h-1.5 rounded-full", telegramConfigured ? "bg-emerald-500" : "bg-red-500")} />
            <span className="text-[10px] text-slate-500 font-bold uppercase truncate">
              Notify: {telegramConfigured ? 'Active' : 'Standby'}
            </span>
          </div>
          <span className="text-[10px] text-slate-600 font-mono">NODE V1.2.4</span>
        </div>
      </footer>

      {/* Configuration Modal */}
      <AnimatePresence>
        {configOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfigOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-brand-card border border-slate-700 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-y-auto max-h-[90vh] custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                    <Settings size={20} />
                  </div> 
                  System Setup
                </h2>
                <button onClick={() => setConfigOpen(false)} className="text-slate-500 hover:text-white transition-colors bg-slate-800 p-1 rounded-full">
                  <XCircle size={22} />
                </button>
              </div>

              <form onSubmit={saveConfig} className="space-y-6">
                {/* Cloud & Telegram Setup */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Cloud Messaging & Alert</h3>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest pl-1">Telegram Bot Token</label>
                    <input 
                      type="password"
                      placeholder="6812903522:AAH..."
                      value={configForm.botToken}
                      onChange={(e) => setConfigForm({...configForm, botToken: e.target.value})}
                      className="w-full bg-brand-bg border border-slate-800 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-slate-700"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest pl-1">Primary Chat ID</label>
                    <input 
                      type="text"
                      placeholder="99426182..."
                      value={configForm.chatId}
                      onChange={(e) => setConfigForm({...configForm, chatId: e.target.value})}
                      className="w-full bg-brand-bg border border-slate-800 rounded-2xl px-5 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-slate-700"
                    />
                  </div>
                </div>

                {/* Direct LAN Mode Section */}
                <div className="pt-6 border-t border-slate-800/80 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Mode LAN Langsung (Low Delay)</h4>
                      <p className="text-[10px] text-slate-500">Kirim request relay langsung ke IP ESP32</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLocalLanToggle(!localLanToggle)}
                      className={cn(
                        "w-12 h-6 rounded-full flex items-center px-1 transition-all duration-300 relative focus:outline-none",
                        localLanToggle ? "bg-emerald-500/10 border border-emerald-500/50" : "bg-slate-800 border border-slate-600"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full shadow-lg transition-transform duration-300",
                        localLanToggle ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] translate-x-6" : "bg-slate-600 translate-x-0"
                      )} />
                    </button>
                  </div>

                  {localLanToggle && (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest pl-1">IP Address ESP32</label>
                        <input
                          type="text"
                          placeholder="10.236.137.114"
                          value={localIpInput}
                          onChange={(e) => setLocalIpInput(e.target.value)}
                          className="w-full bg-brand-bg border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest pl-1">Protocol / API Pattern</label>
                        <select
                          value={localPattern}
                          onChange={(e) => setLocalPattern(e.target.value)}
                          className="w-full bg-brand-bg border border-slate-800 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-400 transition-all font-sans"
                        >
                          <option value="json_post">API Endpoint (JSON POST) - http://{"{IP}"}/api/relay/toggle</option>
                          <option value="query_pin">Query GET Pin (HTTP GET) - http://{"{IP}"}/toggle?pin=X&state=Y</option>
                          <option value="query_relayId">Query GET ID (HTTP GET) - http://{"{IP}"}/toggle?relayId=relayX</option>
                        </select>
                      </div>

                      <div className="p-4 bg-amber-600/5 rounded-xl border border-amber-500/15 text-[10px] text-amber-400 font-mono leading-relaxed space-y-1">
                        <p className="font-bold flex items-center gap-1">⚠️ Perhatian Keamanan HTTPS / Mixed Content:</p>
                        <p>Dashboard berjalan di HTTPS, sedangkan ESP32 Anda menggunakan HTTP IP Lokal. Agar browser Anda tidak memblokir sinyal kontrol LAN:</p>
                        <ol className="list-decimal list-inside space-y-0.5 mt-1 text-slate-400">
                          <li>Klik ikon <strong className="text-amber-300">Gembok / Site Settings</strong> di bilah URL browser Anda.</li>
                          <li>Cari menu <strong className="text-amber-300">Insecure Content</strong> / Konten tidak aman.</li>
                          <li>Ubah dari "Block" menjadi <strong className="text-emerald-400">Allow (Izinkan)</strong>.</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-indigo-600/5 rounded-2xl border border-indigo-500/10">
                  <p className="text-[10px] text-slate-500 leading-relaxed font-mono">
                    <span className="text-indigo-400">INFO:</span> Status notifications including relay toggles and system heartbeats will be pushed to this endpoint immediately after saving.
                  </p>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-600/10 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Send size={18} /> SYNC CONFIGURATION
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className="fixed bottom-14 left-1/2 z-50 bg-red-900/90 backdrop-blur-md text-red-200 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-red-500/30"
          >
            <AlertCircle size={18} />
            <span className="text-xs font-semibold tracking-wide uppercase">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #334155; }
        .animate-spin-slow { animation: spin 4s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function StatusRow({ label, status, type }: { label: string, status: string, type: 'success' | 'danger' | 'warning' }) {
  const styles = {
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };

  return (
    <div className="flex items-center justify-between p-3.5 bg-brand-bg rounded-xl border border-slate-800/50 hover:border-slate-700 transition-colors group">
      <span className="text-xs font-medium text-slate-400 group-hover:text-slate-300 transition-colors">{label}</span>
      <span className={cn("px-2.5 py-0.5 text-[9px] font-bold border rounded uppercase tracking-widest tabular-nums", styles[type])}>
        {status}
      </span>
    </div>
  );
}

