'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Zap, Clock, MessageSquare, ChevronRight, Activity, X, Loader2 } from 'lucide-react';
import { Header } from '../components/Header';
import { RaceControlBanner } from '../components/RaceControlBanner';
import { SidebarStandings } from '../components/SidebarStandings';
import { TrackMap } from '../components/TrackMap';
import { TelemetryDashboard } from '../components/TelemetryDashboard';
import { getTeamColor } from '../lib/constants';

// ─── Types for AI modal results ───────────────────────────────────────────────

interface OvertakeResult {
  driver: string;
  driver_pos: number;
  target: string;
  target_pos: number;
  gap_seconds: number;
  pace_delta_per_lap: number;
  drs_available: boolean;
  laps_to_catch: number | null;
  assessment: string;
  radio_message: string;
}

interface TireStrategyResult {
  driver: string;
  current_compound: string;
  tire_age: number;
  laps_remaining: number;
  laps_left_on_tire: number;
  pit_in_laps: number;
  urgency: string;
  recommended_compound: string;
  strategy: string;
  weather_temp: number;
  radio_message: string;
}

type AiModalState =
  | { kind: 'overtake'; loading: true; result: null; error: null }
  | { kind: 'overtake'; loading: false; result: OvertakeResult | null; error: string | null }
  | { kind: 'tire'; loading: true; result: null; error: null }
  | { kind: 'tire'; loading: false; result: TireStrategyResult | null; error: string | null };

export default function Home() {
  const [raceState, setRaceState] = useState<any>(null);
  const [selectedDriver, setSelectedDriver] = useState<number | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pitProjection, setPitProjection] = useState<any>(null);
  const [isProjecting, setIsProjecting] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarData, setCalendarData] = useState<any[]>([]);
  const sessionId = useRef('user_' + Math.floor(Math.random() * 99999));
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; driverId: number } | null>(null);
  const [nextSession, setNextSession] = useState<any>(null);

  // ─── AI modal state ───────────────────────────────────────────────────────
  const [showOvertakeModal, setShowOvertakeModal] = useState(false);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [overtakeResult, setOvertakeResult] = useState<OvertakeResult | null>(null);
  const [strategyResult, setStrategyResult] = useState<TireStrategyResult | null>(null);
  const [overtakeLoading, setOvertakeLoading] = useState(false);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [overtakeError, setOvertakeError] = useState<string | null>(null);
  const [strategyError, setStrategyError] = useState<string | null>(null);

  // Close context menu on click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    const connectWs = () => {
      const ws = new WebSocket('ws://localhost:8000/ws/race_data');
      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setRaceState(data);
        if (!selectedDriver && data.cars?.length > 0) {
          setSelectedDriver(data.cars[0].number);
        }
      };
      ws.onerror = () => setConnected(false);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connectWs, 3000);
      };
      wsRef.current = ws;
    };
    connectWs();
    return () => {
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch('http://localhost:8000/api/calendar')
      .then((r) => r.json())
      .then((d) => {
        const meetings = d.meetings || [];
        setCalendarData(meetings);
        // Find next session
        const now = new Date();
        const upcoming = meetings.find((m: any) => new Date(m.date_start) > now);
        setNextSession(upcoming);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;
    const fetchInsight = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/insights', {
          headers: { 'session-id': sessionId.current },
        });
        if (res.ok) {
          const d = await res.json();
          setInsight(d.insight);
        }
      } catch {}
    };
    fetchInsight();
    const iv = setInterval(fetchInsight, 10000);
    return () => clearInterval(iv);
  }, [isUnlocked]);

  // ─── Global keyboard navigation ──────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when typing inside an input / textarea / select
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      const cars: any[] = raceState?.cars ?? [];
      // Sort by position so index 0 = P1
      const sorted = [...cars].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));

      // Esc — close any open modal or deselect driver
      if (e.key === 'Escape') {
        if (showOvertakeModal) { setShowOvertakeModal(false); return; }
        if (showStrategyModal) { setShowStrategyModal(false); return; }
        setSelectedDriver(null);
        return;
      }

      if (!sorted.length) return;

      const currentIndex = selectedDriver
        ? sorted.findIndex((c: any) => c.number === selectedDriver)
        : -1;

      // ↑ / k — move to previous driver (lower position number = ahead)
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        const prev = currentIndex <= 0 ? sorted.length - 1 : currentIndex - 1;
        setSelectedDriver(sorted[prev].number);
        return;
      }

      // ↓ / j — move to next driver
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        const next =
          currentIndex < 0 || currentIndex >= sorted.length - 1 ? 0 : currentIndex + 1;
        setSelectedDriver(sorted[next].number);
        return;
      }

      // 1–9 — jump to that grid position
      const digit = parseInt(e.key, 10);
      if (!isNaN(digit) && digit >= 1 && digit <= 9) {
        const car = sorted[digit - 1];
        if (car) setSelectedDriver(car.number);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [raceState, selectedDriver, showOvertakeModal, showStrategyModal]);

  const handleDevUnlock = useCallback(async () => {
    await fetch(`http://localhost:8000/api/unlock_dev?session_id=${sessionId.current}`, { method: 'POST' });
    setIsUnlocked(true);
  }, []);

  const handlePitProjection = useCallback(async () => {
    if (!isUnlocked || !selectedDriver) return;
    setIsProjecting(true);
    setPitProjection(null);
    try {
      const res = await fetch(`http://localhost:8000/api/pit_projection?driver_number=${selectedDriver}`, {
        headers: { 'session-id': sessionId.current },
      });
      if (res.ok) setPitProjection(await res.json());
    } catch {}
    setIsProjecting(false);
  }, [isUnlocked, selectedDriver]);

  // ─── Overtake simulation ──────────────────────────────────────────────────
  const handleOvertakeSim = useCallback(async (driverId: number) => {
    setShowOvertakeModal(true);
    setOvertakeResult(null);
    setOvertakeError(null);

    if (!isUnlocked) {
      // Show unlock CTA instead of fetching
      setOvertakeLoading(false);
      return;
    }

    const cars: any[] = raceState?.cars ?? [];
    const driver = cars.find((c: any) => c.number === driverId);
    if (!driver) {
      setOvertakeError('Driver not found in current race state.');
      setOvertakeLoading(false);
      return;
    }

    // Find the car directly ahead
    const sorted = [...cars].sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
    const idx = sorted.findIndex((c: any) => c.number === driverId);
    const targetCar = idx > 0 ? sorted[idx - 1] : null;

    if (!targetCar) {
      setOvertakeError('This driver is leading — no car to overtake.');
      setOvertakeLoading(false);
      return;
    }

    setOvertakeLoading(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/overtake_simulation?driver_number=${driverId}&target_number=${targetCar.number}`,
        { headers: { 'session-id': sessionId.current } }
      );
      if (res.ok) {
        setOvertakeResult(await res.json());
      } else {
        const body = await res.json().catch(() => ({}));
        setOvertakeError(body.detail ?? 'Request failed.');
      }
    } catch {
      setOvertakeError('Network error — could not reach backend.');
    } finally {
      setOvertakeLoading(false);
    }
  }, [isUnlocked, raceState]);

  // ─── Tire strategy ────────────────────────────────────────────────────────
  const handleTireStrategy = useCallback(async (driverId: number) => {
    setShowStrategyModal(true);
    setStrategyResult(null);
    setStrategyError(null);

    if (!isUnlocked) {
      setStrategyLoading(false);
      return;
    }

    const session = raceState?.session;
    const lapsRemaining = session?.laps_remaining ?? session?.total_laps ?? 20;

    setStrategyLoading(true);
    try {
      const res = await fetch(
        `http://localhost:8000/api/tire_strategy?driver_number=${driverId}&laps_remaining=${lapsRemaining}`,
        { headers: { 'session-id': sessionId.current } }
      );
      if (res.ok) {
        setStrategyResult(await res.json());
      } else {
        const body = await res.json().catch(() => ({}));
        setStrategyError(body.detail ?? 'Request failed.');
      }
    } catch {
      setStrategyError('Network error — could not reach backend.');
    } finally {
      setStrategyLoading(false);
    }
  }, [isUnlocked, raceState]);

  /* ─── Loading State ─── */
  if (!raceState || !connected) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white font-[Outfit,sans-serif] overflow-hidden relative">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/10 blur-[120px] rounded-full pointer-events-none" />
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative z-10 flex flex-col items-center"
        >
          {/* F1 style Start Lights */}
          <div className="flex gap-4 mb-12 bg-neutral-900 p-5 rounded-2xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col gap-3">
                <div className="w-10 h-10 rounded-full bg-black border border-white/5 shadow-inner flex items-center justify-center relative overflow-hidden">
                  <motion.div 
                    initial={{ opacity: 0.05 }}
                    animate={{ opacity: [0.05, 1, 1, 0.05] }}
                    transition={{ 
                      duration: 2.5, 
                      repeat: Infinity, 
                      delay: i * 0.3,
                      times: [0, 0.1, 0.8, 0.85]
                    }}
                    className="absolute inset-0 bg-red-600 shadow-[0_0_30px_#ef4444]"
                  />
                </div>
                <div className="w-10 h-10 rounded-full bg-black border border-white/5 shadow-inner flex items-center justify-center relative overflow-hidden">
                   <motion.div 
                    initial={{ opacity: 0.05 }}
                    animate={{ opacity: [0.05, 1, 1, 0.05] }}
                    transition={{ 
                      duration: 2.5, 
                      repeat: Infinity, 
                      delay: i * 0.3,
                      times: [0, 0.1, 0.8, 0.85]
                    }}
                    className="absolute inset-0 bg-red-600 shadow-[0_0_30px_#ef4444]"
                  />
                </div>
              </div>
            ))}
          </div>

          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-5xl font-black italic tracking-tighter mb-6 text-transparent bg-clip-text bg-gradient-to-r from-white to-neutral-400"
          >
            GenieF1 <span className="text-red-600">Pro</span>
          </motion.h1>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center gap-3 bg-red-600/10 px-6 py-3 rounded-full border border-red-500/20 backdrop-blur-sm"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-[pulse_1s_ease-in-out_infinite] shadow-[0_0_12px_#ef4444]" />
            <p className="text-sm tracking-[0.4em] font-bold text-red-500 text-shadow-sm">CONNECTING TO GRID</p>
          </motion.div>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 1.2 }}
            className="text-xs font-mono mt-6 tracking-widest uppercase"
          >
            Establishing Live Telemetry Link...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  const selected = selectedDriver ? raceState.cars?.find((c: any) => c.number === selectedDriver) : null;
  const sess = raceState.session;
  const hasData = raceState.cars?.length > 0;
  const backendError = raceState.error as string | undefined;

  return (
    <main className="h-screen bg-neutral-950 text-white flex flex-col overflow-hidden font-[Outfit,sans-serif]">
      {/* HEADER */}
      <Header
        raceState={raceState}
        nextSession={nextSession}
        showCalendar={showCalendar}
        setShowCalendar={setShowCalendar}
        connected={connected}
        isUnlocked={isUnlocked}
        handleDevUnlock={handleDevUnlock}
      />

      {/* RACE CONTROL BANNER */}
      <RaceControlBanner raceState={raceState} />

      {/* Driver Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-[100] bg-neutral-900 border border-white/10 rounded-lg shadow-2xl py-1 w-48 font-mono text-xs overflow-hidden"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className="px-3 py-1.5 border-b border-white/10 bg-white/5">
              <span className="font-bold text-neutral-400 uppercase">Driver Options</span>
            </div>
            <button
              className="w-full text-left px-4 py-2 hover:bg-white/10 text-white flex items-center gap-2"
              onClick={() => {
                setSelectedDriver(contextMenu.driverId);
                handlePitProjection();
              }}
            >
              <Clock className="w-3 h-3 text-red-400" /> Sim Pit Stop
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-white/10 text-white flex items-center gap-2"
              onClick={() => {
                setSelectedDriver(contextMenu.driverId);
                handleOvertakeSim(contextMenu.driverId);
              }}
            >
              <Zap className="w-3 h-3 text-yellow-400" /> Sim Overtake (AI)
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-white/10 text-white flex items-center gap-2"
              onClick={() => {
                setSelectedDriver(contextMenu.driverId);
                handleTireStrategy(contextMenu.driverId);
              }}
            >
              <Activity className="w-3 h-3 text-blue-400" /> Tire Strategy (AI)
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Overtake Simulation Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {showOvertakeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowOvertakeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.93, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.93, y: 14 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-[min(460px,92vw)] bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-6 font-[Outfit,sans-serif]"
            >
              <button
                onClick={() => setShowOvertakeModal(false)}
                className="absolute top-4 right-4 text-neutral-500 hover:text-white"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-yellow-400" />
                <h3 className="font-black text-white text-sm uppercase tracking-widest">Overtake Simulation</h3>
              </div>

              {/* Locked */}
              {!isUnlocked && (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <span className="text-4xl">🔒</span>
                  <p className="text-sm text-neutral-400">AI Overtake Simulation is a Premium feature.</p>
                  <button
                    onClick={() => { handleDevUnlock(); setShowOvertakeModal(false); }}
                    className="bg-red-600 hover:bg-red-500 text-white font-bold px-5 py-2 rounded-xl text-sm transition-colors"
                  >
                    Unlock Premium (Dev)
                  </button>
                </div>
              )}

              {/* Loading */}
              {isUnlocked && overtakeLoading && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-9 h-9 text-yellow-400 animate-spin" />
                  <p className="text-xs font-mono text-neutral-400 animate-pulse">Simulating overtake...</p>
                </div>
              )}

              {/* Error */}
              {isUnlocked && !overtakeLoading && overtakeError && (
                <p className="text-sm text-red-400 font-mono text-center py-4">{overtakeError}</p>
              )}

              {/* Result */}
              {isUnlocked && !overtakeLoading && overtakeResult && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1">Attacker</p>
                      <p className="font-black text-white text-lg">{overtakeResult.driver}</p>
                      <p className="text-xs text-neutral-400">P{overtakeResult.driver_pos}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-1">Defender</p>
                      <p className="font-black text-white text-lg">{overtakeResult.target}</p>
                      <p className="text-xs text-neutral-400">P{overtakeResult.target_pos}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-black/40 rounded-lg p-2">
                      <p className="text-[9px] text-neutral-500 uppercase">Gap</p>
                      <p className="text-sm font-mono font-black text-white">{overtakeResult.gap_seconds}s</p>
                    </div>
                    <div className="bg-black/40 rounded-lg p-2">
                      <p className="text-[9px] text-neutral-500 uppercase">Δ pace/lap</p>
                      <p className="text-sm font-mono font-black text-yellow-400">
                        {overtakeResult.pace_delta_per_lap > 0 ? '+' : ''}{overtakeResult.pace_delta_per_lap}s
                      </p>
                    </div>
                    <div className="bg-black/40 rounded-lg p-2">
                      <p className="text-[9px] text-neutral-500 uppercase">Laps ETA</p>
                      <p className="text-sm font-mono font-black text-green-400">
                        {overtakeResult.laps_to_catch ?? '∞'}
                      </p>
                    </div>
                  </div>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                    <p className="text-[9px] text-blue-400 uppercase tracking-widest font-black mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3" /> Engineer Radio
                    </p>
                    <p className="text-sm text-neutral-200 italic font-serif leading-relaxed">
                      &ldquo;{overtakeResult.radio_message}&rdquo;
                    </p>
                  </div>
                  <p className="text-xs text-neutral-500 text-center">{overtakeResult.assessment}</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Tire Strategy Modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {showStrategyModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setShowStrategyModal(false)}
          >
            <motion.div
              initial={{ scale: 0.93, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.93, y: 14 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-[min(460px,92vw)] bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-6 font-[Outfit,sans-serif]"
            >
              <button
                onClick={() => setShowStrategyModal(false)}
                className="absolute top-4 right-4 text-neutral-500 hover:text-white"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-blue-400" />
                <h3 className="font-black text-white text-sm uppercase tracking-widest">Tire Strategy</h3>
              </div>

              {/* Locked */}
              {!isUnlocked && (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <span className="text-4xl">🔒</span>
                  <p className="text-sm text-neutral-400">AI Tire Strategy is a Premium feature.</p>
                  <button
                    onClick={() => { handleDevUnlock(); setShowStrategyModal(false); }}
                    className="bg-red-600 hover:bg-red-500 text-white font-bold px-5 py-2 rounded-xl text-sm transition-colors"
                  >
                    Unlock Premium (Dev)
                  </button>
                </div>
              )}

              {/* Loading */}
              {isUnlocked && strategyLoading && (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Loader2 className="w-9 h-9 text-blue-400 animate-spin" />
                  <p className="text-xs font-mono text-neutral-400 animate-pulse">Calculating tire strategy...</p>
                </div>
              )}

              {/* Error */}
              {isUnlocked && !strategyLoading && strategyError && (
                <p className="text-sm text-red-400 font-mono text-center py-4">{strategyError}</p>
              )}

              {/* Result */}
              {isUnlocked && !strategyLoading && strategyResult && (() => {
                const urgencyColor: Record<string, string> = {
                  CRITICAL: 'text-red-400',
                  HIGH: 'text-orange-400',
                  MEDIUM: 'text-yellow-400',
                  LOW: 'text-green-400',
                };
                return (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-3">
                      <div>
                        <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-0.5">Driver</p>
                        <p className="font-black text-white">{strategyResult.driver}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-neutral-500 uppercase tracking-widest mb-0.5">Urgency</p>
                        <p className={`font-black text-sm ${urgencyColor[strategyResult.urgency] ?? 'text-white'}`}>
                          {strategyResult.urgency}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-black/40 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-neutral-500 uppercase mb-1">Now on</p>
                        <p className="font-black text-white">{strategyResult.current_compound}</p>
                        <p className="text-xs text-neutral-400">Age: {strategyResult.tire_age} laps</p>
                      </div>
                      <div className="bg-black/40 rounded-xl p-3 text-center">
                        <p className="text-[9px] text-neutral-500 uppercase mb-1">Next compound</p>
                        <p className="font-black text-green-400">{strategyResult.recommended_compound}</p>
                        <p className="text-xs text-neutral-400">Box in ~{strategyResult.pit_in_laps} laps</p>
                      </div>
                    </div>
                    <div className="flex justify-between bg-black/30 rounded-lg px-4 py-2 text-xs font-mono">
                      <span className="text-neutral-400">Strategy</span>
                      <span className="font-black text-white">{strategyResult.strategy}</span>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                      <p className="text-[9px] text-blue-400 uppercase tracking-widest font-black mb-2 flex items-center gap-1.5">
                        <MessageSquare className="w-3 h-3" /> Engineer Radio
                      </p>
                      <p className="text-sm text-neutral-200 italic font-serif leading-relaxed">
                        &ldquo;{strategyResult.radio_message}&rdquo;
                      </p>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar Overlay */}
      <AnimatePresence>
        {showCalendar && (
          <motion.aside
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute right-5 top-16 z-[80] w-[340px] max-h-[70vh] bg-black/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <p className="text-[10px] tracking-[0.2em] uppercase font-black text-neutral-300">2026 Calendar</p>
              <button
                onClick={() => setShowCalendar(false)}
                className="text-[10px] font-bold text-neutral-400 hover:text-white"
              >
                CLOSE
              </button>
            </div>
            <div className="max-h-[calc(70vh-40px)] overflow-y-auto p-3 space-y-1.5">
              {calendarData.length === 0 && <p className="text-xs text-neutral-500 p-3">Loading...</p>}
              {calendarData.map((m: any, i: number) => (
                <div
                  key={`${m.meeting_key || 'm'}-${i}`}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <p className="text-sm font-semibold text-neutral-200">{m.meeting_name || m.meeting_official_name}</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {m.circuit_short_name}
                    {m.country_name ? `, ${m.country_name}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* MAIN GRID */}
      <div className="flex-1 flex overflow-hidden p-4 gap-4 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] bg-neutral-950">
        {/* LEFT: STANDINGS */}
        <SidebarStandings
          raceState={raceState}
          hasData={hasData}
          backendError={backendError}
          selectedDriver={selectedDriver}
          setSelectedDriver={setSelectedDriver}
          setContextMenu={setContextMenu}
        />

        {/* CENTER: REAL TRACK MAP */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Track Map Widget */}
          <div className="flex-[3] bg-black/80 backdrop-blur-2xl rounded-2xl border border-white/5 shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden relative group">
            <div className="absolute top-4 left-4 flex items-center gap-3 z-30">
              <h2 className="text-xs font-black uppercase text-white tracking-[0.4em] drop-shadow-lg">
                <span className="text-red-500 mr-2 ml-1">●</span>
                {sess?.circuit || 'Circuit'} <span className="text-neutral-500 mx-2">|</span> 3D VISUALIZATION
              </h2>
            </div>

            {/* Legend */}
            <div className="absolute top-4 right-4 z-30 flex items-center gap-3">
              {selected && (() => {
                const color = selected.color?.startsWith('#') ? selected.color : `#${selected.color || '888'}`;
                return (
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur-xl px-3 py-1.5 rounded-lg border border-white/20 shadow-xl">
                    <style>{`.dynamic-driver-color { background-color: ${color}; color: ${color}; }`}</style>
                    <div className="w-2.5 h-2.5 rounded-full animate-pulse shadow-[0_0_10px_currentColor] dynamic-driver-color" />
                    <span className="text-[10px] font-black tracking-widest text-white uppercase">{selected.id} Telemetry Focus</span>
                  </div>
                );
              })()}
            </div>

            <div className="flex-1 relative w-full h-full p-2">
              {!hasData ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-neutral-600 font-mono text-sm animate-pulse">Awaiting GPS data...</p>
                </div>
              ) : (
                <TrackMap
                  trackOutline={raceState.track_outline || []}
                  cars={raceState.cars || []}
                  positionTrails={raceState.position_trails || {}}
                  selectedDriver={selectedDriver}
                  onSelectDriver={setSelectedDriver}
                  circuitName={sess?.circuit}
                />
              )}
            </div>

            <div className="absolute bottom-3 right-3 text-right">
              <p className="text-[9px] font-mono text-neutral-600">
                {raceState.track_outline?.length || 0} track points • {Object.keys(raceState.position_trails || {}).length} drivers tracked
              </p>
            </div>
          </div>

          {/* AI Strategy Strip */}
          <div className="bg-black/60 backdrop-blur-md rounded-xl border border-white/10 p-4 flex flex-col shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400">
                <Zap className="w-3 h-3 text-red-500" /> AI Strategy Copilot
              </h3>
              {isUnlocked && selected && (
                <button
                  onClick={handlePitProjection}
                  disabled={isProjecting}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5"
                >
                  {isProjecting ? (
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-red-400" />
                  )}
                  {isProjecting ? 'SIMULATING...' : `BOX #${selectedDriver}`}
                </button>
              )}
            </div>

            {!isUnlocked ? (
              <div className="flex-1 flex items-center justify-center p-4 border border-dashed border-white/10 rounded-lg bg-white/5">
                <p className="text-xs font-mono text-neutral-500 text-center">
                  <span className="inline-block mr-1.5 text-neutral-600 mb-0.5" >🔒</span>
                  AI features locked.{' '}
                  <button onClick={handleDevUnlock} className="text-red-400 font-bold hover:underline">
                    Unlock Premium
                  </button>
                </p>
              </div>
            ) : pitProjection ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                <div className="bg-gradient-to-br from-red-600/20 to-black border border-red-500/30 rounded-xl p-4 text-center min-w-[120px]">
                  <p className="text-[9px] text-red-400 font-black uppercase tracking-[0.2em] mb-1">Re-entry</p>
                  <p className="text-4xl font-mono font-black text-white">P{pitProjection.predicted_position}</p>
                  {pitProjection.positions_lost > 0 && (
                    <p className="text-[10px] text-red-400 mt-1 font-bold">-{pitProjection.positions_lost} spots</p>
                  )}
                </div>
                <div className="flex-1 bg-gradient-to-r from-blue-500/10 to-transparent border border-blue-500/20 rounded-xl p-4 flex flex-col justify-center">
                  <p className="text-[9px] text-blue-400 font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3" /> Engineer
                  </p>
                  <p className="text-sm text-neutral-200 italic font-serif leading-relaxed">
                    &ldquo;{pitProjection.insight}&rdquo;
                  </p>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-3 border border-dashed border-white/10 rounded-lg">
                <p className="text-xs font-mono text-neutral-600 text-center">
                  Select a driver → Evaluate Box to run pit stop simulation.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: TELEMETRY */}
        <TelemetryDashboard selected={selected} isUnlocked={isUnlocked} insight={insight} />
      </div>
    </main>
  );
}
