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
  AlertCircle
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

  const fetchData = async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        axios.get('/api/status'),
        axios.get('/api/history')
      ]);
      setData(statusRes.data);
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
  }, []);

  const toggleRelay = async (relayId: string) => {
    setBtnLoading(relayId);
    try {
      await axios.post('/api/relay/toggle', { relayId });
      await fetchData();
    } catch (err) {
      alert('Gagal mengubah status relay');
    } finally {
      setBtnLoading(null);
    }
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/config', configForm);
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
          <div className="flex items-center space-x-2">
            <span className={cn("w-2 h-2 rounded-full", espStatus?.isOnline ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500")} />
            <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
              {espStatus?.isOnline ? 'System Live' : 'System Offline'}
            </span>
          </div>
          <div className="hidden lg:block text-sm text-slate-500 font-mono">ID: ESP32_4A9B11</div>
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
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Temperature (DHT11)</p>
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
            <h3 className="text-sm font-semibold text-white mb-6 flex items-center">
              <span className="w-1.5 h-4 bg-indigo-500 rounded-full mr-2"></span>
              RELAY CONTROL INTERFACE
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(relayStates || {}).map(([id, relay]: any) => (
                <div key={id} className="bg-brand-bg border border-slate-700 p-5 rounded-xl flex items-center justify-between hover:border-slate-500 transition-colors">
                  <div>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mb-0.5">PIN {relay.pin.toString().padStart(2, '0')}</p>
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
              <StatusRow label="Backend API" status={apiStatus === 'Online' ? 'STABLE' : 'ERROR'} type={apiStatus === 'Online' ? 'success' : 'danger'} />
            </div>
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
              className="relative w-full max-w-md bg-brand-card border border-slate-700 rounded-3xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
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

              <form onSubmit={saveConfig} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest pl-1">Telegram Bot Token</label>
                  <input 
                    type="password"
                    placeholder="6812903522:AAH..."
                    value={configForm.botToken}
                    onChange={(e) => setConfigForm({...configForm, botToken: e.target.value})}
                    className="w-full bg-brand-bg border border-slate-800 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-slate-700"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest pl-1">Primary Chat ID</label>
                  <input 
                    type="text"
                    placeholder="99426182..."
                    value={configForm.chatId}
                    onChange={(e) => setConfigForm({...configForm, chatId: e.target.value})}
                    className="w-full bg-brand-bg border border-slate-800 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-all placeholder:text-slate-700"
                  />
                </div>

                <div className="p-5 bg-indigo-600/5 rounded-2xl border border-indigo-500/10 mt-8">
                  <p className="text-[10px] text-slate-500 leading-relaxed font-mono">
                    <span className="text-indigo-400">INFO:</span> Status notifications including relay toggles and system heartbeats will be pushed to this endpoint immediately after saving.
                  </p>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-600/10 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
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

