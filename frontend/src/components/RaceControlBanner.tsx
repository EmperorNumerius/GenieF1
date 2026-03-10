import React from 'react';
import { AlertTriangle, Flag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RaceControlBannerProps {
  raceState: any;
}

export function RaceControlBanner({ raceState }: RaceControlBannerProps) {
  if (!raceState || !raceState.race_control || raceState.race_control.length === 0) {
    return null;
  }

  const backendError: string | undefined = raceState.error;

  return (
    <>
      {/* Error Banner */}
      <AnimatePresence>
        {backendError && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="px-5 py-2 border-b border-amber-500/30 bg-amber-500/10 text-amber-200 shrink-0"
          >
            <p className="text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-amber-300" />
              {backendError}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {raceState.race_control?.length > 0 && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="flex flex-col shrink-0">
            {/* Find the most recent flag to show a prominent banner */}
            {(() => {
              const latestFlag = raceState.race_control.find(
                (rc: any) => rc.flag === 'RED' || rc.flag === 'YELLOW' || rc.flag === 'VSC' || rc.flag === 'SC'
              );
              if (latestFlag) {
                const bg = latestFlag.flag === 'RED' ? 'bg-red-600 text-white' : 'bg-yellow-400 text-black';
                return (
                  <div className={`w-full py-1 ${bg} flex items-center justify-center gap-4 border-y border-white/20 shadow-lg`}>
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-black tracking-[0.3em] uppercase text-sm">
                      {latestFlag.flag} FLAG • {latestFlag.message}
                    </span>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                );
              }
              return null;
            })()}

            {/* Scrollable ticker for other messages */}
            <div className="flex gap-2 px-5 py-1.5 border-b border-white/5 bg-black/50 overflow-x-auto scrollbar-hide">
              {raceState.race_control.map((rc: any, i: number) => (
                <span
                  key={i}
                  className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold whitespace-nowrap border ${
                    rc.flag === 'RED'
                      ? 'bg-red-600/20 text-red-500 border-red-600/30'
                      : rc.flag === 'YELLOW'
                      ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30'
                      : 'bg-white/5 text-neutral-400 border-white/10'
                  }`}
                >
                  <Flag className="w-2.5 h-2.5 inline mr-1 mb-0.5" />
                  {rc.message}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
