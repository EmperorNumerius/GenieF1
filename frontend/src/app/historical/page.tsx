'use client';

import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../lib/api';
import { Zap, ArrowLeft, BarChart2 } from 'lucide-react';
import Link from 'next/link';

interface Session {
  id: string;
  name: string;
  date: string;
}

interface Lap {
  lap: number;
  time: number;
  compound: string;
}

export default function HistoricalPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [laps, setLaps] = useState<Lap[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchApi<{ sessions: Session[] }>('/api/historical/sessions?year=2026&round=1')
      .then(res => {
        setSessions(res.sessions);
        if (res.sessions.length > 0) {
          setSelectedSession(res.sessions[0].id);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedSession) return;

    let isMounted = true;

    // Defer state update slightly to avoid strict mode warnings if any
    setTimeout(() => {
      if (isMounted) setLoading(true);
      fetchApi<{ laps: Lap[] }>(`/api/historical/laps?year=2026&round=1&session=${selectedSession}&driver=1`)
        .then(res => {
          if (isMounted) setLaps(res.laps);
        })
        .catch(console.error)
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    }, 0);

    return () => { isMounted = false; };
  }, [selectedSession]);

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0a0a] text-white font-sans p-6 overflow-hidden">
      <header className="flex items-center gap-4 mb-8 shrink-0">
        <Link href="/" className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition">
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-red-600 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
          <span className="text-2xl font-black tracking-wider">
            Genie<span className="text-red-600">F1</span>
          </span>
          <span className="ml-4 text-neutral-500 font-bold uppercase tracking-widest text-sm">Historical Data</span>
        </div>
      </header>

      <div className="flex gap-8 flex-1 overflow-hidden">
        {/* Controls */}
        <div className="w-64 flex flex-col gap-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">Select Session</h3>
            <div className="flex flex-col gap-2">
              {sessions.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSession(s.id)}
                  className={`text-left px-3 py-2 rounded text-sm font-bold transition ${selectedSession === s.id ? 'bg-red-600 text-white' : 'bg-white/5 text-neutral-300 hover:bg-white/10'}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <Link href="/championship" className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 flex items-center justify-between text-neutral-300 hover:text-white transition group">
            <span className="text-sm font-bold uppercase tracking-widest">Championship</span>
            <BarChart2 className="w-5 h-5 text-neutral-500 group-hover:text-red-500 transition" />
          </Link>
        </div>

        {/* Chart Area */}
        <div className="flex-1 bg-neutral-900 border border-white/10 rounded-xl p-6 flex flex-col">
          <h2 className="text-lg font-bold text-white mb-6 uppercase tracking-widest flex items-center gap-2">
            Lap Time Analysis <span className="text-xs font-mono text-neutral-500 bg-black px-2 py-1 rounded">Driver: 1 (Mock)</span>
          </h2>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-neutral-500 font-mono text-xs animate-pulse">Loading FastF1 data...</div>
          ) : (
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
              {laps.map(lap => (
                <div key={lap.lap} className="flex items-center gap-4 bg-black/40 border border-white/5 rounded-lg p-2">
                  <span className="font-mono text-xs font-bold text-neutral-500 w-8">L{lap.lap}</span>
                  <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center bg-white/5">
                    <div className={`w-3 h-3 rounded-full ${lap.compound.includes('SOFT') ? 'bg-red-500' : 'bg-yellow-400'}`} />
                  </div>
                  <div className="flex-1 bg-white/5 h-4 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${Math.max(10, 100 - (lap.time - 90) * 10)}%` }}
                    />
                  </div>
                  <span className="font-mono text-sm font-bold text-white w-20 text-right">{lap.time.toFixed(3)}s</span>
                </div>
              ))}
              {laps.length === 0 && <div className="text-neutral-500 text-sm text-center mt-10">No laps recorded for this session.</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}