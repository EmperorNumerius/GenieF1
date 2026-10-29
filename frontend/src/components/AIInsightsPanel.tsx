'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, MessageSquare, AlertTriangle, TrendingUp, Loader2, Send, Sparkles } from 'lucide-react';
import { apiUrl } from '../lib/api';

interface Anomaly {
  driver_id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  detected_at: string;
}

interface MonteCarloPrediction {
  id: string;
  name: string;
  win_probability: number;
  podium_probability: number;
  expected_position: number;
  p10: number;
  p90: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

const SEVERITY_COLOR: Record<string, string> = {
  low: 'border-yellow-500/30 bg-yellow-500/5 text-yellow-300',
  medium: 'border-orange-500/40 bg-orange-500/5 text-orange-300',
  high: 'border-red-500/50 bg-red-500/10 text-red-300',
};

const SEVERITY_LABEL: Record<string, string> = {
  low: 'LOW',
  medium: 'MED',
  high: 'HIGH',
};

interface Props {
  selectedDriver: number | null;
  raceState: any;
}

export function AIInsightsPanel({ selectedDriver, raceState }: Props) {
  const [tab, setTab] = useState<'engineer' | 'predict' | 'anomaly'>('engineer');
  const [chat, setChat] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Standing by. Ask me about strategy, pace, the gap to ahead, or anything race-related.',
      ts: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const [predictions, setPredictions] = useState<MonteCarloPrediction[]>([]);
  const [predictLoading, setPredictLoading] = useState(false);

  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

  const cars: any[] = raceState?.cars || [];
  const selectedCar = cars.find((c) => c.number === selectedDriver) || null;

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  // Poll Monte Carlo when on predict tab
  useEffect(() => {
    if (tab !== 'predict') return;
    let cancelled = false;
    const fetchPredictions = async () => {
      setPredictLoading(true);
      try {
        const res = await fetch(apiUrl('/api/monte_carlo?simulations=500'));
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (!cancelled) setPredictions(data.predictions || []);
      } catch {
        if (!cancelled) setPredictions([]);
      } finally {
        if (!cancelled) setPredictLoading(false);
      }
    };
    fetchPredictions();
    const id = setInterval(fetchPredictions, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [tab]);

  // Poll anomalies (always running quietly so the badge updates)
  useEffect(() => {
    let cancelled = false;
    const fetchAnomalies = async () => {
      try {
        const res = await fetch(apiUrl('/api/anomalies'));
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAnomalies(Array.isArray(data) ? data : data.anomalies || []);
      } catch {
        // silent
      }
    };
    fetchAnomalies();
    const id = setInterval(fetchAnomalies, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const sendMessage = useCallback(async () => {
    const q = input.trim();
    if (!q || chatLoading) return;
    setChat((c) => [...c, { role: 'user', content: q, ts: Date.now() }]);
    setInput('');
    setChatLoading(true);
    try {
      const res = await fetch(apiUrl('/api/race_engineer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          driver_id: selectedCar?.id || null,
        }),
      });
      const data = await res.json();
      const reply = data.response || data.message || 'No response.';
      setChat((c) => [...c, { role: 'assistant', content: reply, ts: Date.now() }]);
    } catch {
      setChat((c) => [
        ...c,
        { role: 'assistant', content: 'Radio out. Try again in a moment.', ts: Date.now() },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [input, chatLoading, selectedCar]);

  const presetQuestions = [
    'Who is the fastest right now?',
    'Should we pit?',
    'What is the gap to ahead?',
  ];

  return (
    <div className="flex flex-col bg-black/60 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/10 bg-gradient-to-r from-purple-500/10 via-transparent to-transparent flex items-center gap-2">
        <Brain className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-200">
          AI RACE BRAIN
        </span>
        {anomalies.length > 0 && (
          <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">
            {anomalies.length} ALERT{anomalies.length === 1 ? '' : 'S'}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 text-[10px] font-bold uppercase tracking-wider">
        <TabButton
          active={tab === 'engineer'}
          onClick={() => setTab('engineer')}
          icon={<MessageSquare className="w-3 h-3" />}
          label="Engineer"
        />
        <TabButton
          active={tab === 'predict'}
          onClick={() => setTab('predict')}
          icon={<TrendingUp className="w-3 h-3" />}
          label="Predict"
        />
        <TabButton
          active={tab === 'anomaly'}
          onClick={() => setTab('anomaly')}
          icon={<AlertTriangle className="w-3 h-3" />}
          label="Alerts"
          badge={anomalies.length || undefined}
        />
      </div>

      <div className="flex-1 min-h-[260px] max-h-[360px] overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {tab === 'engineer' && (
            <motion.div
              key="engineer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-xs">
                {chat.map((m, i) => (
                  <div
                    key={i}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-2.5 py-1.5 leading-snug ${
                        m.role === 'user'
                          ? 'bg-purple-500/20 border border-purple-500/40 text-purple-100'
                          : 'bg-white/5 border border-white/10 text-neutral-200'
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                      <span className="text-[10px] text-neutral-400">Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Preset quick-asks */}
              {chat.length <= 1 && (
                <div className="px-3 pb-1.5 flex flex-wrap gap-1">
                  {presetQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => setInput(q)}
                      className="text-[9px] uppercase tracking-wide font-bold px-1.5 py-1 rounded border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:border-white/20 transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage();
                }}
                className="p-2 border-t border-white/10 bg-black/30 flex gap-1.5"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    selectedCar
                      ? `Ask about ${selectedCar.id}...`
                      : 'Ask the engineer...'
                  }
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-purple-500/50"
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  disabled={chatLoading || !input.trim()}
                  className="px-2 rounded bg-purple-500/20 border border-purple-500/40 text-purple-200 hover:bg-purple-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center"
                  aria-label="Send"
                >
                  <Send className="w-3 h-3" />
                </button>
              </form>
            </motion.div>
          )}

          {tab === 'predict' && (
            <motion.div
              key="predict"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-2 space-y-1"
            >
              <div className="flex items-center justify-between px-1 py-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  Monte Carlo · 500 sims
                </span>
                {predictLoading && (
                  <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                )}
              </div>
              {predictions.length === 0 && !predictLoading && (
                <p className="text-[10px] text-neutral-500 px-2 py-3 text-center">
                  No predictions available yet.
                </p>
              )}
              {predictions.slice(0, 12).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 text-[10px] px-1.5 py-1 rounded hover:bg-white/5"
                >
                  <span className="font-mono font-bold w-8 text-neutral-300">{p.id}</span>
                  <div className="flex-1 h-2 rounded overflow-hidden bg-white/5 relative">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-500 to-pink-500"
                      style={{ width: `${Math.min(100, p.win_probability * 100)}%` }}
                    />
                  </div>
                  <span className="font-mono w-12 text-right text-neutral-200">
                    {(p.win_probability * 100).toFixed(1)}%
                  </span>
                  <span className="font-mono w-10 text-right text-neutral-500">
                    P{Math.round(p.expected_position || 0)}
                  </span>
                </div>
              ))}
              {predictions.length > 0 && (
                <p className="text-[8px] uppercase tracking-wider text-neutral-600 text-center pt-1">
                  Win % | Expected finish
                </p>
              )}
            </motion.div>
          )}

          {tab === 'anomaly' && (
            <motion.div
              key="anomaly"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-y-auto p-2 space-y-1.5"
            >
              {anomalies.length === 0 && (
                <p className="text-[10px] text-neutral-500 px-2 py-6 text-center">
                  All systems nominal. No anomalies detected.
                </p>
              )}
              {anomalies.map((a, i) => (
                <div
                  key={`${a.driver_id}-${a.type}-${i}`}
                  className={`text-[10px] rounded border px-2 py-1.5 ${SEVERITY_COLOR[a.severity] || SEVERITY_COLOR.low}`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono font-bold tracking-wider">
                      {a.driver_id} · {a.type.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span className="text-[9px] font-black opacity-80">
                      {SEVERITY_LABEL[a.severity] || a.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="leading-snug opacity-90">{a.message}</p>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1 py-1.5 transition ${
        active
          ? 'bg-white/5 text-purple-200 border-b-2 border-purple-400'
          : 'text-neutral-500 hover:text-neutral-200 border-b-2 border-transparent'
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-[9px] font-bold px-1 rounded bg-red-500/30 text-red-200">
          {badge}
        </span>
      )}
    </button>
  );
}
