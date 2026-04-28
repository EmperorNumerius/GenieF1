'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Gauge, Clock, Zap, TrendingUp } from 'lucide-react';
import { getTeamColor, TIRE_COLORS, formatSectorTime } from '../lib/constants';

interface TelemetryDashboardProps {
  selected: any;
  isUnlocked: boolean;
  insight: string | null;
}

interface SpeedTrace {
  values: number[];
}

function SpeedTraceMini({ trace, color }: { trace: SpeedTrace; color: string }) {
  const W = 260;
  const H = 36;
  const PAD = 4;
  const vals = trace.values;

  if (vals.length < 2) {
    return <div className="w-full h-9 flex items-center justify-center text-[9px] text-neutral-600 font-mono">Collecting…</div>;
  }

  const min = Math.min(...vals);
  const max = Math.max(...vals, min + 1);
  const range = max - min;

  const points = vals
    .map((v, i) => {
      const x = PAD + (i / (vals.length - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const lastVal = vals[vals.length - 1];
  const lastX = W - PAD;
  const lastY = H - PAD - ((lastVal - min) / range) * (H - PAD * 2);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: W }}>
      <defs>
        <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline points={`${PAD},${H} ${points} ${W - PAD},${H}`} fill="url(#speedGrad)" stroke="none" />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <circle cx={lastX} cy={lastY} r={2.5} fill={color} />
    </svg>
  );
}

function PosSparkling({ positions }: { positions: number[] }) {
  const W = 60;
  const H = 20;

  if (positions.length < 2) return <span className="text-neutral-600 text-[9px] font-mono">—</span>;

  const maxP = Math.max(...positions, 20);
  const minP = Math.min(...positions, 1);
  const range = maxP - minP || 1;

  const points = positions
    .map((p, i) => {
      const x = (i / (positions.length - 1)) * W;
      const y = H - ((maxP - p) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const improved = positions[positions.length - 1] < positions[0];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      <polyline
        points={points}
        fill="none"
        stroke={improved ? '#22c55e' : '#ef4444'}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DrsPill({ drs }: { drs: number | undefined | null }) {
  const active = drs != null && (drs === 8 || drs === 10 || drs === 12 || drs === 14);
  const available = drs != null && drs === 6;

  if (!active && !available) {
    return (
      <span className="text-[8px] px-1.5 py-[1px] rounded bg-neutral-800 text-neutral-600 font-black tracking-wider border border-neutral-700">
        DRS
      </span>
    );
  }

  if (available) {
    return (
      <span className="text-[8px] px-1.5 py-[1px] rounded bg-orange-500/20 text-orange-300 font-black tracking-wider border border-orange-500/40">
        DRS
      </span>
    );
  }

  return (
    <span className="relative inline-flex text-[8px] px-1.5 py-[1px] rounded bg-green-500 text-black font-black tracking-wider border border-green-400 shadow-[0_0_8px_rgba(34,197,94,0.7)] overflow-hidden">
      <span className="absolute inset-0 bg-green-300 animate-ping opacity-40 rounded" />
      <span className="relative">DRS</span>
    </span>
  );
}

function PitWindow({ tireAge, lapNumber }: { tireAge: number; lapNumber: number }) {
  const windowOpenAge = 15;
  const windowCloseAge = 30;
  const inWindow = tireAge >= windowOpenAge && tireAge <= windowCloseAge;
  const windowStartLap = lapNumber - tireAge + windowOpenAge;
  const windowEndLap = lapNumber - tireAge + windowCloseAge;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500">Pit Window</span>
        <span className={`text-[9px] font-mono font-bold ${inWindow ? 'text-orange-400' : tireAge > windowCloseAge ? 'text-red-400' : 'text-neutral-500'}`}>
          {inWindow ? `Laps ${windowStartLap}–${windowEndLap}` : tireAge > windowCloseAge ? 'OVERDUE' : `Opens ~L${windowStartLap}`}
        </span>
      </div>
      <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden border border-white/5">
        <div
          className={`h-full rounded-full transition-all duration-700 ${inWindow ? 'bg-orange-500' : tireAge > windowCloseAge ? 'bg-red-600' : 'bg-neutral-600'}`}
          style={{ width: `${Math.min(100, (tireAge / windowCloseAge) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function TelemetryDashboard({ selected, isUnlocked, insight }: TelemetryDashboardProps) {
  const speedHistoryRef = useRef<number[]>([]);
  const [speedTrace, setSpeedTrace] = useState<SpeedTrace>({ values: [] });
  const sessionBestRef = useRef<Map<number, number>>(new Map());
  const posHistoryRef = useRef<Map<number, number[]>>(new Map());
  const [posHistory, setPosHistory] = useState<number[]>([]);

  useEffect(() => {
    if (!selected) return;
    if (selected.speed != null) {
      const next = [...speedHistoryRef.current, selected.speed].slice(-30);
      speedHistoryRef.current = next;
      setSpeedTrace({ values: next });
    }
    if (typeof selected.last_lap_time === 'number' && selected.last_lap_time > 0) {
      const prev = sessionBestRef.current.get(selected.number);
      if (prev === undefined || selected.last_lap_time < prev) {
        sessionBestRef.current.set(selected.number, selected.last_lap_time);
      }
    }
    if (selected.pos != null) {
      const hist = posHistoryRef.current.get(selected.number) ?? [];
      const next = [...hist, selected.pos].slice(-30);
      posHistoryRef.current.set(selected.number, next);
      setPosHistory([...next]);
    }
  }, [selected]);

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
  const sessionBest = sessionBestRef.current.get(selected.number) ?? null;
  const lastLap = typeof selected.last_lap_time === 'number' ? selected.last_lap_time : null;
  const lapDelta = lastLap != null && sessionBest != null ? lastLap - sessionBest : null;
  const drsActive = selected.drs === 8 || selected.drs === 10 || selected.drs === 12 || selected.drs === 14;

  return (
    <div className="w-[300px] flex flex-col bg-black/60 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden relative">
      <div className="p-4 border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent flex items-center gap-3 relative z-10">
        <div className="w-14 h-14 rounded-lg flex items-center justify-center text-lg font-black font-mono border border-white/20 relative overflow-hidden shrink-0">
          <img
            src={`https://ui-avatars.com/api/?name=${selected.id}&background=${teamColor.replace('#', '')}&color=fff&bold=true&size=128`}
            className="w-full h-full object-cover"
            alt={`Driver ${selected.name || selected.id}`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold tracking-tight text-white uppercase">{selected.name}</h2>
            <DrsPill drs={selected.drs} />
          </div>
          <div className="flex flex-col gap-1 items-start mt-1">
            <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider bg-white/10 px-1.5 py-0.5 rounded border border-white/10 flex items-center gap-1">
              <img src={`https://ui-avatars.com/api/?name=${selected.team}&background=111&color=fff&size=24`} className="w-3 h-3 rounded-full" alt={`Team ${selected.team}`} />
              {selected.team}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-center">
          <div className="text-3xl font-black italic opacity-50" style={{ color: teamColor }}>{selected.number}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide p-4 flex flex-col gap-3 relative z-10">
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="bg-gradient-to-b from-white/10 to-transparent border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
            <div className="absolute inset-0 bg-blue-500/10 blur-xl" />
            <p className="text-[9px] text-blue-400 font-black uppercase tracking-[0.3em] mb-2 drop-shadow-md z-10">
              <Gauge className="w-3 h-3 inline mr-1" />Speed
            </p>
            <div className="relative z-10 flex flex-col items-center">
              <p className="text-4xl font-mono font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] leading-none">{selected.speed || 0}</p>
              <p className="text-[10px] font-mono font-bold text-blue-400/80 mt-1 uppercase">km/h</p>
            </div>
            <div className="absolute bottom-0 left-0 h-1 bg-red-500 rounded-r-full transition-all duration-300"
              style={{ width: `${Math.min(100, ((selected.rpm || 0) / 15000) * 100)}%`, boxShadow: '0 -2px 10px rgba(239,68,68,0.8)' }} />
          </div>

          <div className="bg-gradient-to-b from-white/10 to-transparent border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center relative shadow-inner">
            <div className="absolute inset-0 bg-red-500/10 blur-xl" />
            <p className="text-[9px] text-neutral-400 font-black uppercase tracking-[0.3em] mb-2 z-10">Gear</p>
            <div className="relative z-10 flex items-end gap-2 text-white">
              <span className="text-4xl font-black font-mono leading-none drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">{selected.gear || 'N'}</span>
            </div>
            <div className="flex items-center gap-2 mt-2 z-10 w-full justify-between">
              <p className="text-[9px] font-mono font-bold text-neutral-500 uppercase">RPM</p>
              <p className="text-[11px] font-mono font-bold text-white">{selected.rpm || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 flex items-center gap-1">
              <TrendingUp className="w-2.5 h-2.5 text-blue-400" /> Speed Trace
            </span>
            <span className="text-[9px] font-mono text-neutral-400">
              {speedTrace.values.length > 0 ? `${speedTrace.values[speedTrace.values.length - 1]} km/h` : '—'}
            </span>
          </div>
          <SpeedTraceMini trace={speedTrace} color={teamColor} />
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500 w-16">Throttle</span>
            <div className="flex-1 h-3 bg-neutral-900 rounded-full border border-white/10 overflow-hidden relative shadow-inner">
              <div className="absolute top-0 left-0 h-full bg-green-500 rounded-full transition-all duration-100 ease-out shadow-[0_0_10px_#22c55e]" style={{ width: `${selected.throttle || 0}%` }} />
            </div>
            <span className="text-[10px] font-mono font-bold w-8 text-right text-green-400">{selected.throttle || 0}%</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500 w-16">Brake</span>
            <div className="flex-1 h-3 bg-neutral-900 rounded-full border border-white/10 overflow-hidden relative shadow-inner">
              <div className="absolute top-0 left-0 h-full bg-red-500 rounded-full transition-all duration-100 ease-out shadow-[0_0_10px_#ef4444]" style={{ width: `${selected.brake || 0}%` }} />
            </div>
            <span className="text-[10px] font-mono font-bold w-8 text-right text-red-400">{selected.brake || 0}%</span>
          </div>
        </div>

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
              { label: 'S1', val: selected.sector_1 },
              { label: 'S2', val: selected.sector_2 },
              { label: 'S3', val: selected.sector_3 },
            ].map((s) => (
              <div key={s.label}
                className={`border rounded-lg py-2.5 flex flex-col justify-center items-center ${s.val ? 'bg-purple-500/10 border-purple-500/30 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]' : 'bg-black/40 border-white/5 text-neutral-600'}`}
              >
                <p className="text-[8px] font-black uppercase tracking-[0.2em] mb-1 opacity-70">{s.label}</p>
                <p className="font-mono text-[11px] font-bold">{formatSectorTime(s.val)}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="bg-black/50 rounded-lg p-2 border border-white/5 flex justify-between items-center px-4">
              <p className="text-[10px] text-neutral-400 font-black tracking-widest">LAST LAP</p>
              <p className="font-mono text-base font-black text-white drop-shadow-md">
                {lastLap != null ? lastLap.toFixed(3) : selected.last_lap_time || '---'}
              </p>
            </div>
            {sessionBest != null && (
              <div className="bg-purple-500/10 rounded-lg p-2 border border-purple-500/20 flex justify-between items-center px-4">
                <p className="text-[10px] text-purple-400 font-black tracking-widest">SESSION BEST</p>
                <p className="font-mono text-sm font-black text-purple-300">{sessionBest.toFixed(3)}</p>
              </div>
            )}
            {lapDelta != null && (
              <div className="flex justify-end">
                <span className={`font-mono text-[11px] font-black px-2 py-0.5 rounded border ${lapDelta <= 0 ? 'text-green-400 bg-green-500/10 border-green-500/30' : 'text-red-400 bg-red-500/10 border-red-500/30'}`}>
                  {lapDelta > 0 ? '+' : ''}{lapDelta.toFixed(3)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 shadow-inner relative overflow-hidden flex flex-col justify-center">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/10 to-transparent blur-2xl transform rotate-45" />
            <div className="flex justify-between items-start mb-2 z-10">
              <div className="flex flex-col gap-1">
                <p className="text-[8px] text-neutral-400 font-black uppercase tracking-[0.2em]">Tyre</p>
                <span className="font-black text-white tracking-widest">{selected.tire || '??'}</span>
              </div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center font-black text-[9px] shadow-[0_0_10px_rgba(0,0,0,0.5)] border-2 border-black"
                style={{ background: TIRE_COLORS[selected.tire?.toUpperCase()] || '#666', color: ['HARD', 'WET', 'Unknown'].includes(selected.tire?.toUpperCase() || '') ? '#000' : '#fff' }}>
                {selected.tire?.charAt(0) || '?'}
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono font-bold mt-1 z-10">
              <span className="text-neutral-400">AGE</span>
              <span className="text-white bg-white/10 px-1.5 py-0.5 rounded">{selected.tire_age || 0} Laps</span>
            </div>
          </div>

          <div className={`rounded-xl p-3 flex flex-col justify-center items-center relative overflow-hidden transition-all duration-500 shadow-inner group ${drsActive ? 'bg-green-500/20 border border-green-500/50 shadow-[0_0_30px_rgba(34,197,94,0.3)]' : 'bg-white/5 border border-white/10'}`}>
            {drsActive && <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,197,94,0.4)_0%,transparent_100%)] animate-pulse" />}
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-400 mb-1 z-10 group-hover:text-white transition-colors">DRS STATUS</p>
            <p className={`font-mono text-xl font-black tracking-widest z-10 ${drsActive ? 'text-green-400 drop-shadow-[0_0_15px_#22c55e]' : 'text-neutral-600'}`}>
              {drsActive ? 'ACTIVE' : 'CLOSED'}
            </p>
            <span className="mt-1 z-10"><DrsPill drs={selected.drs} /></span>
          </div>
        </div>

        {selected.tire_age != null && selected.lap_number != null && selected.tire_age > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <PitWindow tireAge={selected.tire_age} lapNumber={selected.lap_number} />
          </div>
        )}

        {posHistory.length > 1 && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-1">Pos. Trend</p>
              <span className="font-mono text-lg font-black text-white">P{selected.pos}</span>
            </div>
            <PosSparkling positions={posHistory} />
          </div>
        )}

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
