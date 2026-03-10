import React from 'react';
import { Gauge, Clock, Zap } from 'lucide-react';
import { getTeamColor, TIRE_COLORS, formatSectorTime } from '../lib/constants';

interface TelemetryDashboardProps {
  selected: any;
  isUnlocked: boolean;
  insight: string | null;
}

export function TelemetryDashboard({ selected, isUnlocked, insight }: TelemetryDashboardProps) {
  if (!selected) {
    return (
      <div className="w-[300px] flex flex-col bg-black/60 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden relative">
        <div className="flex-1 flex items-center justify-center text-neutral-600 font-mono text-xs p-6 text-center">
          Select a driver to view telemetry
        </div>
      </div>
    );
  }

  const teamColor = getTeamColor(selected);

  return (
    <div className="w-[300px] flex flex-col bg-black/60 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden relative">
      <div className="p-4 border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent flex items-center gap-3 relative z-10">
        <div className="w-14 h-14 rounded-lg flex items-center justify-center text-lg font-black font-mono border border-white/20 relative overflow-hidden shrink-0">
          <img
            src={`https://ui-avatars.com/api/?name=${selected.id}&background=${teamColor.replace(
              '#',
              ''
            )}&color=fff&bold=true&size=128`}
            className="w-full h-full object-cover"
            alt="Driver"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold tracking-tight text-white uppercase">{selected.name}</h2>
          <div className="flex flex-col gap-1 items-start mt-1">
            <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider bg-white/10 px-1.5 py-0.5 rounded border border-white/10 flex items-center gap-1">
              <img
                src={`https://ui-avatars.com/api/?name=${selected.team}&background=111&color=fff&size=24`}
                className="w-3 h-3 rounded-full"
                alt="Team"
              />
              {selected.team}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-center">
          <div className="text-3xl font-black italic opacity-50" style={{ color: teamColor }}>
            {selected.number}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 flex flex-col gap-3 relative z-10">
        {/* Speed & RPM Gauges */}
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-gradient-to-b from-white/10 to-transparent border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
            <div className="absolute inset-0 bg-blue-500/10 blur-xl" />
            <p className="text-[9px] text-blue-400 font-black uppercase tracking-[0.3em] mb-2 drop-shadow-md z-10">
              <Gauge className="w-3 h-3 inline mr-1" />Speed
            </p>
            <div className="relative z-10 flex flex-col items-center">
              <p className="text-4xl font-mono font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] leading-none">
                {selected.speed || 0}
              </p>
              <p className="text-[10px] font-mono font-bold text-blue-400/80 mt-1 uppercase">km/h</p>
            </div>
            <div
              className="absolute bottom-0 left-0 h-1 bg-red-500 rounded-r-full transition-all duration-300"
              style={{
                width: `${Math.min(100, ((selected.rpm || 0) / 15000) * 100)}%`,
                boxShadow: '0 -2px 10px rgba(239,68,68,0.8)',
              }}
            />
          </div>

          <div className="bg-gradient-to-b from-white/10 to-transparent border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center relative shadow-inner">
            <div className="absolute inset-0 bg-red-500/10 blur-xl" />
            <p className="text-[9px] text-neutral-400 font-black uppercase tracking-[0.3em] mb-2 z-10">Gear</p>
            <div className="relative z-10 flex items-end gap-2 text-white">
              <span className="text-4xl font-black font-mono leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
                {selected.gear || 'N'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2 z-10 w-full justify-between">
              <p className="text-[9px] font-mono font-bold text-neutral-500 uppercase">RPM</p>
              <p className="text-[11px] font-mono font-bold text-white">{selected.rpm || 0}</p>
            </div>
          </div>
        </div>

        {/* Throttle & Brake */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500 w-16">Throttle</span>
            <div className="flex-1 h-3 bg-neutral-900 rounded-full border border-white/10 overflow-hidden relative shadow-inner">
              <div
                className="absolute top-0 left-0 h-full bg-green-500 rounded-full transition-all duration-100 ease-out shadow-[0_0_10px_#22c55e]"
                style={{ width: `${selected.throttle || 0}%` }}
              />
            </div>
            <span className="text-[10px] font-mono font-bold w-8 text-right text-green-400">
              {selected.throttle || 0}%
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500 w-16">Brake</span>
            <div className="flex-1 h-3 bg-neutral-900 rounded-full border border-white/10 overflow-hidden relative shadow-inner">
              <div
                className="absolute top-0 left-0 h-full bg-red-500 rounded-full transition-all duration-100 ease-out shadow-[0_0_10px_#ef4444]"
                style={{ width: `${selected.brake || 0}%` }}
              />
            </div>
            <span className="text-[10px] font-mono font-bold w-8 text-right text-red-400">
              {selected.brake || 0}%
            </span>
          </div>
        </div>

        {/* Sector Times */}
        <div className="bg-gradient-to-br from-white/10 to-transparent border border-white/10 rounded-xl p-4 shadow-xl">
          <div className="flex justify-between items-center mb-3">
            <p className="text-[10px] text-white font-black uppercase tracking-[0.3em] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-purple-500" /> Sector Times
            </p>
            <span className="font-mono text-[9px] bg-purple-500/20 px-2 py-0.5 rounded text-purple-300 font-bold border border-purple-500/30">
              LAP {selected.lap_number || '-'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              {
                label: 'S1',
                val: selected.sector_1,
                color: 'text-purple-400 bg-purple-500/10 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.2)]',
              },
              {
                label: 'S2',
                val: selected.sector_2,
                color: 'text-green-400 bg-green-500/10 border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.2)]',
              },
              {
                label: 'S3',
                val: selected.sector_3,
                color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30 shadow-[0_0_15px_rgba(234,179,8,0.2)]',
              },
            ].map((s) => (
              <div
                key={s.label}
                className={`border rounded-lg py-2.5 flex flex-col justify-center items-center ${
                  s.val ? s.color : 'bg-black/40 border-white/5 text-neutral-600'
                }`}
              >
                <p className="text-[8px] font-black uppercase tracking-[0.2em] mb-1 opacity-70">{s.label}</p>
                <p className="font-mono text-[11px] font-bold">{formatSectorTime(s.val)}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 bg-black/50 rounded-lg p-2 border border-white/5 flex justify-between items-center px-4">
            <p className="text-[10px] text-neutral-400 font-black tracking-widest">LAST LAP</p>
            <p className="font-mono text-base font-black text-white drop-shadow-md">
              {typeof selected.last_lap_time === 'number'
                ? selected.last_lap_time.toFixed(3)
                : selected.last_lap_time || '---'}
            </p>
          </div>
        </div>

        {/* Tires & DRS */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-inner relative overflow-hidden flex flex-col justify-center">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/10 to-transparent blur-2xl transform rotate-45" />
            <div className="flex justify-between items-start mb-2 z-10">
              <div className="flex flex-col gap-1">
                <p className="text-[8px] text-neutral-400 font-black uppercase tracking-[0.2em]">Tyre</p>
                <span className="font-black text-white tracking-widest">{selected.tire || '??'}</span>
              </div>
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center font-black text-[9px] shadow-[0_0_10px_rgba(0,0,0,0.5)] border-2 border-black"
                style={{
                  background: TIRE_COLORS[selected.tire?.toUpperCase()] || '#666',
                  color: ['HARD', 'WET', 'Unknown'].includes(selected.tire?.toUpperCase() || '') ? '#000' : '#fff',
                }}
              >
                {selected.tire?.charAt(0) || '?'}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono font-bold mt-1 z-10">
              <span className="text-neutral-400">AGE</span>
              <span className="text-white bg-white/10 px-1.5 py-0.5 rounded">{selected.tire_age || 0} Laps</span>
            </div>
          </div>

          <div
            className={`rounded-xl p-3 flex flex-col justify-center items-center relative overflow-hidden transition-all duration-500 shadow-inner group ${
              selected.drs > 10
                ? 'bg-green-500/20 border border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)]'
                : 'bg-white/5 border border-white/10'
            }`}
          >
            {selected.drs > 10 && (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.4)_0%,transparent_100%)] animate-pulse" />
            )}
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-400 mb-1 z-10 group-hover:text-white transition-colors">
              DRS Status
            </p>
            <p
              className={`font-mono text-xl font-black tracking-widest z-10 ${
                selected.drs > 10 ? 'text-green-400 drop-shadow-[0_0_15px_#22c55e]' : 'text-neutral-600'
              }`}
            >
              {selected.drs > 10 ? 'ACTIVE' : 'CLOSED'}
            </p>
          </div>
        </div>

        {/* AI Insight */}
        {isUnlocked && insight && (
          <div className="bg-red-600/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-[9px] text-red-400 font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Analysis
            </p>
            <p className="text-[11px] text-neutral-300 italic font-serif leading-relaxed">{insight}</p>
          </div>
        )}
      </div>
    </div>
  );
}
