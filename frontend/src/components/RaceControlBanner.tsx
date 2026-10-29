import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Flag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface RaceControlMsg {
  message: string;
  category?: string;
  flag?: string;
  scope?: string;
}

interface RaceControlBannerProps {
  raceState: any;
}

function flagStyles(flag?: string): { border: string; bg: string; text: string; glow: string; } {
  switch (flag?.toUpperCase()) {
    case 'RED':
      return { border: 'border-red-500', bg: 'bg-red-600/20', text: 'text-red-400', glow: 'shadow-[0_0_12px_rgba(239,68,68,0.4)]' };
    case 'YELLOW':
    case 'SC':
      return { border: 'border-yellow-400', bg: 'bg-yellow-400/20', text: 'text-yellow-300', glow: 'shadow-[0_0_12px_rgba(234,179,8,0.4)]' };
    case 'VSC':
      return { border: 'border-yellow-300', bg: 'bg-yellow-300/15', text: 'text-yellow-200', glow: 'shadow-[0_0_10px_rgba(253,224,71,0.3)]' };
    case 'BLUE':
      return { border: 'border-blue-400', bg: 'bg-blue-500/20', text: 'text-blue-300', glow: 'shadow-[0_0_12px_rgba(59,130,246,0.4)]' };
    case 'GREEN':
      return { border: 'border-green-400', bg: 'bg-green-500/20', text: 'text-green-300', glow: 'shadow-[0_0_12px_rgba(34,197,94,0.4)]' };
    case 'CHEQUERED':
      return { border: 'border-white', bg: 'bg-white/10', text: 'text-white', glow: 'shadow-[0_0_12px_rgba(255,255,255,0.3)]' };
    default:
      return { border: 'border-white/20', bg: 'bg-white/5', text: 'text-neutral-300', glow: '' };
  }
}

function prominentBannerClass(flag?: string): string {
  switch (flag?.toUpperCase()) {
    case 'RED':
      return 'bg-red-600 text-white border-y border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.5)]';
    case 'YELLOW':
    case 'SC':
      return 'bg-yellow-400 text-black border-y border-yellow-300 shadow-[0_0_30px_rgba(234,179,8,0.5)]';
    case 'VSC':
      return 'bg-yellow-300 text-black border-y border-yellow-200 shadow-[0_0_20px_rgba(253,224,71,0.4)]';
    case 'GREEN':
      return 'bg-green-600 text-white border-y border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.4)]';
    case 'CHEQUERED':
      return 'bg-neutral-800 text-white border-y border-white/30';
    default:
      return 'bg-neutral-800 text-white border-y border-white/20';
  }
}

export function RaceControlBanner({ raceState }: RaceControlBannerProps) {
  const backendError: string | undefined = raceState?.error;
  const messages: RaceControlMsg[] = raceState?.race_control ?? [];

  const [displayedMsgs, setDisplayedMsgs] = useState<(RaceControlMsg & { key: string })[]>([]);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!messages.length) return;
    const incoming = messages.map((m, i) => ({ ...m, key: `${m.message}-${i}` }));
    const newOnes = incoming.filter((m) => !seenRef.current.has(m.key));
    if (newOnes.length > 0) {
      newOnes.forEach((m) => seenRef.current.add(m.key));
      setDisplayedMsgs(incoming.slice(0, 8));
    } else if (displayedMsgs.length === 0) {
      setDisplayedMsgs(incoming.slice(0, 8));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const latestFlag = messages.find(
    (rc) => rc.flag === 'RED' || rc.flag === 'YELLOW' || rc.flag === 'VSC' ||
            rc.flag === 'SC' || rc.flag === 'GREEN' || rc.flag === 'CHEQUERED'
  );

  return (
    <>
      <AnimatePresence>
        {backendError && (
          <motion.div
            key="error-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-5 py-2 border-b border-amber-500/30 bg-amber-500/10 text-amber-200 shrink-0 overflow-hidden"
          >
            <p className="text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-amber-300" />
              {backendError}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {latestFlag && (
          <motion.div
            key={`flag-${latestFlag.flag}-${latestFlag.message}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`w-full py-1.5 flex items-center justify-center gap-4 shrink-0 ${prominentBannerClass(latestFlag.flag)}`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="font-black tracking-[0.35em] uppercase text-sm">
              {latestFlag.flag} FLAG{latestFlag.scope ? ` — ${latestFlag.scope}` : ''} • {latestFlag.message}
            </span>
            <AlertTriangle className="w-4 h-4 shrink-0" />
          </motion.div>
        )}
      </AnimatePresence>

      {messages.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-white/10 bg-black/70 backdrop-blur-md overflow-x-auto scrollbar-hide min-h-[32px]">
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-neutral-500 shrink-0 mr-1">RC</span>
          <div className="flex gap-2 items-center overflow-x-auto scrollbar-hide">
            <AnimatePresence initial={false}>
              {displayedMsgs.map((rc, i) => {
                const styles = flagStyles(rc.flag);
                return (
                  <motion.span
                    key={rc.key}
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.35, delay: i * 0.04, ease: 'easeOut' }}
                    className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold whitespace-nowrap border ${styles.border} ${styles.bg} ${styles.text} ${styles.glow} shrink-0`}
                  >
                    <Flag className="w-2.5 h-2.5 inline mr-1 mb-0.5 opacity-70" />
                    {rc.message}
                  </motion.span>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {messages.length === 0 && (
        <div className="shrink-0 flex items-center px-4 py-1.5 border-b border-white/5 bg-black/40 min-h-[32px]">
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-neutral-700 shrink-0">RC — No messages</span>
        </div>
      )}
    </>
  );
}
