'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Activity, Clock, Zap, Lock, Unlock, MessageSquare, ChevronRight, Calendar, Flag, Gauge, Thermometer, Cloud, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

const TIRE_COLORS: Record<string, string> = {
  SOFT: '#ef4444',
  MEDIUM: '#eab308',
  HARD: '#f3f4f6',
  INTERMEDIATE: '#22c55e',
  WET: '#3b82f6',
  Unknown: '#6b7280',
};

function formatInterval(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return '---';
  if (typeof val === 'number') return val > 0 ? `+${val.toFixed(3)}s` : `${val.toFixed(3)}s`;
  return String(val);
}

function formatSectorTime(val: any): string {
  if (!val) return '---';
  if (typeof val === 'number') return val.toFixed(3);
  return String(val);
}

/* ────────────────────────────────────────────────────────────────────
   SVG Track Map — renders the REAL circuit from position data
   ──────────────────────────────────────────────────────────────────── */
function TrackMap({ 
  trackOutline, 
  cars, 
  positionTrails, 
  selectedDriver, 
  onSelectDriver 
}: {
  trackOutline: number[][];
  cars: any[];
  positionTrails: Record<string, number[][]>;
  selectedDriver: number | null;
  onSelectDriver: (n: number) => void;
}) {
  // Compute bounding box from track outline
  const { viewBox, scale, offsetX, offsetY } = useMemo(() => {
    if (!trackOutline || trackOutline.length < 2) {
      return { viewBox: '0 0 900 600', scale: 1, offsetX: 0, offsetY: 0 };
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of trackOutline) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const pad = 600;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    return {
      viewBox: `${minX - pad} ${minY - pad} ${w} ${h}`,
      scale: 1,
      offsetX: minX - pad,
      offsetY: minY - pad,
    };
  }, [trackOutline]);

  // Build SVG polyline string from track outline
  const trackPath = useMemo(() => {
    if (!trackOutline || trackOutline.length < 2) return '';
    return trackOutline.map(([x, y]) => `${x},${y}`).join(' ');
  }, [trackOutline]);

  // Build per-driver trail polylines
  const driverTrailPaths = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [dn, trail] of Object.entries(positionTrails)) {
      if (trail && trail.length > 1) {
        result[dn] = trail.map(([x, y]) => `${x},${y}`).join(' ');
      }
    }
    return result;
  }, [positionTrails]);

  if (!trackOutline || trackOutline.length < 10) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-neutral-600 font-mono text-sm animate-pulse">Loading circuit data...</p>
      </div>
    );
  }

  return (
    <svg viewBox={viewBox} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
          <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="trailGlow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Track surface — thick faded line */}
      <polyline
        points={trackPath}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="180"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Track outline */}
      <polyline
        points={trackPath}
        fill="none"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Racing lines — colored trails per driver */}
      {cars.map((car: any) => {
        const dn = String(car.number);
        const trailPath = driverTrailPaths[dn];
        if (!trailPath) return null;
        const isSelected = selectedDriver === car.number;
        const teamColor = car.color?.startsWith('#') ? car.color : `#${car.color || '888'}`;
        return (
          <polyline
            key={`trail-${dn}`}
            points={trailPath}
            fill="none"
            stroke={teamColor}
            strokeWidth={isSelected ? "14" : "5"}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={isSelected ? 0.9 : 0.35}
            filter={isSelected ? "url(#trailGlow)" : undefined}
            style={{ transition: 'opacity 0.5s, stroke-width 0.3s' }}
          />
        );
      })}

      {/* Car dots on track */}
      {cars.map((car: any) => {
        const x = car.location?.x || 0;
        const y = car.location?.y || 0;
        if (!x && !y) return null;
        const isSelected = selectedDriver === car.number;
        const teamColor = car.color?.startsWith('#') ? car.color : `#${car.color || '888'}`;
        return (
          <g key={`dot-${car.number}`} onClick={() => onSelectDriver(car.number)} style={{ cursor: 'pointer' }}>
            {/* Outer pulse for selected */}
            {isSelected && (
              <circle cx={x} cy={y} r="200" fill="none" stroke={teamColor} strokeWidth="4" opacity={0.4}>
                <animate attributeName="r" values="120;220;120" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0.1;0.6" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            {/* Car dot */}
            <circle
              cx={x} cy={y}
              r={isSelected ? "120" : "70"}
              fill={teamColor}
              stroke="#fff"
              strokeWidth={isSelected ? "16" : "8"}
              filter="url(#glow)"
            />
            {/* Driver acronym */}
            {isSelected && (
              <text x={x} y={y - 180} textAnchor="middle" fill="#fff"
                    fontSize="120" fontFamily="monospace" fontWeight="bold"
                    style={{ textShadow: `0 0 20px ${teamColor}` }}>
                {car.id}
              </text>
            )}
            {/* Position number */}
            <text x={x} y={y + (isSelected ? 45 : 28)} textAnchor="middle" fill="#fff"
                  fontSize={isSelected ? "90" : "55"} fontFamily="monospace" fontWeight="bold">
              {car.pos}
            </text>
          </g>
        );
      })}
    </svg>
  );
}


/* ════════════════════════════════════════════════════════════════════
   MAIN APP
   ════════════════════════════════════════════════════════════════════ */
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

  /* ─── Loading State ─── */
  if (!raceState || !connected) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white font-[Outfit,sans-serif]">
        <div className="text-center">
          <div className="w-16 h-16 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <p className="text-sm tracking-[0.3em] uppercase text-neutral-400 font-bold">Connecting to F1 Live Timing...</p>
          <p className="text-xs text-neutral-600 mt-2">Establishing SignalR telemetry stream</p>
        </div>
      </div>
    );
  }

  const selected = selectedDriver ? raceState.cars?.find((c: any) => c.number === selectedDriver) : null;
  const sess = raceState.session;
  const weather = raceState.weather;
  const hasData = raceState.cars?.length > 0;
  const backendError = raceState.error as string | undefined;
  const isHistorical = raceState.historical;

  return (
    <main className="h-screen bg-neutral-950 text-white flex flex-col overflow-hidden font-[Outfit,sans-serif]">
      
      {/* ═══ HEADER ═══ */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-white/10 bg-black/90 backdrop-blur-xl shrink-0 z-50">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-red-600 drop-shadow-[0_0_8px_rgba(220,38,38,0.8)]" />
            <span className="text-xl font-black tracking-wider">Genie<span className="text-red-600">F1</span></span>
          </div>
          {sess && (
            <div className="flex items-center gap-2.5">
              {isHistorical && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">
                  REPLAY
                </span>
              )}
              <span className="text-[10px] bg-red-600/20 text-red-400 border border-red-600/30 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest">
                {sess.year} • {sess.type || 'Race'}
              </span>
              <span className="text-sm font-semibold text-neutral-200">{sess.meeting_name}</span>
              {sess.circuit && <span className="text-xs font-mono text-neutral-500">— {sess.circuit}</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          {weather && (
            <div className="flex items-center gap-3 text-[11px] font-mono text-neutral-400 bg-white/5 px-3 py-1 rounded-full border border-white/5">
              {weather.air_temp != null && <span className="flex items-center gap-1"><Thermometer className="w-3 h-3 text-blue-400" />{weather.air_temp}°C</span>}
              {weather.track_temp != null && <span className="text-orange-400">TRK {weather.track_temp}°C</span>}
              {weather.rainfall != null && weather.rainfall > 0 && <span className="flex items-center gap-1 text-blue-500"><Cloud className="w-3 h-3" />Rain</span>}
            </div>
          )}
          
          <button onClick={() => setShowCalendar(!showCalendar)} className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded-lg transition-all">
            <Calendar className="w-3 h-3" /> CALENDAR
          </button>

          <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded-full">
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className={`font-mono text-[10px] font-bold tracking-widest ${connected ? 'text-green-500' : 'text-red-500'}`}>
              {connected ? (isHistorical ? 'REPLAY' : 'LIVE') : 'OFFLINE'}
            </span>
          </div>

          {!isUnlocked ? (
            <button onClick={handleDevUnlock} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 border border-red-400/50 shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all transform hover:scale-105 active:scale-95">
              <Lock className="w-3 h-3" /> PREMIUM
            </button>
          ) : (
            <span className="text-[10px] text-green-400 flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-lg font-bold">
              <Unlock className="w-3 h-3" /> PRO
            </span>
          )}
        </div>
      </header>

      {/* Error Banner */}
      <AnimatePresence>
        {backendError && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            className="px-5 py-2 border-b border-amber-500/30 bg-amber-500/10 text-amber-200 shrink-0">
            <p className="text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-3 h-3 text-amber-300" />{backendError}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Race Control Banner */}
      <AnimatePresence>
        {raceState.race_control?.length > 0 && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }}
            className="flex gap-2 px-5 py-1.5 border-b border-white/5 bg-black/50 overflow-x-auto shrink-0 scrollbar-hide">
            {raceState.race_control.map((rc: any, i: number) => (
              <span key={i} className={`text-[10px] px-2.5 py-0.5 rounded-md font-bold whitespace-nowrap border ${
                rc.flag === 'RED' ? 'bg-red-600/20 text-red-500 border-red-600/30' :
                rc.flag === 'YELLOW' ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30' :
                'bg-white/5 text-neutral-400 border-white/10'}`}>
                <Flag className="w-2.5 h-2.5 inline mr-1 mb-0.5" />{rc.message}
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar Overlay */}
      <AnimatePresence>
        {showCalendar && (
          <motion.aside initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute right-5 top-16 z-[80] w-[340px] max-h-[70vh] bg-black/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <p className="text-[10px] tracking-[0.2em] uppercase font-black text-neutral-300">2026 Calendar</p>
              <button onClick={() => setShowCalendar(false)} className="text-[10px] font-bold text-neutral-400 hover:text-white">CLOSE</button>
            </div>
            <div className="max-h-[calc(70vh-40px)] overflow-y-auto p-3 space-y-1.5">
              {calendarData.length === 0 && <p className="text-xs text-neutral-500 p-3">Loading...</p>}
              {calendarData.map((m: any, i: number) => (
                <div key={`${m.meeting_key || 'm'}-${i}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-sm font-semibold text-neutral-200">{m.meeting_name || m.meeting_official_name}</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">{m.circuit_short_name}{m.country_name ? `, ${m.country_name}` : ''}</p>
                </div>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ═══ MAIN GRID ═══ */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900/50 via-black to-black">
        
        {/* ──── LEFT: STANDINGS ──── */}
        <div className="w-[280px] flex flex-col bg-black/60 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent">
            <h2 className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em] flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-red-500" /> Standings
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <LayoutGroup>
              {!hasData && <p className="text-neutral-500 text-xs text-center mt-8 p-4">{backendError || 'Waiting for data...'}</p>}
              {raceState.cars?.map((car: any) => {
                const isSelected = selectedDriver === car.number;
                const tireColor = TIRE_COLORS[car.tire?.toUpperCase()] || '#666';
                const teamColor = car.color?.startsWith('#') ? car.color : `#${car.color || '888'}`;
                return (
                  <motion.div
                    layout key={car.number}
                    onClick={() => setSelectedDriver(car.number)}
                    className={`flex items-center gap-2 px-2.5 py-2 cursor-pointer border-l-2 border-b border-b-white/5 transition-all duration-200 ${
                      isSelected ? 'bg-white/10 border-l-current' : 'hover:bg-white/5 border-l-transparent'}`}
                    style={isSelected ? { borderLeftColor: teamColor } : undefined}
                  >
                    <span className="w-5 text-right font-mono text-xs font-bold text-neutral-500">{car.pos || '-'}</span>
                    <div className="w-0.5 h-6 rounded-full" style={{ background: teamColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-neutral-100">{car.id}</span>
                        <span className="text-[10px] text-neutral-500 truncate">{car.name?.split(' ').pop()}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tireColor }} />
                        <span className="text-[9px] font-mono text-neutral-400">{car.tire || '?'} L{car.tire_age || 0}</span>
                        {car.drs > 10 && <span className="text-[7px] px-1 py-0.5 rounded bg-green-500/20 text-green-400 font-bold border border-green-500/30">DRS</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-[10px] font-bold text-neutral-300">{car.pos === 1 ? 'Leader' : formatInterval(car.interval)}</p>
                      <p className="font-mono text-[9px] text-neutral-600 mt-0.5">{car.speed || 0} km/h</p>
                    </div>
                  </motion.div>
                );
              })}
            </LayoutGroup>
          </div>
        </div>

        {/* ──── CENTER: REAL TRACK MAP ──── */}
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          
          {/* Track Map Widget */}
          <div className="flex-[3] bg-black/60 backdrop-blur-md rounded-xl border border-white/10 flex flex-col overflow-hidden relative group">
            <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
              <h2 className="text-[10px] font-black uppercase text-neutral-400 tracking-[0.2em]">
                {sess?.circuit || 'Circuit'} — Real Track Map
              </h2>
            </div>
            
            {/* Legend */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-3">
              {selected && (
                <div className="flex items-center gap-1.5 bg-black/80 px-2.5 py-1 rounded-lg border border-white/10">
                  <div className="w-2 h-2 rounded-full" style={{ background: selected.color?.startsWith('#') ? selected.color : `#${selected.color || '888'}` }} />
                  <span className="text-[10px] font-bold text-neutral-300">{selected.id} Racing Line</span>
                </div>
              )}
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
                <button onClick={handlePitProjection} disabled={isProjecting}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5">
                  {isProjecting ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5 text-red-400" />}
                  {isProjecting ? 'SIMULATING...' : `BOX #{selectedDriver}`}
                </button>
              )}
            </div>

            {!isUnlocked ? (
              <div className="flex-1 flex items-center justify-center p-4 border border-dashed border-white/10 rounded-lg bg-white/5">
                <p className="text-xs font-mono text-neutral-500 text-center">
                  <Lock className="w-4 h-4 inline mr-1.5 text-neutral-600 mb-0.5" />
                  AI features locked. <button onClick={handleDevUnlock} className="text-red-400 font-bold hover:underline">Unlock Premium</button>
                </p>
              </div>
            ) : pitProjection ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                <div className="bg-gradient-to-br from-red-600/20 to-black border border-red-500/30 rounded-xl p-4 text-center min-w-[120px]">
                  <p className="text-[9px] text-red-400 font-black uppercase tracking-[0.2em] mb-1">Re-entry</p>
                  <p className="text-4xl font-mono font-black text-white">P{pitProjection.predicted_position}</p>
                  {pitProjection.positions_lost > 0 && <p className="text-[10px] text-red-400 mt-1 font-bold">-{pitProjection.positions_lost} spots</p>}
                </div>
                <div className="flex-1 bg-gradient-to-r from-blue-500/10 to-transparent border border-blue-500/20 rounded-xl p-4 flex flex-col justify-center">
                  <p className="text-[9px] text-blue-400 font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1.5"><MessageSquare className="w-3 h-3" /> Engineer</p>
                  <p className="text-sm text-neutral-200 italic font-serif leading-relaxed">&ldquo;{pitProjection.insight}&rdquo;</p>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-3 border border-dashed border-white/10 rounded-lg">
                <p className="text-xs font-mono text-neutral-600 text-center">Select a driver → Evaluate Box to run pit stop simulation.</p>
              </div>
            )}
          </div>
        </div>

        {/* ──── RIGHT: TELEMETRY ──── */}
        <div className="w-[300px] flex flex-col bg-black/60 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden relative">
           
           {!selected ? (
              <div className="flex-1 flex items-center justify-center text-neutral-600 font-mono text-xs p-6 text-center">
                Select a driver to view telemetry
              </div>
           ) : (
             <>
                {/* Driver Header */}
                <div className="p-4 border-b border-white/10 bg-gradient-to-r from-white/5 to-transparent flex items-center gap-3 relative z-10">
                   <div className="w-12 h-12 rounded-lg flex items-center justify-center text-lg font-black font-mono border-2 bg-black relative overflow-hidden" 
                        style={{ borderColor: selected.color?.startsWith('#') ? selected.color : `#${selected.color || '888'}`, 
                                 color: selected.color?.startsWith('#') ? selected.color : `#${selected.color || '888'}` }}>
                       <span className="relative z-10">{selected.number}</span>
                   </div>
                   <div>
                     <h2 className="text-base font-bold tracking-tight text-white">{selected.name}</h2>
                     <p className="text-[10px] font-black uppercase text-neutral-400 tracking-wider bg-white/10 inline-block px-1.5 py-0.5 rounded border border-white/10">{selected.team}</p>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative z-10">
                  
                  {/* Speed & Position */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col items-center justify-center group relative overflow-hidden">
                      <p className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em] mb-1 flex items-center gap-1"><Gauge className="w-3 h-3 text-blue-400" /> Speed</p>
                      <p className="text-2xl font-mono font-black text-white">{selected.speed || 0}</p>
                      <p className="text-[10px] font-mono text-blue-400/80">km/h</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col items-center justify-center group relative overflow-hidden">
                      <p className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em] mb-1 flex items-center gap-1"><Activity className="w-3 h-3 text-amber-400" /> Pos</p>
                      <p className="text-2xl font-mono font-black text-white">P{selected.pos}</p>
                      <p className="text-[10px] font-mono text-neutral-500">{formatInterval(selected.gap_to_leader)} to P1</p>
                    </div>
                  </div>

                  {/* Telemetry Bar Gauges */}
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2">
                    <p className="text-[8px] text-neutral-500 font-black uppercase tracking-[0.2em] mb-1">Telemetry</p>
                    {[
                      { label: 'RPM', val: selected.rpm || 0, max: 15000, color: 'bg-blue-500' },
                      { label: 'Throttle', val: selected.throttle || 0, max: 100, color: 'bg-green-500' },
                      { label: 'Brake', val: selected.brake || 0, max: 100, color: 'bg-red-500' },
                      { label: 'Gear', val: selected.gear || 0, max: 8, color: 'bg-purple-500' },
                    ].map(g => (
                      <div key={g.label} className="flex items-center gap-2">
                        <span className="text-[9px] font-mono text-neutral-500 w-14">{g.label}</span>
                        <div className="flex-1 h-2 bg-neutral-900 rounded-full overflow-hidden">
                          <div className={`h-full ${g.color} rounded-full transition-all duration-300`}
                               style={{ width: `${Math.min(100, (g.val / g.max) * 100)}%` }} />
                        </div>
                        <span className="text-[9px] font-mono text-neutral-400 w-12 text-right">{g.val}</span>
                      </div>
                    ))}
                  </div>

                  {/* Sector Times */}
                  <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-[8px] text-neutral-400 font-black uppercase tracking-[0.2em]"><Clock className="w-3 h-3 inline mr-1" /> Latest Lap</p>
                      <span className="font-mono text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-neutral-300 font-bold border border-white/5">L{selected.lap_number || '-'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      {[
                        { label: 'S1', val: selected.sector_1, color: 'text-purple-400' },
                        { label: 'S2', val: selected.sector_2, color: 'text-green-400' },
                        { label: 'S3', val: selected.sector_3, color: 'text-orange-400' }
                      ].map(s => (
                        <div key={s.label} className="bg-black/40 border border-white/5 rounded-lg py-2">
                           <p className="text-[8px] text-neutral-500 font-bold mb-0.5">{s.label}</p>
                           <p className={`font-mono text-xs font-bold ${s.val ? s.color : 'text-neutral-600'}`}>
                             {formatSectorTime(s.val)}
                           </p>
                        </div>
                      ))}
                    </div>
                    {selected.last_lap_time && (
                      <div className="mt-2 text-center">
                        <p className="text-[8px] text-neutral-500 font-bold">LAP TIME</p>
                        <p className="font-mono text-sm font-bold text-white">
                          {typeof selected.last_lap_time === 'number' ? selected.last_lap_time.toFixed(3) : selected.last_lap_time}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Tires */}
                  <div className="bg-gradient-to-br from-white/5 to-black/50 border border-white/10 rounded-lg p-3">
                    <p className="text-[8px] text-neutral-400 font-black uppercase tracking-[0.2em] mb-2">Tyre Status</p>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-[7px] ring-2 ring-offset-1 ring-offset-black/50 ring-transparent"
                             style={{ background: TIRE_COLORS[selected.tire?.toUpperCase()] || '#666' }}>
                          {selected.tire?.charAt(0) || '?'}
                        </div>
                        <span className="font-bold text-sm">{selected.tire || 'Unknown'}</span>
                      </div>
                      <span className="font-mono text-[10px] font-bold text-neutral-400 bg-white/10 border border-white/5 rounded px-1.5 py-0.5">{selected.tire_age || 0} LAPS</span>
                    </div>
                    <div className="h-1.5 bg-neutral-900 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-1000 ${((selected.tire_age || 0) > 20) ? 'bg-red-500' : ((selected.tire_age || 0) > 10) ? 'bg-orange-500' : 'bg-green-500'}`} 
                           style={{ width: `${Math.max(5, 100 - (selected.tire_age || 0) * 3)}%` }} />
                    </div>
                  </div>

                  {/* DRS Status */}
                  <div className={`rounded-lg p-3 text-center border transition-colors duration-500 ${selected.drs > 10 ? 'bg-green-500/10 border-green-500/30' : 'bg-white/5 border-white/10'}`}>
                    <p className="text-[8px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-1">DRS</p>
                    <p className={`font-mono text-lg font-black tracking-widest ${selected.drs > 10 ? 'text-green-400' : 'text-neutral-600'}`}>
                      {selected.drs > 10 ? 'OPEN' : 'CLOSED'}
                    </p>
                  </div>

                  {/* AI Insight */}
                  {isUnlocked && insight && (
                    <div className="bg-red-600/10 border border-red-500/30 rounded-lg p-3">
                      <p className="text-[9px] text-red-400 font-black uppercase tracking-[0.2em] mb-2 flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Analysis
                      </p>
                      <p className="text-[11px] text-neutral-300 italic font-serif leading-relaxed">{insight}</p>
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
