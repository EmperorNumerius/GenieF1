import React from 'react';
import { Zap, Calendar, Thermometer, Cloud, Lock, Unlock } from 'lucide-react';

interface HeaderProps {
  raceState: any;
  nextSession: any;
  showCalendar: boolean;
  setShowCalendar: (show: boolean) => void;
  connected: boolean;
  isUnlocked: boolean;
  handleDevUnlock: () => void;
}

export function Header({
  raceState,
  nextSession,
  showCalendar,
  setShowCalendar,
  connected,
  isUnlocked,
  handleDevUnlock,
}: HeaderProps) {
  const sess = raceState?.session;
  const weather = raceState?.weather;
  const isHistorical = raceState?.historical;

  return (
    <header className="flex items-center justify-between px-5 py-2.5 border-b border-white/10 bg-black/90 backdrop-blur-xl shrink-0 z-50">
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-red-600 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
          <span className="text-xl font-black tracking-wider">
            Genie<span className="text-red-600">F1</span>
          </span>
        </div>
        {sess && (
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] bg-red-600/20 text-red-400 border border-red-600/30 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest">
              {sess.year} • {sess.type || 'Race'}
            </span>
            <span className="text-sm font-semibold text-neutral-200">{sess.meeting_name}</span>
            {sess.circuit && <span className="text-xs font-mono text-neutral-500">— {sess.circuit}</span>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {nextSession && (
          <div className="flex items-center gap-1.5 text-[10px] bg-blue-600/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full font-bold uppercase">
            NEXT: {nextSession.meeting_name} ({new Date(nextSession.date_start).toLocaleDateString()})
          </div>
        )}
        {weather && (
          <div className="flex items-center gap-3 text-[11px] font-mono text-neutral-400 bg-white/5 px-3 py-1 rounded-full border border-white/5">
            {weather.air_temp != null && (
              <span className="flex items-center gap-1">
                <Thermometer className="w-3 h-3 text-blue-400" />
                {weather.air_temp}°C
              </span>
            )}
            {weather.track_temp != null && <span className="text-orange-400">TRK {weather.track_temp}°C</span>}
            {weather.rainfall != null && weather.rainfall > 0 && (
              <span className="flex items-center gap-1 text-blue-500">
                <Cloud className="w-3 h-3" />
                Rain
              </span>
            )}
          </div>
        )}

        <button
          onClick={() => setShowCalendar(!showCalendar)}
          className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded-lg transition-all"
        >
          <Calendar className="w-3 h-3" /> CALENDAR
        </button>

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
            onClick={handleDevUnlock}
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
