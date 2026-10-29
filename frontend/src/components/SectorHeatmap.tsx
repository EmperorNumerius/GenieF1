'use client';

import React from 'react';
import { Car } from './RacingLineGhost';

export interface SectorHeatmapProps {
  cars: Car[];
}

type SectorKey = 'sector_1' | 'sector_2' | 'sector_3';

function toNum(val: number | string | null | undefined): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val > 0 ? val : null;
  const n = parseFloat(val);
  return isFinite(n) && n > 0 ? n : null;
}

function sectorCellClass(
  val: number | null,
  best: number | null
): string {
  if (val == null || best == null) return 'bg-gray-700 text-gray-500';
  const delta = val - best;
  if (delta <= 0.001) return 'bg-green-700 text-green-100';
  if (delta <= 0.2) return 'bg-yellow-600 text-yellow-100';
  if (delta <= 0.5) return 'bg-orange-700 text-orange-100';
  return 'bg-red-800 text-red-200';
}

function formatSec(val: number | null): string {
  if (val == null) return '--';
  return val.toFixed(3);
}

export function SectorHeatmap({ cars }: SectorHeatmapProps) {
  const sectors: SectorKey[] = ['sector_1', 'sector_2', 'sector_3'];

  // Compute best times per sector across all cars
  const bests: Record<SectorKey, number | null> = {
    sector_1: null,
    sector_2: null,
    sector_3: null,
  };

  for (const car of cars) {
    for (const sk of sectors) {
      const v = toNum(car[sk]);
      if (v != null) {
        if (bests[sk] == null || v < bests[sk]!) bests[sk] = v;
      }
    }
  }

  // Sort: cars with a complete lap time (sum of 3 sectors) ascending; no-time cars go last
  const sorted = [...cars].sort((a, b) => {
    const sumA =
      toNum(a.sector_1) != null &&
      toNum(a.sector_2) != null &&
      toNum(a.sector_3) != null
        ? toNum(a.sector_1)! + toNum(a.sector_2)! + toNum(a.sector_3)!
        : null;
    const sumB =
      toNum(b.sector_1) != null &&
      toNum(b.sector_2) != null &&
      toNum(b.sector_3) != null
        ? toNum(b.sector_1)! + toNum(b.sector_2)! + toNum(b.sector_3)!
        : null;

    if (sumA == null && sumB == null) return 0;
    if (sumA == null) return 1;
    if (sumB == null) return -1;
    return sumA - sumB;
  });

  return (
    <div className="flex flex-col bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 bg-gray-800">
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-200">
          Sector Heatmap
        </span>
        <div className="ml-auto flex items-center gap-1.5 text-[8px] font-mono">
          <span className="bg-green-700 text-green-100 px-1.5 py-0.5 rounded">BEST</span>
          <span className="bg-yellow-600 text-yellow-100 px-1.5 py-0.5 rounded">+0.2</span>
          <span className="bg-red-800 text-red-200 px-1.5 py-0.5 rounded">&gt;+0.5</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center px-3 py-1 border-b border-gray-700/50 bg-gray-800/50">
        <span className="w-8 text-[9px] text-gray-500 font-black uppercase tracking-wider">TLA</span>
        <div className="flex-1 grid grid-cols-3 gap-1 ml-2">
          {(['S1', 'S2', 'S3'] as const).map((label) => (
            <span
              key={label}
              className="text-center text-[9px] text-gray-400 font-black uppercase tracking-widest"
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Driver rows */}
      <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
        {sorted.length === 0 && (
          <p className="text-gray-600 text-xs text-center py-6 font-mono">No data</p>
        )}
        {sorted.map((car) => {
          const color = car.color?.startsWith('#') ? car.color : `#${car.color || '888888'}`;
          const sVals = sectors.map((sk) => toNum(car[sk]));

          return (
            <div
              key={car.id}
              className="flex items-center px-3 py-1.5 border-b border-gray-700/30 hover:bg-gray-800/40 transition-colors"
            >
              {/* Color dot + TLA */}
              <div className="flex items-center gap-1.5 w-14 shrink-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-[11px] font-black font-mono text-gray-200 uppercase tracking-widest truncate">
                  {car.id}
                </span>
              </div>

              {/* Sector cells */}
              <div className="flex-1 grid grid-cols-3 gap-1 ml-1">
                {sVals.map((val, idx) => {
                  const sk = sectors[idx];
                  const cellClass = sectorCellClass(val, bests[sk]);
                  return (
                    <div
                      key={idx}
                      className={`rounded text-center py-0.5 px-1 text-[9px] font-mono font-bold ${cellClass}`}
                    >
                      {formatSec(val)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
