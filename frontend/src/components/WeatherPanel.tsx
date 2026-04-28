import React from 'react';
import { Thermometer, Wind, Droplets, CloudRain, Sun } from 'lucide-react';

interface WeatherPanelProps {
  weather: {
    air_temp?: number | null;
    track_temp?: number | null;
    humidity?: number | null;
    wind_speed?: number | null;
    rainfall?: number | null;
  } | null | undefined;
}

export function WeatherPanel({ weather }: WeatherPanelProps) {
  if (!weather) return null;

  const isRaining = weather.rainfall != null && weather.rainfall > 0;

  return (
    <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-[10px] font-mono font-bold">
      {/* Rain / Dry icon */}
      <div className="flex items-center gap-1">
        {isRaining ? (
          <CloudRain className="w-3.5 h-3.5 text-blue-400" />
        ) : (
          <Sun className="w-3.5 h-3.5 text-yellow-400" />
        )}
        <span className={isRaining ? 'text-blue-300' : 'text-yellow-300'}>
          {isRaining ? 'WET' : 'DRY'}
        </span>
      </div>

      <div className="w-px h-3 bg-white/10" />

      {/* Air Temp */}
      {weather.air_temp != null && (
        <div className="flex items-center gap-1 text-neutral-300">
          <Thermometer className="w-3 h-3 text-blue-300" />
          <span>{weather.air_temp}°</span>
          <span className="text-neutral-600 text-[8px]">AIR</span>
        </div>
      )}

      {/* Track Temp */}
      {weather.track_temp != null && (
        <div className="flex items-center gap-1 text-orange-300">
          <span>{weather.track_temp}°</span>
          <span className="text-neutral-600 text-[8px]">TRK</span>
        </div>
      )}

      {/* Humidity */}
      {weather.humidity != null && (
        <div className="flex items-center gap-1 text-cyan-300">
          <Droplets className="w-3 h-3" />
          <span>{weather.humidity}%</span>
        </div>
      )}

      {/* Wind */}
      {weather.wind_speed != null && (
        <div className="flex items-center gap-1 text-neutral-300">
          <Wind className="w-3 h-3 text-neutral-400" />
          <span>{weather.wind_speed}<span className="text-neutral-600 text-[8px] ml-0.5">m/s</span></span>
        </div>
      )}
    </div>
  );
}
