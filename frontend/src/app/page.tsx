'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Zap, Clock, MessageSquare, ChevronRight, Activity } from 'lucide-react';
import { Header } from '../components/Header';
import { RaceControlBanner } from '../components/RaceControlBanner';
import { SidebarStandings } from '../components/SidebarStandings';
import { TrackMap } from '../components/TrackMap';
import { TelemetryDashboard } from '../components/TelemetryDashboard';
import { getTeamColor } from '../lib/constants';

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
              }}
            >
              <Zap className="w-3 h-3 text-yellow-400" /> Sim Overtake (AI)
            </button>
            <button
              className="w-full text-left px-4 py-2 hover:bg-white/10 text-white flex items-center gap-2"
              onClick={() => {
                setSelectedDriver(contextMenu.driverId);
              }}
            >
              <Activity className="w-3 h-3 text-blue-400" /> Tire Strategy (AI)
            </button>
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
