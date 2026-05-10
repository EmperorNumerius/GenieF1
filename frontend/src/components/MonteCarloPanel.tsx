import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchApi } from '../lib/api';

interface MonteCarloPrediction {
  id: string;
  name: string;
  win_probability: number;
  podium_probability: number;
  expected_position: number;
}

interface MonteCarloPanelProps {
  isUnlocked: boolean;
}

export function MonteCarloPanel({ isUnlocked }: MonteCarloPanelProps) {
  const [predictions, setPredictions] = useState<MonteCarloPrediction[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isUnlocked) return;

    let isMounted = true;

    const fetchPredictions = async () => {
      setLoading(true);
      try {
        const res = await fetchApi<{ predictions: MonteCarloPrediction[] }>('/api/monte_carlo?simulations=1000');
        if (isMounted) setPredictions(res.predictions);
      } catch (e) {
        console.error("Monte Carlo fetch failed", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPredictions();
    const interval = setInterval(fetchPredictions, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isUnlocked]);

  if (!isUnlocked) return null;

  return (
    <div className="bg-black/80 backdrop-blur-md border border-white/10 rounded-xl p-3 flex flex-col h-64">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-300">Monte Carlo Sim</h3>
        {loading && <Loader2 className="w-3 h-3 text-neutral-500 animate-spin" />}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
        {predictions.slice(0, 10).map((p) => (
          <div key={p.id} className="flex items-center gap-2 mb-1.5 text-[10px]">
             <span className="font-mono font-bold w-6 text-neutral-400">{p.id}</span>
             <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/5 relative">
               <div
                 className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-600 to-blue-500 rounded-full"
                 style={{ width: `${Math.min(100, p.win_probability * 100)}%` }}
               />
             </div>
             <span className="font-mono w-10 text-right text-neutral-300">
               {(p.win_probability * 100).toFixed(1)}%
             </span>
          </div>
        ))}
        {predictions.length === 0 && !loading && (
          <div className="text-center text-xs text-neutral-500 mt-8">Awaiting data...</div>
        )}
      </div>
    </div>
  );
}