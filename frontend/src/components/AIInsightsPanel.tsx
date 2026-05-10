import React, { useState, useEffect, useRef } from 'react';
import { Brain, MessageSquare, TrendingUp, AlertTriangle, Send, Sparkles, Loader2, Lock } from 'lucide-react';
import { fetchApi } from '../lib/api';
import type { RaceState, CarState } from '../hooks/useRaceData';
import { motion, AnimatePresence } from 'framer-motion';

interface AIInsightsPanelProps {
  raceState: RaceState | null;
  selectedCar: CarState | null;
  isUnlocked: boolean;
  onUnlockClick: () => void;
  sessionId: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function AIInsightsPanel({ raceState, selectedCar, isUnlocked, onUnlockClick, sessionId }: AIInsightsPanelProps) {
  const [tab, setTab] = useState<'engineer' | 'predict' | 'anomaly'>('engineer');
  const [input, setInput] = useState('');
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat, loading]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !sessionId || !isUnlocked) return;

    const userMessage = input.trim();
    setInput('');
    setChat((prev) => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      // Create query params: question and driver_id if selected
      const queryParams = new URLSearchParams({
        question: userMessage,
        ...(selectedCar && { driver_id: selectedCar.id }),
      });

      const response = await fetchApi<{ response: string }>(`/api/insights?${queryParams.toString()}`, {
        headers: { 'session-id': sessionId }
      });

      setChat((prev) => [...prev, { role: 'assistant', content: response.response }]);
    } catch (err) {
      setChat((prev) => [...prev, { role: 'assistant', content: 'Radio failure. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isUnlocked) {
    return (
      <div className="flex flex-col bg-black/60 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden h-64 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/90 z-10 flex flex-col items-center justify-center p-6 text-center">
          <Lock className="w-8 h-8 text-neutral-500 mb-3" />
          <h3 className="text-white font-bold tracking-widest uppercase mb-2">Pro Feature Locked</h3>
          <p className="text-neutral-400 text-xs mb-4">Unlock the AI Race Engineer and advanced simulations to gain an unfair advantage.</p>
          <button
            onClick={onUnlockClick}
            className="bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-lg transition-all"
          >
            Unlock Session
          </button>
        </div>
        <div className="px-3 py-2 border-b border-white/10 flex items-center gap-2 opacity-30">
          <Brain className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-200">
            AI RACE BRAIN
          </span>
        </div>
        <div className="flex-1 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')]"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-black/60 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden h-72">
      <div className="px-3 py-2 border-b border-white/10 bg-gradient-to-r from-purple-500/10 via-transparent to-transparent flex items-center gap-2">
        <Brain className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-200">
          AI RACE BRAIN
        </span>
      </div>

      <div className="flex border-b border-white/10 text-[10px] font-bold uppercase tracking-wider shrink-0">
        <button
          onClick={() => setTab('engineer')}
          className={`flex-1 py-1.5 border-b-2 transition-colors ${tab === 'engineer' ? 'border-purple-400 text-purple-200' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
        >
          <div className="flex items-center justify-center gap-1.5"><MessageSquare className="w-3 h-3"/> Engineer</div>
        </button>
        <button
          onClick={() => setTab('predict')}
          className={`flex-1 py-1.5 border-b-2 transition-colors ${tab === 'predict' ? 'border-purple-400 text-purple-200' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
        >
          <div className="flex items-center justify-center gap-1.5"><TrendingUp className="w-3 h-3"/> Predict</div>
        </button>
        <button
          onClick={() => setTab('anomaly')}
          className={`flex-1 py-1.5 border-b-2 transition-colors ${tab === 'anomaly' ? 'border-purple-400 text-purple-200' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
        >
          <div className="flex items-center justify-center gap-1.5"><AlertTriangle className="w-3 h-3"/> Alerts</div>
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative">
        <AnimatePresence mode="wait">
          {tab === 'engineer' && (
             <motion.div key="engineer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col h-full absolute inset-0">
                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                  {chat.length === 0 && (
                    <div className="text-center text-xs text-neutral-500 mt-4">
                      Radio active. Awaiting your command.
                    </div>
                  )}
                  {chat.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${m.role === 'user' ? 'bg-purple-500/20 border border-purple-500/40 text-purple-100' : 'bg-white/5 border border-white/10 text-neutral-200'}`}>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                        <span className="text-[10px] text-neutral-400">Consulting data...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSend} className="p-2 border-t border-white/10 bg-black/40 flex gap-1.5 shrink-0">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={selectedCar ? `Ask about ${selectedCar.name}...` : "Radio the engineer..."}
                    className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
                  />
                  <button type="submit" disabled={loading || !input.trim()} className="bg-purple-500/20 border border-purple-500/40 text-purple-300 px-3 rounded flex items-center justify-center hover:bg-purple-500/30 disabled:opacity-50 transition-colors">
                    <Send className="w-3 h-3" />
                  </button>
                </form>
             </motion.div>
          )}

          {tab === 'predict' && (
             <motion.div key="predict" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto p-3 h-full absolute inset-0 custom-scrollbar text-center text-neutral-500 text-xs flex flex-col items-center justify-center">
                 <Sparkles className="w-6 h-6 text-purple-400 mb-2 opacity-50" />
                 <p>Monte Carlo predictions are integrated <br/> into the dashboard view directly.</p>
             </motion.div>
          )}

          {tab === 'anomaly' && (
            <motion.div key="anomaly" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 overflow-y-auto p-3 h-full absolute inset-0 custom-scrollbar text-center text-neutral-500 text-xs flex flex-col items-center justify-center">
               <AlertTriangle className="w-6 h-6 text-yellow-500 mb-2 opacity-50" />
               <p>Real-time anomaly detection <br/> actively monitoring telemetry.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}