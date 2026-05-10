import React from 'react';
import type { RaceState } from '../hooks/useRaceData';

interface SidebarStandingsProps {
  raceState: RaceState | null;
  selectedDriverId: string | null;
  onSelectDriver: (id: string | null) => void;
}

export function SidebarStandings({ raceState, selectedDriverId, onSelectDriver }: SidebarStandingsProps) {
  if (!raceState || !raceState.cars || raceState.cars.length === 0) {
    return (
      <div className="w-64 bg-black border-r border-white/10 p-4 flex flex-col">
        <h2 className="text-white font-bold text-sm tracking-widest uppercase mb-4">Standings</h2>
        <div className="flex-1 flex items-center justify-center text-neutral-500 text-xs">Waiting for data...</div>
      </div>
    );
  }

  const sortedCars = [...raceState.cars].sort((a, b) => a.pos - b.pos);

  return (
    <div className="w-64 bg-black border-r border-white/10 flex flex-col h-full overflow-y-auto custom-scrollbar">
      <div className="sticky top-0 bg-black/90 backdrop-blur-md p-3 border-b border-white/10 z-10">
        <h2 className="text-white font-bold text-xs tracking-widest uppercase flex items-center gap-2">
          <span>Live Standings</span>
          <span className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[9px]">L{raceState.lap}</span>
        </h2>
      </div>

      <div className="flex flex-col flex-1 p-2 gap-1">
        {sortedCars.map((car) => {
          const isSelected = car.id === selectedDriverId;
          return (
            <button
              key={car.id}
              onClick={() => onSelectDriver(isSelected ? null : car.id)}
              className={`flex items-center text-left w-full rounded pl-2 pr-3 py-2 transition-all border ${
                isSelected
                  ? 'bg-white/10 border-white/20'
                  : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/10'
              }`}
            >
              <span className="w-5 text-right font-mono text-[11px] font-bold text-neutral-400 mr-3">{car.pos}</span>

              <div className="flex-1 min-w-0 flex flex-col">
                <span className="font-bold text-sm text-white truncate leading-none mb-1">{car.name || car.id}</span>
                <span className="text-[10px] text-neutral-500 font-mono leading-none flex gap-2">
                  <span className="text-neutral-400">{car.tire}</span>
                  {car.interval && car.pos > 1 && <span>+{car.interval}</span>}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}