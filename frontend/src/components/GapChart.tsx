'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';
import { getTeamColor } from '../lib/constants';

interface GapSnapshot {
  timestamp: number;
  gaps: Record<number, number>; // driverNumber -> gap in seconds (leader = 0)
}

interface GapChartProps {
  raceState: any;
}

function parseGap(val: string | null | undefined): number | null {
  if (!val) return null;
  const s = String(val).replace('s', '').replace('+', '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const MAX_SNAPSHOTS = 60;

export function GapChart({ raceState }: GapChartProps) {
  const [isOpen, setIsOpen] = useState(true);
  const historyRef = useRef<GapSnapshot[]>([]);
  const [history, setHistory] = useState<GapSnapshot[]>([]);

  useEffect(() => {
    if (!raceState?.cars?.length) return;

    const snapshot: GapSnapshot = {
      timestamp: Date.now(),
      gaps: {},
    };

    for (const car of raceState.cars) {
      const gap = parseGap(car.gap_to_leader);
      if (gap !== null) {
        snapshot.gaps[car.number] = gap;
      } else if (car.pos === 1) {
        snapshot.gaps[car.number] = 0;
      }
    }

    const newHistory = [...historyRef.current, snapshot].slice(-MAX_SNAPSHOTS);
    historyRef.current = newHistory;
    setHistory([...newHistory]);
  }, [raceState]);

  const cars: any[] = raceState?.cars ?? [];

  // Determine max gap for scaling
  const allGaps = history.flatMap((s) => Object.values(s.gaps));
  const maxGap = allGaps.length > 0 ? Math.max(...allGaps, 5) : 60;

  const WIDTH = 340;
  const HEIGHT = 120;
  const PADDING = { top: 8, right: 8, bottom: 16, left: 32 };

  const chartW = WIDTH - PADDING.left - PADDING.right;
  const chartH = HEIGHT - PADDING.top - PADDING.bottom;

  function xPos(idx: number, total: number) {
    if (total <= 1) return PADDING.left;
    return PADDING.left + (idx / (total - 1)) * chartW;
  }

  function yPos(gap: number) {
    return PADDING.top + chartH - (gap / maxGap) * chartH;
  }

  function buildPath(driverNumber: number): string {
    const points: string[] = [];
    history.forEach((snap, i) => {
      const gap = snap.gaps[driverNumber];
      if (gap !== undefined) {
        const x = xPos(i, history.length);
        const y = yPos(gap);
        points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      }
    });
    return points.join(' ');
  }

  // Y-axis labels
  const yLabels = [0, Math.round(maxGap / 2), Math.round(maxGap)];

  return (
    <div className="bg-black/60 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors"
      >
        <h3 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
          <TrendingUp className="w-3 h-3 text-blue-400" />
          Gap to Leader
          <span className="ml-1 text-[8px] text-neutral-600 font-normal normal-case tracking-normal">
            ({Math.min(history.length, MAX_SNAPSHOTS)} snapshots)
          </span>
        </h3>
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-neutral-500" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="gap-chart-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              {history.length < 2 ? (
                <div className="flex items-center justify-center h-[80px] text-neutral-600 font-mono text-xs">
                  Collecting gap data…
                </div>
              ) : (
                <svg
                  width={WIDTH}
                  height={HEIGHT}
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                  className="w-full"
                  style={{ maxWidth: WIDTH }}
                >
                  {/* Grid lines */}
                  {yLabels.map((label) => {
                    const y = yPos(label);
                    return (
                      <g key={label}>
                        <line
                          x1={PADDING.left}
                          y1={y}
                          x2={WIDTH - PADDING.right}
                          y2={y}
                          stroke="rgba(255,255,255,0.06)"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={PADDING.left - 4}
                          y={y + 3}
                          fontSize={7}
                          fill="rgba(255,255,255,0.3)"
                          textAnchor="end"
                          fontFamily="monospace"
                        >
                          {label}s
                        </text>
                      </g>
                    );
                  })}

                  {/* Car lines */}
                  {cars.map((car) => {
                    const color = getTeamColor(car);
                    const path = buildPath(car.number);
                    if (!path) return null;

                    // Last known position
                    const lastSnap = [...history].reverse().find((s) => s.gaps[car.number] !== undefined);
                    const lastGap = lastSnap?.gaps[car.number];
                    const lastX = lastSnap ? xPos(history.indexOf(lastSnap), history.length) : null;
                    const lastY = lastGap !== undefined ? yPos(lastGap) : null;

                    return (
                      <g key={car.number}>
                        <path
                          d={path}
                          fill="none"
                          stroke={color}
                          strokeWidth={1.5}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={0.8}
                        />
                        {lastX !== null && lastY !== null && (
                          <>
                            <circle cx={lastX} cy={lastY} r={2.5} fill={color} opacity={0.9} />
                            <text
                              x={Math.min(lastX + 4, WIDTH - PADDING.right - 20)}
                              y={lastY + 3}
                              fontSize={6}
                              fill={color}
                              fontFamily="monospace"
                              fontWeight="bold"
                              opacity={0.9}
                            >
                              {car.id}
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}

                  {/* X axis */}
                  <line
                    x1={PADDING.left}
                    y1={PADDING.top + chartH}
                    x2={WIDTH - PADDING.right}
                    y2={PADDING.top + chartH}
                    stroke="rgba(255,255,255,0.1)"
                  />
                </svg>
              )}

              {/* Mini legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                {cars.slice(0, 8).map((car) => {
                  const color = getTeamColor(car);
                  return (
                    <div key={car.number} className="flex items-center gap-1">
                      <div className="w-3 h-[2px] rounded-full" style={{ background: color }} />
                      <span className="text-[8px] font-mono text-neutral-500">{car.id}</span>
                    </div>
                  );
                })}
                {cars.length > 8 && (
                  <span className="text-[8px] text-neutral-600 font-mono">+{cars.length - 8} more</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
