import React from 'react';
import type { RaceState } from '../hooks/useRaceData';
import { AlertCircle } from 'lucide-react';

interface RaceControlBannerProps {
  raceState: RaceState | null;
}

export function RaceControlBanner({ raceState }: RaceControlBannerProps) {
  const messages = raceState?.race_control || [];
  const trackStatus = raceState?.track_status || 'GREEN';

  // Determine styling based on track status
  let statusColor = 'bg-green-500/20 text-green-400 border-green-500/30';
  let statusGlow = 'drop-shadow-[0_0_8px_rgba(34,197,94,0.5)]';
  if (trackStatus.includes('YELLOW') || trackStatus.includes('SC') || trackStatus.includes('VSC')) {
    statusColor = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    statusGlow = 'drop-shadow-[0_0_8px_rgba(234,179,8,0.5)]';
  } else if (trackStatus.includes('RED')) {
    statusColor = 'bg-red-500/20 text-red-400 border-red-500/30';
    statusGlow = 'drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]';
  }

  return (
    <div className="bg-black/90 border border-white/10 rounded-xl overflow-hidden flex items-center h-10 w-full shrink-0">
      <div className={`px-4 py-2 border-r font-black tracking-widest text-[11px] uppercase whitespace-nowrap flex items-center gap-2 ${statusColor}`}>
        <div className={`w-2 h-2 rounded-full animate-pulse bg-current ${statusGlow}`} />
        {trackStatus}
      </div>

      <div className="flex-1 overflow-hidden relative h-full flex items-center">
        {messages.length > 0 ? (
          <div className="animate-marquee whitespace-nowrap flex items-center gap-8 pl-4 pr-12 text-xs font-bold font-mono text-neutral-300">
             {messages.map((msg, i) => (
                <span key={i} className="flex items-center gap-2">
                  <AlertCircle className="w-3 h-3 text-neutral-500" />
                  {msg}
                </span>
             ))}
          </div>
        ) : (
          <div className="text-xs text-neutral-600 font-mono pl-4 italic">No recent race control messages.</div>
        )}
      </div>
    </div>
  );
}