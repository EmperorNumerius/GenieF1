'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, Clock, Zap, Lock, Unlock, MessageSquare, ChevronRight, Calendar, Flag, Gauge, Battery, Wind, Thermometer, Cloud, AlertTriangle, Map } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

const TIRE_COLORS: Record<string, string> = {
  SOFT: '#ef4444', // red-500
  MEDIUM: '#eab308', // yellow-500
  HARD: '#f3f4f6', // gray-100
  INTERMEDIATE: '#22c55e', // green-500
  WET: '#3b82f6', // blue-500
  Unknown: '#6b7280', // gray-500
};

// Abstract F1 Circuit Path for the Map
const TRACK_PATH = "M 150,250 C 50,250 50,150 150,100 C 250,50 350,150 450,150 C 550,150 650,50 750,100 C 850,150 850,250 750,250 C 650,250 600,150 450,200 C 300,250 250,250 150,250 Z";

function formatInterval(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return '---';
  if (typeof val === 'number') return val > 0 ? `+${val.toFixed(3)}s` : `${val.toFixed(3)}s`;
  return String(val);
}

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
      ws.onclose = () => { setConnected(false); setTimeout(connectWs, 3000); };
      wsRef.current = ws;
    };
    connectWs();
    return () => { if (wsRef.current) wsRef.current.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch('http://localhost:8000/api/calendar')
      .then(r => r.json())
      .then(d => setCalendarData(d.meetings || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isUnlocked) return;
    const fetchInsight = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/insights', { headers: { 'session-id': sessionId.current } });
        if (res.ok) { const d = await res.json(); setInsight(d.insight); }
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
        headers: { 'session-id': sessionId.current }
      });
      if (res.ok) setPitProjection(await res.json());
    } catch {}
    setIsProjecting(false);
  }, [isUnlocked, selectedDriver]);

  if (!raceState || !connected) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white" style={{ fontFamily: "'Outfit', sans-serif" }}>
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm tracking-[0.3em] uppercase text-neutral-500 font-bold">Connecting to OpenF1 Live...</p>
          <p className="text-xs text-neutral-700 mt-2">Loading latest telemetry stream</p>
        </div>
      </div>
    );
  }

  const selected = selectedDriver ? raceState.cars.find((c: any) => c.number === selectedDriver) : null;
  const sess = raceState.session;
  const weather = raceState.weather;
  const hasData = raceState.cars.length > 0;
  
  // Base lap time used to approximate map positions (if data missing, assume 90s lap)
  const avgLapTime = raceState.cars?.[0]?.last_lap_time || 90;

  return (
    <main className="h-screen bg-neutral-950 text-white flex flex-col overflow-hidden" style={{ fontFamily: "'Outfit', sans-serif" }}>
      
      {/* ═══ HEADER ═══ */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-black/80 backdrop-blur-xl shrink-0 z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-red-600 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
            <span className="text-2xl font-black tracking-wider">Genie<span className="text-red-600">F1</span></span>
          </div>
          {sess && (
            <div className="flex items-center gap-3">
              <span className="text-xs bg-red-600/20 text-red-400 border border-red-600/30 px-3 py-1 rounded-full font-bold uppercase tracking-widest shadow-[0_0_12px_rgba(220,38,38,0.2)]">
                {sess.year} • {sess.type}
              </span>
              <span className="text-sm font-semibold text-neutral-200">{sess.meeting_name}</span>
              <span className="text-xs font-mono text-neutral-500">— {sess.circuit}, {sess.country}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-6">
          {weather && (
            <div className="flex items-center gap-4 text-xs font-mono text-neutral-400 bg-white/5 px-4 py-1.5 rounded-full border border-white/5">
              {weather.air_temp !== null && <span className="flex items-center gap-1.5"><Thermometer className="w-4 h-4 text-blue-400" />{weather.air_temp}°C</span>}
              {weather.track_temp !== null && <span className="text-orange-400">Track {weather.track_temp}°C</span>}
              {weather.rainfall !== null && weather.rainfall > 0 && <span className="flex items-center gap-1 text-blue-500"><Cloud className="w-4 h-4" /> Rain</span>}
            </div>
          )}
          
          <button onClick={() => setShowCalendar(!showCalendar)} className="flex items-center gap-2 text-xs font-bold text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-all duration-300">
            <Calendar className="w-4 h-4" /> CALENDAR
          </button>

          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-full shadow-inner">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className={`font-mono text-xs font-bold tracking-widest ${connected ? 'text-green-500' : 'text-red-500'}`}>{connected ? 'LIVE' : 'OFFLINE'}</span>
          </div>

          {!isUnlocked ? (
            <button onClick={handleDevUnlock} className="bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border border-red-400/50 shadow-[0_0_20px_rgba(220,38,38,0.5)] transition-all duration-300 transform hover:scale-105 active:scale-95">
              <Lock className="w-4 h-4" /> UNLOCK PREMIUM
            </button>
          ) : (
            <span className="text-xs text-green-400 flex items-center gap-2 bg-green-500/10 border border-green-500/20 px-4 py-1.5 rounded-lg font-bold shadow-[0_0_15px_rgba(34,197,94,0.2)]">
              <Unlock className="w-4 h-4" /> PREMIUM ACTIVATED
            </span>
          )}
        </div>
      </header>

      {/* ═══ RACE CONTROL BANNER ═══ */}
      <AnimatePresence>
        {raceState.race_control?.length > 0 && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} className="flex gap-2 px-6 py-2 border-b border-white/5 bg-neutral-900/50 overflow-x-auto shrink-0 scrollbar-hide">
            {raceState.race_control.map((rc: any, i: number) => (
              <span key={i} className={`text-xs px-3 py-1 rounded-md font-bold whitespace-nowrap border ${rc.flag === 'RED' ? 'bg-red-600/20 text-red-500 border-red-600/30' : rc.flag === 'YELLOW' ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' : 'bg-white/5 text-neutral-400 border-white/10'}`}>
                <Flag className="w-3 h-3 inline mr-1.5 mb-0.5" />
                {rc.message}
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden p-4 gap-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 via-black to-black">
        
        {/* ──── LEFT: STANDINGS ──── */}
        <div className="w-[320px] flex flex-col bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent">
            <h2 className="text-xs font-black uppercase text-neutral-400 tracking-[0.2em] flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-500" /> Live Standings
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <LayoutGroup>
              {!hasData && <p className="text-neutral-500 text-sm text-center mt-10 p-4">No cars currently tracked. Waiting for API...</p>}
              {raceState.cars?.map((car: any) => {
                const isSelected = selectedDriver === car.number;
                const tireColor = TIRE_COLORS[car.tire?.toUpperCase()] || '#666';
                const teamColor = car.color?.startsWith('#') ? car.color : `#${car.color || '888'}`;
                return (
                  <motion.div
                    layout
                    key={car.number}
                    onClick={() => setSelectedDriver(car.number)}
                    className={`flex items-center gap-3 p-3 cursor-pointer border-b border-white/5 transition-all duration-300 ${isSelected ? 'bg-white/10 border-l-2' : 'hover:bg-white/5 border-l-2'}`}
                    style={{ borderLeftColor: isSelected ? teamColor : 'transparent' }}
                  >
                    <span className="w-6 text-right font-mono text-sm font-bold text-neutral-500">{car.pos || '-'}</span>
                    <div className="w-1 h-8 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: teamColor, color: teamColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-neutral-100">{car.id}</span>
                        <span className="text-xs text-neutral-500 truncate">{car.name?.split(' ').pop()}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: tireColor, boxShadow: `0 0 5px ${tireColor}` }} />
                        <span className="text-[10px] font-mono text-neutral-400">{car.tire || '?'} L{car.tire_age || 0}</span>
                        {car.drs > 10 && <span className="text-[8px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-bold tracking-widest border border-green-500/30">DRS</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs font-bold text-neutral-300">{car.pos === 1 ? 'Leader' : formatInterval(car.interval)}</p>
                      <p className="font-mono text-[10px] text-neutral-600 mt-1">{car.speed || 0} km/h</p>
                    </div>
                  </motion.div>
                );
              })}
            </LayoutGroup>
          </div>
        </div>

        {/* ──── CENTER: TRACK MAP & AI ──── */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          
          {/* Track Map Widget */}
          <div className="flex-[2] bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col overflow-hidden relative group">
            <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
              <Map className="w-5 h-5 text-neutral-400" />
              <h2 className="text-xs font-black uppercase text-neutral-400 tracking-[0.2em]">Circuit Radar</h2>
            </div>
            {/* Ambient map glow */}
            <div className="absolute inset-0 bg-red-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 blur-3xl pointer-events-none" />
            
            <div className="flex-1 relative w-full h-full flex items-center justify-center p-8">
              {!hasData ? (
                 <p className="text-neutral-600 font-mono text-sm animate-pulse">Awaiting GPS data sync...</p>
              ) : (
                <div className="relative w-full max-w-[800px] aspect-[2/1] scale-90 sm:scale-100">
                  <svg viewBox="0 0 900 350" className="w-full h-full drop-shadow-2xl overflow-visible">
                    <defs>
                      <linearGradient id="neonTrack" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.1)" />
                      </linearGradient>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                        <feMerge>
                          <feMergeNode in="coloredBlur"/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    
                    {/* The Track Path */}
                    <path 
                      id="f1-track"
                      d={TRACK_PATH}
                      fill="none" 
                      stroke="url(#neonTrack)" 
                      strokeWidth="12" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    />
                    <path 
                      d={TRACK_PATH}
                      fill="none" 
                      stroke="rgba(0,0,0,0.6)" 
                      strokeWidth="6" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    />

                    {/* Plot Drivers on Path using SVG motion */}
                    {raceState.cars?.map((car: any) => {
                      // Approximate progress based on gap to leader
                      const gap = typeof car.gap_to_leader === 'number' ? car.gap_to_leader : (car.pos - 1) * 2;
                      const progress = Math.max(0, Math.min(100, 100 - ((gap % avgLapTime) / avgLapTime * 100)));
                      
                      const isSelected = selectedDriver === car.number;
                      const teamColor = car.color?.startsWith('#') ? car.color : `#${car.color || '888'}`;
                      
                      return (
                        <g key={`map-${car.number}`} style={{
                          offsetPath: `path('${TRACK_PATH}')`,
                          offsetDistance: `${progress}%`,
                          transition: 'offset-distance 1s linear',
                        }} className={`origin-center ${isSelected ? 'z-50' : 'z-10'}`}>
                          <circle r={isSelected ? "14" : "8"} fill={teamColor} stroke="#fff" strokeWidth={isSelected ? "3" : "1.5"} filter="url(#glow)" />
                          {isSelected && (
                             <text y="-20" textAnchor="middle" fill="#fff" className="font-mono text-[14px] font-bold drop-shadow-xl select-none">
                               {car.id}
                             </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}
            </div>
            
            <div className="absolute bottom-4 right-4 text-right">
              <p className="font-mono text-xs text-neutral-500 mb-1 tracking-widest">MAP MODE: <span className="text-white font-bold">RELATIVE</span></p>
              <p className="text-[10px] text-neutral-600">Calculated via Delta to Leader</p>
            </div>
          </div>

          {/* AI Strategy Strip */}
          <div className="bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 p-5 flex flex-col shrink-0">
            <div className="flex items-center justify-between mb-4">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                <Zap className="w-4 h-4 text-red-500" /> Premium AI Strategy Copilot
              </h3>
              {isUnlocked && selected && (
                <button onClick={handlePitProjection} disabled={isProjecting} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 flex items-center gap-2 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                  {isProjecting ? <Clock className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4 text-red-400" />}
                  {isProjecting ? 'SIMULATING...' : `EVALUATE BOX FOR #${selectedDriver}`}
                </button>
              )}
            </div>

            {!isUnlocked ? (
               <div className="flex-1 flex items-center justify-center p-6 border border-dashed border-white/10 rounded-xl bg-white/5">
                 <p className="text-sm font-mono text-neutral-500 text-center">
                   <Lock className="w-5 h-5 inline mr-2 text-neutral-600 mb-1" />
                   AI features locked. <button onClick={handleDevUnlock} className="text-red-400 font-bold hover:underline mix-blend-screen">Unlock Premium</button> to access predictive re-entry & radio hints.
                 </p>
               </div>
            ) : pitProjection ? (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4">
                <div className="bg-gradient-to-br from-red-600/20 to-black border border-red-500/30 rounded-xl p-6 text-center shadow-[inset_0_0_20px_rgba(220,38,38,0.1)] min-w-[160px]">
                  <p className="text-[10px] text-red-400 font-black uppercase tracking-[0.2em] mb-2">Re-entry Pos</p>
                  <p className="text-5xl font-mono font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">P{pitProjection.predicted_position}</p>
                  {pitProjection.positions_lost > 0 && <p className="text-xs text-red-400 mt-2 font-bold bg-red-500/10 rounded-md py-1 px-2 border border-red-500/20">-{pitProjection.positions_lost} spots</p>}
                </div>
                <div className="flex-1 bg-gradient-to-r from-blue-500/10 to-transparent border border-blue-500/20 rounded-xl p-6 relative overflow-hidden flex flex-col justify-center">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full" />
                  <p className="text-[10px] text-blue-400 font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2"><MessageSquare className="w-3 h-3" /> Race Engineer Script</p>
                  <p className="text-lg text-neutral-200 italic font-serif leading-relaxed drop-shadow-md">
                    &ldquo;{pitProjection.insight}&rdquo;
                  </p>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 border border-dashed border-white/10 rounded-xl">
                 <p className="text-sm font-mono text-neutral-600 text-center">Select a driver on the left and hit Evaluate Box to run pit stop monte-carlo simulation.</p>
              </div>
            )}
          </div>
        </div>

        {/* ──── RIGHT: TELEMETRY ──── */}
        <div className="w-[340px] flex flex-col bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative">
           <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 blur-3xl pointer-events-none rounded-full" />
           
           {!selected ? (
              <div className="flex-1 flex items-center justify-center text-neutral-600 font-mono text-sm p-8 text-center">
                Awaiting driver selection for detailed telemetry feed...
              </div>
           ) : (
             <>
                <div className="p-6 border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent relative z-10 flex items-center gap-4">
                   <div className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-black font-mono shadow-[0_0_20px_currentColor] border-2 bg-black overflow-hidden" 
                        style={{ borderColor: selected.color?.startsWith('#') ? selected.color : `#${selected.color || '888'}`, 
                                 color: selected.color?.startsWith('#') ? selected.color : `#${selected.color || '888'}` }}>
                      <div className="absolute inset-0 opacity-20 bg-current mix-blend-screen" />
                      <span className="relative z-10">{selected.number}</span>
                   </div>
                   <div>
                     <h2 className="text-xl font-bold tracking-tight text-white mb-1">{selected.name}</h2>
                     <p className="text-xs font-black uppercase text-neutral-400 tracking-wider bg-white/10 inline-block px-2 py-1 rounded border border-white/10">{selected.team}</p>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent flex flex-col gap-4 relative z-10">
                  
                  {/* Speed & Position */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center backdrop-blur-sm relative overflow-hidden group">
                      <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-duration-500" />
                      <p className="text-[9px] text-neutral-500 font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5"><Gauge className="w-3 h-3 text-blue-400" /> Speed</p>
                      <p className="text-3xl font-mono font-black text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">{selected.speed || 0}</p>
                      <p className="text-xs font-mono text-blue-400/80 mt-1">km/h</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center backdrop-blur-sm relative overflow-hidden group">
                      <div className="absolute inset-0 bg-amber-500/10 opacity-0 group-hover:opacity-100 transition-duration-500" />
                      <p className="text-[9px] text-neutral-500 font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5"><Activity className="w-3 h-3 text-amber-400" /> Position</p>
                      <p className="text-3xl font-mono font-black text-white">P{selected.pos}</p>
                      <p className="text-[10px] font-mono text-neutral-500 mt-1">{formatInterval(selected.gap_to_leader)} to P1</p>
                    </div>
                  </div>

                  {/* Sector Times */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 relative overflow-hidden">
                    <div className="flex justify-between items-center mb-4">
                      <p className="text-[10px] text-neutral-400 font-black uppercase tracking-[0.2em]"><Clock className="w-3 h-3 inline mr-1" /> Latest Lap</p>
                      <span className="font-mono text-xs bg-white/10 px-2 py-0.5 rounded text-neutral-300 font-bold border border-white/5">L{selected.lap_number || '-'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center relative z-10">
                      {[
                        { label: 'S1', val: selected.sector_1, color: 'text-purple-400' },
                        { label: 'S2', val: selected.sector_2, color: 'text-green-400' },
                        { label: 'S3', val: selected.sector_3, color: 'text-orange-400' }
                      ].map(s => (
                        <div key={s.label} className="bg-black/40 border border-white/5 rounded-lg py-3">
                           <p className="text-[9px] text-neutral-500 font-bold mb-1">{s.label}</p>
                           <p className={`font-mono text-sm font-bold ${s.val ? s.color : 'text-neutral-600'}`}>{s.val ? s.val.toFixed(3) : '---'}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tires */}
                  <div className="bg-gradient-to-br from-white/5 to-black/50 border border-white/10 rounded-xl p-5">
                    <p className="text-[10px] text-neutral-400 font-black uppercase tracking-[0.2em] mb-4">Tyre Condition Estimate</p>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[8px] bg-white ring-2 ring-offset-2 ring-transparent shadow-lg text-black"
                             style={{ background: TIRE_COLORS[selected.tire?.toUpperCase()] || '#666', filter: 'brightness(1.2)' }}>
                          {selected.tire?.charAt(0) || '?'}
                        </div>
                        <span className="font-bold text-lg">{selected.tire || 'Unknown'}</span>
                      </div>
                      <span className="font-mono text-xs font-bold text-neutral-400 bg-white/10 border border-white/5 rounded px-2 py-1">{selected.tire_age || 0} LAPS</span>
                    </div>
                    {/* Wear Bar */}
                    <div className="h-2 bg-neutral-900 rounded-full overflow-hidden border border-black inset-shadow shadow-inner">
                      <div className={`h-full opacity-90 transition-all duration-1000 ${((selected.tire_age || 0) > 20) ? 'bg-red-500' : ((selected.tire_age || 0) > 10) ? 'bg-orange-500' : 'bg-green-500'}`} 
                           style={{ width: `${Math.max(5, 100 - (selected.tire_age || 0) * 3)}%` }} />
                    </div>
                  </div>

                  {/* DRS & ERS (Abstracted) */}
                  <div className="flex gap-4">
                    <div className={`flex-1 rounded-xl p-4 text-center border transition-colors duration-500 ${selected.drs > 10 ? 'bg-green-500/10 border-green-500/30 shadow-[inset_0_0_15px_rgba(34,197,94,0.1)]' : 'bg-white/5 border-white/10'}`}>
                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-2">DRS System</p>
                      <p className={`font-mono text-xl font-black tracking-widest ${selected.drs > 10 ? 'text-green-400 drop-shadow-[0_0_5px_currentColor]' : 'text-neutral-600'}`}>
                        {selected.drs > 10 ? 'OPEN' : 'ARMED'}
                      </p>
                    </div>
                  </div>

                  {/* AI Insight Snippet */}
                  {isUnlocked && insight && (
                    <div className="bg-red-600/10 border border-red-500/30 rounded-xl p-5 shadow-[0_4px_20px_-5px_rgba(220,38,38,0.2)]">
                      <p className="text-[10px] text-red-400 font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-1.5">
                        <Zap className="w-3 h-3" /> Live Event Analysis
                      </p>
                      <p className="text-xs text-neutral-300 italic font-serif leading-relaxed opacity-90">{insight}</p>
                    </div>
                  )}
                </div>
             </>
           )}
        </div>
      </div>
    </main>
  );
}
