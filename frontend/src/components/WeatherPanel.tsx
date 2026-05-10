import React from 'react';
import { Cloud, Thermometer, Wind, Droplets } from 'lucide-react';
import type { RaceState } from '../hooks/useRaceData';

interface WeatherPanelProps {
  raceState: RaceState | null;
}

export function WeatherPanel({ raceState }: WeatherPanelProps) {
  const weather = raceState?.weather;

  if (!weather || Object.keys(weather).length === 0) {
    return null;
  }

  return (
    <div className="bg-black/80 backdrop-blur-md border border-white/10 p-3 rounded-xl flex gap-4 shrink-0">
      <div className="flex items-center gap-2">
        <Thermometer className="w-4 h-4 text-blue-400" />
        <div className="flex flex-col">
          <span className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">Air</span>
          <span className="text-xs font-mono text-white font-bold">{weather.air_temp ?? '--'}°C</span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-l border-white/10 pl-4">
        <Thermometer className="w-4 h-4 text-orange-400" />
        <div className="flex flex-col">
          <span className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">Track</span>
          <span className="text-xs font-mono text-white font-bold">{weather.track_temp ?? '--'}°C</span>
        </div>
      </div>

      {weather.wind_speed != null && (
        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
          <Wind className="w-4 h-4 text-neutral-400" />
          <div className="flex flex-col">
            <span className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">Wind</span>
            <span className="text-xs font-mono text-white font-bold">{weather.wind_speed}m/s</span>
          </div>
        </div>
      )}

      {weather.humidity != null && (
        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
          <Droplets className="w-4 h-4 text-blue-300" />
          <div className="flex flex-col">
            <span className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">Humid</span>
            <span className="text-xs font-mono text-white font-bold">{weather.humidity}%</span>
          </div>
        </div>
      )}

      {weather.rainfall != null && (
        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
          <Cloud className={`w-4 h-4 ${weather.rainfall ? 'text-blue-500 animate-pulse' : 'text-neutral-600'}`} />
          <div className="flex flex-col">
            <span className="text-[9px] text-neutral-500 uppercase font-bold tracking-wider">Rain</span>
            <span className={`text-xs font-mono font-bold ${weather.rainfall ? 'text-blue-400' : 'text-neutral-500'}`}>
              {weather.rainfall ? 'YES' : 'NO'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}