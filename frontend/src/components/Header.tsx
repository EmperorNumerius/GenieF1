import React from 'react';
import { Zap, Calendar, Lock, Unlock } from 'lucide-react';
import type { RaceState } from '../hooks/useRaceData';

interface HeaderProps {
  raceState: RaceState | null;
  connected: boolean;
  isUnlocked: boolean;
  onUnlockClick: () => void;
}

export function Header({
  raceState,
  connected,
  isUnlocked,
  onUnlockClick,
}: HeaderProps) {
  const sessionName = raceState?.session_name || 'Waiting for Session';
  const sessionType = raceState?.session_type || 'N/A';

  return (
    <header className="flex items-center justify-between px-5 py-2.5 border-b border-white/10 bg-black/90 backdrop-blur-xl shrink-0 z-50">
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-red-600 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
          <span className="text-xl font-black tracking-wider text-white">
            Genie<span className="text-red-600">F1</span>
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[10px] bg-red-600/20 text-red-400 border border-red-600/30 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest">
            {sessionType}
          </span>
          <span className="text-sm font-semibold text-neutral-200">{sessionName}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded-full">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span
            className={`font-mono text-[10px] font-bold tracking-widest ${connected ? 'text-green-500' : 'text-red-500'}`}
          >
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        {!isUnlocked ? (
          <button
            onClick={onUnlockClick}
            className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 border border-red-400/50 shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all transform hover:scale-105 active:scale-95"
          >
            <Lock className="w-3 h-3" /> PREMIUM
          </button>
        ) : (
          <span className="text-[10px] text-green-400 flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-lg font-bold">
            <Unlock className="w-3 h-3" /> PRO
          </span>
        )}
      </div>
    </header>
  );
}