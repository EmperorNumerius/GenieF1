'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Car } from './RacingLineGhost';
import { TIRE_COLORS } from '../lib/constants';

export interface BattleViewProps {
  cars: Car[];
  defaultA?: string;
  defaultB?: string;
}

function toNum(val: number | string | null | undefined): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return isFinite(val) ? val : null;
  const n = parseFloat(val);
  return isFinite(n) ? n : null;
}

function formatTime(val: number | string | null | undefined): string {
  if (val == null) return '--:--.---';
  if (typeof val === 'number') return val.toFixed(3);
  return String(val);
}

function formatSector(val: number | string | null | undefined): string {
  if (val == null) return '---';
  if (typeof val === 'number') return val.toFixed(3);
  return String(val);
}

type SectorCompare = 'faster' | 'slower' | 'equal';

function compareSector(
  mine: number | string | null | undefined,
  other: number | string | null | undefined
): SectorCompare {
  const a = toNum(mine);
  const b = toNum(other);
  if (a == null || b == null) return 'equal';
  if (a < b) return 'faster';
  if (a > b) return 'slower';
  return 'equal';
}

const sectorColorClass: Record<SectorCompare, string> = {
  faster: 'text-green-400',
  slower: 'text-red-400',
  equal: 'text-gray-400',
};

interface DriverPanelProps {
  car: Car | undefined;
  opponent: Car | undefined;
  side: 'A' | 'B';
}

function DriverPanel({ car, opponent, side }: DriverPanelProps) {
  if (!car) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 font-mono text-xs p-6 bg-gray-900 rounded-xl border border-gray-700">
        Select driver {side}
      </div>
    );
  }

  const color = car.color?.startsWith('#') ? car.color : `#${car.color || '888888'}`;
  const tireColorBg = TIRE_COLORS[car.tire?.toUpperCase()] ?? '#6b7280';
  const tireTextColor = ['HARD', 'WET'].includes(car.tire?.toUpperCase() ?? '') ? '#000' : '#fff';

  const s1Cmp = compareSector(car.sector_1, opponent?.sector_1);
  const s2Cmp = compareSector(car.sector_2, opponent?.sector_2);
  const s3Cmp = compareSector(car.sector_3, opponent?.sector_3);

  return (
    <motion.div
      layout
      key={car.id}
      className="flex-1 flex flex-col bg-gray-900 border border-gray-700 rounded-xl overflow-hidden"
    >
      {/* Team color bar */}
      <div className="h-1" style={{ backgroundColor: color }} />

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-3">
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-base font-black uppercase tracking-widest text-gray-100 truncate">
            {car.name || car.id}
          </span>
          <span className="text-[10px] text-gray-400 font-bold uppercase truncate">{car.team}</span>
        </div>
        <span
          className="text-2xl font-black font-mono opacity-60"
          style={{ color }}
        >
          #{car.number}
        </span>
      </div>

      {/* Main telemetry */}
      <div className="flex flex-col gap-3 p-4">
        {/* Speed */}
        <div className="flex flex-col items-center bg-gray-800/60 rounded-lg py-3 border border-gray-700/60">
          <span className="text-[9px] text-gray-400 uppercase tracking-[0.25em] font-black mb-1">Speed</span>
          <span className="text-4xl font-black font-mono text-white leading-none">
            {car.speed ?? 0}
          </span>
          <span className="text-[10px] text-gray-500 font-mono mt-1">km/h</span>
        </div>

        {/* RPM & Gear */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col items-center bg-gray-800/40 rounded-lg py-2 border border-gray-700/40">
            <span className="text-[8px] text-gray-500 uppercase tracking-widest font-black mb-0.5">RPM</span>
            <span className="text-lg font-black font-mono text-gray-100">{car.rpm ?? 0}</span>
          </div>
          <div className="flex flex-col items-center bg-gray-800/40 rounded-lg py-2 border border-gray-700/40">
            <span className="text-[8px] text-gray-500 uppercase tracking-widest font-black mb-0.5">Gear</span>
            <span className="text-lg font-black font-mono text-gray-100">{car.gear ?? 'N'}</span>
          </div>
        </div>

        {/* Throttle bar */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[9px] w-14 text-gray-500 uppercase font-black tracking-wider">Throttle</span>
            <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-100 shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                style={{ width: `${Math.min(100, car.throttle ?? 0)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono font-bold text-green-400 w-8 text-right">
              {car.throttle ?? 0}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] w-14 text-gray-500 uppercase font-black tracking-wider">Brake</span>
            <div className="flex-1 h-2.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
              <div
                className="h-full bg-red-500 rounded-full transition-all duration-100 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
                style={{ width: `${Math.min(100, car.brake ?? 0)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono font-bold text-red-400 w-8 text-right">
              {car.brake ?? 0}%
            </span>
          </div>
        </div>

        {/* Tire */}
        <div className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2 border border-gray-700/40">
          <span className="text-[9px] text-gray-500 uppercase font-black tracking-wider">Tire</span>
          <div className="flex items-center gap-2">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black border border-black/30"
              style={{ backgroundColor: tireColorBg, color: tireTextColor }}
            >
              {(car.tire?.charAt(0) ?? '?')}
            </span>
            <span className="text-[11px] font-mono font-bold text-gray-300">
              {car.tire ?? '?'} — {car.tire_age ?? 0} laps
            </span>
          </div>
        </div>

        {/* Last lap */}
        <div className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2 border border-gray-700/40">
          <span className="text-[9px] text-gray-500 uppercase font-black tracking-wider">Last Lap</span>
          <span className="text-[13px] font-mono font-black text-gray-100">
            {formatTime(car.last_lap_time)}
          </span>
        </div>

        {/* Sectors */}
        <div className="grid grid-cols-3 gap-1">
          {(
            [
              { label: 'S1', val: car.sector_1, cmp: s1Cmp },
              { label: 'S2', val: car.sector_2, cmp: s2Cmp },
              { label: 'S3', val: car.sector_3, cmp: s3Cmp },
            ] as { label: string; val: number | string | null; cmp: SectorCompare }[]
          ).map(({ label, val, cmp }) => (
            <div
              key={label}
              className="flex flex-col items-center bg-gray-800/40 rounded-lg py-1.5 border border-gray-700/40"
            >
              <span className="text-[8px] text-gray-500 uppercase font-black tracking-widest">
                {label}
              </span>
              <span className={`text-[10px] font-mono font-bold ${sectorColorClass[cmp]}`}>
                {formatSector(val)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export function BattleView({ cars, defaultA, defaultB }: BattleViewProps) {
  const [idA, setIdA] = useState<string>(defaultA ?? cars[0]?.id ?? '');
  const [idB, setIdB] = useState<string>(defaultB ?? cars[1]?.id ?? '');
  const [swapped, setSwapped] = useState(false);

  const carA = cars.find((c) => c.id === idA);
  const carB = cars.find((c) => c.id === idB);

  const handleSwap = () => {
    setSwapped((s) => !s);
    setIdA(idB);
    setIdB(idA);
  };

  // Compute gap badge
  const gapDisplay = (() => {
    const gA = toNum(carA?.gap_to_leader);
    const gB = toNum(carB?.gap_to_leader);
    if (gA == null || gB == null) return '--';
    const delta = Math.abs(gA - gB);
    return `+${delta.toFixed(3)}s`;
  })();

  return (
    <div className="flex flex-col bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-700 bg-gray-800">
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-200 flex-1">
          Battle
        </span>

        {/* Dropdowns */}
        <select
          value={idA}
          onChange={(e) => setIdA(e.target.value)}
          className="bg-gray-700 border border-gray-600 text-gray-200 text-[11px] font-bold rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-500"
          aria-label="Select driver A"
        >
          {cars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id}
            </option>
          ))}
        </select>

        {/* Swap button */}
        <button
          onClick={handleSwap}
          aria-label="Swap drivers"
          className="bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 text-sm px-2 py-1 rounded transition-colors font-bold"
        >
          ↔
        </button>

        <select
          value={idB}
          onChange={(e) => setIdB(e.target.value)}
          className="bg-gray-700 border border-gray-600 text-gray-200 text-[11px] font-bold rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-gray-500"
          aria-label="Select driver B"
        >
          {cars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id}
            </option>
          ))}
        </select>
      </div>

      {/* Panels */}
      <div className="flex gap-2 p-3">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`panel-${swapped}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex gap-2 w-full"
          >
            <DriverPanel car={carA} opponent={carB} side="A" />

            {/* GAP badge (center column) */}
            <div className="flex flex-col items-center justify-center gap-2 shrink-0 w-14">
              <span className="text-[9px] text-gray-500 uppercase font-black tracking-widest">Gap</span>
              <span className="text-[11px] font-mono font-black text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded-lg px-2 py-1 text-center whitespace-nowrap">
                {gapDisplay}
              </span>
            </div>

            <DriverPanel car={carB} opponent={carA} side="B" />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
