import React from 'react';
import dynamic from 'next/dynamic';

const TrackMap3D = dynamic(() => import('./TrackMap3D'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-neutral-900 rounded-lg">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-neutral-600 border-t-red-500 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-neutral-500 font-mono text-xs uppercase tracking-widest animate-pulse">Initializing 3D Map Engine...</p>
      </div>
    </div>
  ),
});

interface TrackMapProps {
  trackOutline: number[][];
  cars: any[];
  positionTrails: Record<string, number[][]>;
  selectedDriver: number | null;
  onSelectDriver: (n: number) => void;
  circuitName?: string;
}

export function TrackMap(props: TrackMapProps) {
  return <TrackMap3D {...props} />;
}
