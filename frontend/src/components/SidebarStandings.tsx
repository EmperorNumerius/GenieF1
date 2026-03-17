import React from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import { Activity } from 'lucide-react';
import { getTeamColor, TIRE_COLORS, formatInterval } from '../lib/constants';

interface SidebarStandingsProps {
  raceState: any;
  hasData: boolean;
  backendError?: string;
  selectedDriver: number | null;
  setSelectedDriver: (n: number) => void;
  setContextMenu: (menu: { x: number; y: number; driverId: number } | null) => void;
}

export function SidebarStandings({
  raceState,
  hasData,
  backendError,
  selectedDriver,
  setSelectedDriver,
  setContextMenu,
}: SidebarStandingsProps) {
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
            <p className="text-neutral-500 text-xs text-center mt-8 p-4">
              {backendError || 'Waiting for data...'}
            </p>
          )}
          {raceState.cars?.map((car: any) => {
            const isSelected = selectedDriver === car.number;
            const tireColor = TIRE_COLORS[car.tire?.toUpperCase()] || '#666';
            const teamColor = getTeamColor(car);

            const avatarUrl = `https://ui-avatars.com/api/?name=${car.id}&background=${teamColor.replace(
              '#',
              ''
            )}&color=fff&bold=true&size=64`;

            return (
              <motion.div
                layout
                key={car.number}
                onClick={() => setSelectedDriver(car.number)}
                onContextMenu={(e: React.MouseEvent) => {
                  e.preventDefault();
                  setContextMenu({ x: e.pageX, y: e.pageY, driverId: car.number });
                }}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-l-[3px] border-b border-b-white/5 transition-all duration-300 ${
                  isSelected
                    ? 'bg-gradient-to-r from-white/10 to-transparent border-l-current shadow-inner'
                    : 'hover:bg-white/5 border-l-transparent'
                }`}
                style={isSelected ? { borderLeftColor: teamColor } : undefined}
              >
                <span className="w-6 text-center font-mono text-xs font-black text-neutral-400 bg-black/50 rounded py-1">
                  {car.pos || '-'}
                </span>

                <div
                  className="w-9 h-9 rounded-lg shrink-0 overflow-hidden border-2"
                  style={{ borderColor: teamColor }}
                >
                  <img src={avatarUrl} alt={car.id} className="w-full h-full object-cover" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-neutral-100 uppercase tracking-widest">
                        {car.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          car.pos === 1 ? 'bg-purple-600/20 text-purple-400' : 'bg-black/40 text-neutral-400'
                        }`}
                      >
                        {formatInterval(car.gap_to_leader)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[9px] font-mono text-white font-black px-1 rounded shadow-sm"
                        style={{ background: tireColor }}
                      >
                        {car.tire?.charAt(0) || '?'} L{car.tire_age || 0}
                      </span>
                      {car.drs > 10 && (
                        <span className="text-[8px] px-1 py-[1px] rounded bg-green-500 text-black font-black tracking-wider shadow-[0_0_8px_rgba(34,197,94,0.6)]">
                          OVR
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 text-[9px] font-mono font-black">
                      {car.pos_diff !== undefined ? (
                        car.pos_diff > 0 ? (
                          <span className="text-green-400">▲{Math.abs(car.pos_diff)}</span>
                        ) : car.pos_diff < 0 ? (
                          <span className="text-red-400">▼{Math.abs(car.pos_diff)}</span>
                        ) : (
                          <span className="text-neutral-700">-</span>
                        )
                      ) : null}
                    </div>
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
