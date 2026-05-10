import React from 'react';
import type { CarState } from '../hooks/useRaceData';
import { Gauge, Zap } from 'lucide-react';

interface DriverCardProps {
  car: CarState;
  onClose: () => void;
}

export function DriverCard({ car, onClose }: DriverCardProps) {
  // 2026 Regs: Overtake Mode (OVR) replacing DRS
  const ovrActive = car.drs > 0 && car.drs !== 8; // simplified heuristic for DRS/OVR state

  return (
    <div className="bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl p-4 w-72 shadow-2xl relative overflow-hidden group">
      <button
        onClick={onClose}
        className="absolute top-2 right-2 text-neutral-500 hover:text-white p-1"
      >
        ✕
      </button>

      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-2xl font-black italic text-white">{car.number}</span>
            <span className="bg-white/10 px-2 py-0.5 rounded text-xs font-bold tracking-widest text-neutral-300">
              P{car.pos}
            </span>
          </div>
          <h3 className="text-lg font-bold text-white leading-none">{car.name || car.id}</h3>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-white/5 rounded-lg p-2 flex flex-col justify-center">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold mb-1 flex items-center gap-1">
            <Gauge className="w-3 h-3" /> Speed
          </span>
          <span className="font-mono text-xl text-white font-bold">{car.speed} <span className="text-xs text-neutral-500">km/h</span></span>
        </div>
        <div className="bg-white/5 rounded-lg p-2 flex flex-col justify-center">
          <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold mb-1">Gear</span>
          <span className="font-mono text-xl text-white font-bold">{car.n_gear}</span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div>
          <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold mb-1">
            <span className="text-neutral-500">Throttle</span>
            <span className="text-green-400 font-mono">{car.throttle}%</span>
          </div>
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${car.throttle}%` }} />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold mb-1">
            <span className="text-neutral-500">Brake</span>
            <span className="text-red-400 font-mono">{car.brake}%</span>
          </div>
          <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 transition-all" style={{ width: `${car.brake}%` }} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 pt-3 mt-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-white/20 border border-white/40 flex items-center justify-center">
            <div className={`w-1.5 h-1.5 rounded-full ${car.tire.includes('SOFT') ? 'bg-red-500' : car.tire.includes('HARD') ? 'bg-white' : 'bg-yellow-400'}`} />
          </div>
          <span className="text-xs font-bold text-neutral-300 uppercase">{car.tire} ({car.tire_age}L)</span>
        </div>

        {ovrActive ? (
          <div className="flex items-center gap-1 bg-green-500/20 text-green-400 border border-green-500/30 px-2 py-0.5 rounded animate-pulse">
            <Zap className="w-3 h-3" />
            <span className="text-[10px] font-black tracking-widest uppercase">OVR Active</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded">
            <span className="text-[10px] font-bold tracking-widest uppercase">OVR Off</span>
          </div>
        )}
      </div>
    </div>
  );
}