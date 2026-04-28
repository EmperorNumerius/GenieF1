'use client';

import React, { useRef } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { Activity } from 'lucide-react';
import { getTeamColor, TIRE_COLORS, formatInterval } from '../lib/constants';
import { DrsPill } from './TelemetryDashboard';

interface SidebarStandingsProps {
  raceState: any;
  hasData: boolean;
  backendError?: string;
  selectedDriver: number | null;
  setSelectedDriver: (n: number) => void;
  setContextMenu: (menu: { x: number; y: number; driverId: number } | null) => void;
}

type SectorKey = 's1' | 's2' | 's3';

function useSectorBests() {
  const driverBests = useRef<Map<number, Record<SectorKey, number>>>(new Map());
  const sessionBests = useRef<Record<SectorKey, number>>({ s1: Infinity, s2: Infinity, s3: Infinity });

  function update(cars: any[]) {
    for (const car of cars) {
      if (!car.number) continue;
      const vals: Record<SectorKey, number | null> = {
        s1: typeof car.sector_1 === 'number' ? car.sector_1 : parseFloat(car.sector_1) || null,
        s2: typeof car.sector_2 === 'number' ? car.sector_2 : parseFloat(car.sector_2) || null,
        s3: typeof car.sector_3 === 'number' ? car.sector_3 : parseFloat(car.sector_3) || null,
      };
      let driverRec = driverBests.current.get(car.number);
      if (!driverRec) {
        driverRec = { s1: Infinity, s2: Infinity, s3: Infinity };
        driverBests.current.set(car.number, driverRec);
      }
      (['s1', 's2', 's3'] as SectorKey[]).forEach((k) => {
        const v = vals[k];
        if (v != null && v > 0) {
          if (v < driverRec![k]) driverRec![k] = v;
          if (v < sessionBests.current[k]) sessionBests.current[k] = v;
        }
      });
    }
  }

  function getSectorColor(driverNumber: number, key: SectorKey, value: number | null | undefined): string {
    if (!value) return 'text-neutral-600';
    const numVal = typeof value === 'number' ? value : parseFloat(String(value));
    if (isNaN(numVal) || numVal <= 0) return 'text-neutral-600';
    const sBest = sessionBests.current[key];
    const driverRec = driverBests.current.get(driverNumber);
    const personalBest = driverRec?.[key] ?? Infinity;
    if (numVal <= sBest + 0.001) return 'text-purple-400';
    if (numVal <= personalBest + 0.001) return 'text-green-400';
    if (numVal <= personalBest + 0.3) return 'text-yellow-400';
    return 'text-neutral-300';
  }

  return { update, getSectorColor };
}

export function SidebarStandings({
  raceState, hasData, backendError, selectedDriver, setSelectedDriver, setContextMenu,
}: SidebarStandingsProps) {
  const { update, getSectorColor } = useSectorBests();
  const cars: any[] = raceState?.cars ?? [];
  if (cars.length > 0) update(cars);

  return (
    <div className="w-[320px] flex flex-col bg-black/80 backdrop-blur-2xl rounded-2xl border border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-red-600/10 to-transparent flex items-center justify-between">
        <h2 className="text-xs font-black uppercase text-white tracking-[0.3em] flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-red-500" /> LIVE STANDINGS
        </h2>
        <div className="flex gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse delay-75" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <LayoutGroup>
          {!hasData && (
            <p className="text-neutral-500 text-xs text-center mt-8 p-4">{backendError || 'Waiting for data...'}</p>
          )}
          {cars.map((car: any) => {
            const isSelected = selectedDriver === car.number;
            const tireColor = TIRE_COLORS[car.tire?.toUpperCase()] || '#666';
            const teamColor = getTeamColor(car);
            const avatarUrl = `https://ui-avatars.com/api/?name=${car.id}&background=${teamColor.replace('#', '')}&color=fff&bold=true&size=64`;
            const s1Color = getSectorColor(car.number, 's1', car.sector_1);
            const s2Color = getSectorColor(car.number, 's2', car.sector_2);
            const s3Color = getSectorColor(car.number, 's3', car.sector_3);

            return (
              <motion.div
                layout
                key={car.number}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`Select driver ${car.id}, position ${car.pos || '-'}`}
                onClick={() => setSelectedDriver(car.number)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDriver(car.number); }
                }}
                onContextMenu={(e: React.MouseEvent) => {
                  e.preventDefault();
                  setContextMenu({ x: e.pageX, y: e.pageY, driverId: car.number });
                }}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-l-[3px] border-b border-b-white/5 transition-all duration-300 focus-visible:outline-none focus-visible:bg-white/5 focus-visible:ring-1 focus-visible:ring-white/50 ${isSelected ? 'bg-gradient-to-r from-white/10 to-transparent border-l-current shadow-inner' : 'hover:bg-white/5 border-l-transparent'}`}
                style={isSelected ? { borderLeftColor: teamColor } : undefined}
              >
                <span className="w-6 text-center font-mono text-xs font-black text-neutral-400 bg-black/50 rounded py-1">{car.pos || '-'}</span>
                <div className="w-9 h-9 rounded-lg shrink-0 overflow-hidden border-2" style={{ borderColor: teamColor }}>
                  <img src={avatarUrl} alt={`Driver ${car.id}`} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-neutral-100 uppercase tracking-widest">{car.id}</span>
                      <DrsPill drs={car.drs} />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${car.pos === 1 ? 'bg-purple-600/20 text-purple-400' : 'bg-black/40 text-neutral-400'}`}>
                        {formatInterval(car.gap_to_leader)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 mt-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-mono text-white font-black px-1 rounded shadow-sm" style={{ background: tireColor }}>
                          {car.tire?.charAt(0) || '?'} L{car.tire_age || 0}
                        </span>
                        <span className="text-[9px] font-mono font-bold text-neutral-400 ml-1">
                          ⏱ {car.last_lap_time || '--:--.---'}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 text-[9px] font-mono font-black">
                        {car.pos_diff !== undefined ? (
                          car.pos_diff > 0 ? <span className="text-green-400">▲{Math.abs(car.pos_diff)}</span>
                          : car.pos_diff < 0 ? <span className="text-red-400">▼{Math.abs(car.pos_diff)}</span>
                          : <span className="text-neutral-700">-</span>
                        ) : null}
                      </div>
                    </div>
                    {(car.sector_1 || car.sector_2 || car.sector_3) && (
                      <div className="flex items-center gap-[2px] text-[8px] font-mono bg-black/20 rounded p-[2px] border border-white/5">
                        <div className={`flex-1 flex justify-between px-1 rounded-sm bg-white/5 ${s1Color}`}>
                          <span>S1</span><span>{car.sector_1 || '--'}</span>
                        </div>
                        <div className={`flex-1 flex justify-between px-1 rounded-sm bg-white/5 ${s2Color}`}>
                          <span>S2</span><span>{car.sector_2 || '--'}</span>
                        </div>
                        <div className={`flex-1 flex justify-between px-1 rounded-sm bg-white/5 ${s3Color}`}>
                          <span>S3</span><span>{car.sector_3 || '--'}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </LayoutGroup>
      </div>
    </div>
  );
}
