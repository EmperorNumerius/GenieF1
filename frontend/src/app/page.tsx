'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Clock, Zap, Lock, Unlock, MessageSquare, ChevronRight, Calendar, Flag, Gauge, Battery, Wind, Thermometer, Cloud, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

/* ═══ Types ═══ */
interface CarState {
  id: string;
  number: number;
  name: string;
  team: string;
  color: string;
  pos: number;
  speed: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  drs: number;
  interval: number | string | null;
  gap_to_leader: number | string | null;
  tire: string;
  tire_age: number;
  stint_laps: number;
  last_lap_time: number | null;
  lap_number: number;
  sector_1: number | null;
  sector_2: number | null;
  sector_3: number | null;
}

interface SessionInfo {
  key: number;
  name: string;
  type: string;
  circuit: string;
  country: string;
  meeting_name: string;
  status: string;
  year: number;
}

interface WeatherInfo {
  air_temp: number | null;
  track_temp: number | null;
  humidity: number | null;
  wind_speed: number | null;
  rainfall: number | null;
}

interface RaceControlMsg {
  message: string;
  category: string;
  flag: string;
}

interface RaceState {
  cars: CarState[];
  session: SessionInfo | null;
  weather: WeatherInfo | null;
  race_control: RaceControlMsg[];
  error?: string;
}

const TIRE_COLORS: Record<string, string> = {
  SOFT: '#FF3333',
  MEDIUM: '#FFD700',
  HARD: '#CCCCCC',
  INTERMEDIATE: '#4BC847',
  WET: '#3B7DDD',
  Unknown: '#666',
};

function formatInterval(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return '---';
  if (typeof val === 'number') return val > 0 ? `+${val.toFixed(3)}` : `${val.toFixed(3)}`;
  return String(val);
}

/* ═══ Component ═══ */
export default function Home() {
  const [raceState, setRaceState] = useState<RaceState | null>(null);
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

  // WebSocket connection
  useEffect(() => {
    const connectWs = () => {
      const ws = new WebSocket('ws://localhost:8000/ws/race_data');
      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setRaceState(data);
        // Auto-select first driver on initial load
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
  }, []);

  // Fetch calendar
  useEffect(() => {
    fetch('http://localhost:8000/api/calendar')
      .then(r => r.json())
      .then(d => setCalendarData(d.meetings || []))
      .catch(() => {});
  }, []);

  // Fetch AI insight (premium)
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

  /* ═══ Loading State ═══ */
  if (!raceState || !connected) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: "'Outfit', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: '2px solid #dc2626', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 14, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#666' }}>Connecting to OpenF1 API...</p>
          <p style={{ fontSize: 11, color: '#444', marginTop: 8 }}>Real-time data from the live F1 timing system</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const selected = selectedDriver ? raceState.cars.find(c => c.number === selectedDriver) : null;
  const sess = raceState.session;
  const weather = raceState.weather;
  const hasData = raceState.cars.length > 0;

  return (
    <main style={{ height: '100vh', background: '#000', color: '#fff', fontFamily: "'Outfit', sans-serif", display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ═══ HEADER ═══ */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(16px)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap style={{ width: 24, height: 24, color: '#dc2626' }} />
            <span style={{ fontSize: 20, fontWeight: 700 }}>Genie<span style={{ color: '#dc2626' }}>F1</span></span>
          </div>
          {sess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, background: 'rgba(220,38,38,0.15)', color: '#f87171', border: '1px solid rgba(220,38,38,0.3)', padding: '2px 8px', borderRadius: 99, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {sess.year} • {sess.type}
              </span>
              <span style={{ fontSize: 13, color: '#aaa' }}>{sess.meeting_name}</span>
              <span style={{ fontSize: 11, color: '#666' }}>— {sess.circuit}, {sess.country}</span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {weather && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#888' }}>
              {weather.air_temp !== null && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Thermometer style={{ width: 12, height: 12 }} />{weather.air_temp}°C</span>}
              {weather.track_temp !== null && <span>Track {weather.track_temp}°C</span>}
              {weather.rainfall !== null && weather.rainfall > 0 && <span style={{ color: '#60a5fa' }}><Cloud style={{ width: 12, height: 12, display: 'inline' }} /> Rain</span>}
            </div>
          )}

          <button onClick={() => setShowCalendar(!showCalendar)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#aaa', background: 'none', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 8, cursor: 'pointer' }}>
            <Calendar style={{ width: 14, height: 14 }} /> Calendar
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#22c55e' : '#ef4444', animation: connected ? 'pulse 2s ease-in-out infinite' : 'none' }} />
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: connected ? '#4ade80' : '#f87171' }}>{connected ? 'LIVE' : 'OFFLINE'}</span>
          </div>

          {!isUnlocked ? (
            <button onClick={handleDevUnlock} style={{ background: '#dc2626', color: '#fff', padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, boxShadow: '0 0 20px rgba(220,38,38,0.4)' }}>
              <Lock style={{ width: 12, height: 12 }} /> Unlock AI
            </button>
          ) : (
            <span style={{ fontSize: 11, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', padding: '4px 12px', borderRadius: 8 }}>
              <Unlock style={{ width: 12, height: 12 }} /> Premium
            </span>
          )}
        </div>
      </header>

      {/* ═══ RACE CONTROL BANNER ═══ */}
      {raceState.race_control.length > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '6px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(30,30,30,0.5)', overflowX: 'auto', flexShrink: 0 }}>
          {raceState.race_control.map((rc, i) => (
            <span key={i} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, background: rc.flag === 'RED' ? 'rgba(220,38,38,0.2)' : rc.flag === 'YELLOW' ? 'rgba(234,179,8,0.2)' : 'rgba(255,255,255,0.05)', color: rc.flag === 'RED' ? '#f87171' : rc.flag === 'YELLOW' ? '#fbbf24' : '#999', whiteSpace: 'nowrap' }}>
              {rc.message}
            </span>
          ))}
        </div>
      )}

      {/* ═══ CALENDAR DROPDOWN ═══ */}
      <AnimatePresence>
        {showCalendar && calendarData.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#0a0a0a', flexShrink: 0 }}>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
              {calendarData.map((m: any, i: number) => (
                <div key={i} style={{ fontSize: 11, padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}>
                  <p style={{ fontWeight: 700, fontSize: 10, textTransform: 'uppercase', color: '#888', marginBottom: 2 }}>{m.meeting_name || `Round ${i + 1}`}</p>
                  <p style={{ color: '#ccc' }}>{m.country_name || m.location || ''}</p>
                  <p style={{ fontFamily: 'monospace', fontSize: 10, color: '#555' }}>{m.date_start?.slice(0, 10) || ''}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ MAIN CONTENT ═══ */}
      {!hasData ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
          <Clock style={{ width: 32, height: 32, color: '#444' }} />
          <p style={{ color: '#666', fontSize: 14 }}>No live session data available</p>
          <p style={{ color: '#444', fontSize: 12 }}>Data will appear automatically when a session is live on the F1 timing system.</p>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr 300px', minHeight: 0, overflow: 'hidden' }}>

          {/* ──── LEFT: STANDINGS ──── */}
          <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', background: 'rgba(5,5,5,0.8)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <h2 style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#666' }}>Live Standings</h2>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <LayoutGroup>
                {raceState.cars.map((car) => {
                  const isSelected = selectedDriver === car.number;
                  const tireColor = TIRE_COLORS[car.tire?.toUpperCase()] || '#666';
                  const teamColor = car.color?.startsWith('#') ? `#${car.color}` : `#${car.color || '888'}`;
                  return (
                    <motion.div
                      layout
                      key={car.number}
                      onClick={() => setSelectedDriver(car.number)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                        cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)',
                        background: isSelected ? 'rgba(255,255,255,0.06)' : 'transparent',
                        transition: 'background 0.15s'
                      }}
                      whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                    >
                      <span style={{ width: 20, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: '#666' }}>{car.pos || '-'}</span>
                      <div style={{ width: 3, height: 24, borderRadius: 4, background: teamColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontWeight: 700, fontSize: 12 }}>{car.id}</span>
                          <span style={{ fontSize: 10, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{car.name?.split(' ').pop()}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                          <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: tireColor, flexShrink: 0 }} />
                          <span style={{ fontSize: 9, fontFamily: 'monospace', color: '#666' }}>{car.tire || '?'} L{car.tire_age || 0}</span>
                          {car.drs > 10 && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(34,197,94,0.2)', color: '#4ade80', fontWeight: 700 }}>DRS</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{car.pos === 1 ? 'Leader' : formatInterval(car.interval)}</p>
                        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#666' }}>{car.speed || 0} km/h</p>
                      </div>
                    </motion.div>
                  );
                })}
              </LayoutGroup>
            </div>
          </div>

          {/* ──── CENTER: AI & STRATEGY ──── */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Race snapshot */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'radial-gradient(ellipse at center, rgba(30,0,0,0.2) 0%, transparent 70%)' }}>
              <div style={{ textAlign: 'center', maxWidth: 500 }}>
                <Flag style={{ width: 20, height: 20, color: '#444', margin: '0 auto 8px' }} />
                <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{sess?.meeting_name || 'Formula 1'}</h2>
                <p style={{ fontSize: 13, color: '#888' }}>{sess?.circuit || ''} — {sess?.type || 'Session'}</p>
                <p style={{ fontSize: 11, color: '#555', marginTop: 4 }}>Live data from OpenF1 • {raceState.cars.length} drivers tracked</p>
              </div>

              {/* Top 3 */}
              {raceState.cars.length >= 3 && (
                <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
                  {raceState.cars.slice(0, 3).map((car, i) => {
                    const teamColor = car.color?.startsWith('#') ? `#${car.color}` : `#${car.color || '888'}`;
                    return (
                      <div key={car.number} style={{ textAlign: 'center', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', minWidth: 120 }}>
                        <p style={{ fontSize: 24, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: i === 0 ? '#fbbf24' : i === 1 ? '#d1d5db' : '#a78bfa' }}>P{car.pos}</p>
                        <p style={{ fontSize: 14, fontWeight: 700, marginTop: 4 }}>{car.id}</p>
                        <p style={{ fontSize: 10, color: '#888' }}>{car.team}</p>
                        <div style={{ width: '100%', height: 2, borderRadius: 1, background: teamColor, marginTop: 8, opacity: 0.6 }} />
                        <p style={{ fontSize: 10, color: '#666', marginTop: 6, fontFamily: 'monospace' }}>{formatInterval(car.gap_to_leader)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI Strategy Strip */}
            <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.08)', padding: 16, background: 'rgba(5,5,5,0.9)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#888' }}>
                  <Zap style={{ width: 14, height: 14, color: '#dc2626' }} /> AI Pit Strategy
                </h3>
                {isUnlocked && selected && (
                  <button onClick={handlePitProjection} disabled={isProjecting} style={{ background: '#1a1a1a', color: '#fff', padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {isProjecting ? <Clock style={{ width: 12, height: 12 }} /> : <ChevronRight style={{ width: 12, height: 12 }} />}
                    {isProjecting ? 'Simulating...' : `Box #${selectedDriver}?`}
                  </button>
                )}
              </div>

              {!isUnlocked ? (
                <p style={{ fontSize: 11, color: '#444', fontStyle: 'italic' }}>Unlock Premium to access AI pit strategy, yellow flag analysis, and ERS predictions.</p>
              ) : pitProjection ? (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 12, padding: 16, textAlign: 'center', flexShrink: 0 }}>
                    <p style={{ fontSize: 9, color: '#f87171', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em' }}>Re-entry</p>
                    <p style={{ fontSize: 28, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>P{pitProjection.predicted_position}</p>
                    {pitProjection.positions_lost > 0 && <p style={{ fontSize: 10, color: '#888' }}>-{pitProjection.positions_lost} positions</p>}
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, flex: 1 }}>
                    <p style={{ fontSize: 9, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Race Engineer Radio</p>
                    <p style={{ fontSize: 12, fontStyle: 'italic', color: '#ccc', fontFamily: 'Georgia, serif' }}>&ldquo;{pitProjection.insight}&rdquo;</p>
                  </div>
                </motion.div>
              ) : (
                <p style={{ fontSize: 11, color: '#555' }}>Select a driver and run pit simulation to predict re-entry position.</p>
              )}
            </div>
          </div>

          {/* ──── RIGHT: TELEMETRY ──── */}
          <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', background: 'rgba(5,5,5,0.8)' }}>
            {selected ? (
              <>
                <div style={{ padding: 14, borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', background: `${selected.color?.startsWith('#') ? '' : '#'}${selected.color || '888'}22`, border: `2px solid ${selected.color?.startsWith('#') ? '' : '#'}${selected.color || '888'}` }}>
                      {selected.number}
                    </div>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 14 }}>{selected.name}</p>
                      <p style={{ fontSize: 11, color: '#888' }}>{selected.team}</p>
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                      <p style={{ fontSize: 9, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}><Gauge style={{ width: 10, height: 10 }} />Speed</p>
                      <p style={{ fontSize: 22, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{selected.speed || 0}</p>
                      <p style={{ fontSize: 9, color: '#555' }}>km/h</p>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, textAlign: 'center' }}>
                      <p style={{ fontSize: 9, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 4 }}>Position</p>
                      <p style={{ fontSize: 22, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>P{selected.pos}</p>
                      <p style={{ fontSize: 9, color: '#555' }}>{formatInterval(selected.gap_to_leader)}</p>
                    </div>
                  </div>

                  {/* Lap info */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <p style={{ fontSize: 9, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Last Lap</p>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#888' }}>Lap {selected.lap_number || '-'}</span>
                    </div>
                    <p style={{ fontSize: 22, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                      {selected.last_lap_time ? `${selected.last_lap_time.toFixed(3)}s` : '---'}
                    </p>
                  </div>

                  {/* Sector times */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                    {[
                      { label: 'S1', value: selected.sector_1, color: '#a78bfa' },
                      { label: 'S2', value: selected.sector_2, color: '#4ade80' },
                      { label: 'S3', value: selected.sector_3, color: '#f59e0b' },
                    ].map(s => (
                      <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 8, textAlign: 'center' }}>
                        <p style={{ fontSize: 9, color: '#666', fontWeight: 700, marginBottom: 3 }}>{s.label}</p>
                        <p style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: s.value ? s.color : '#555' }}>
                          {s.value ? s.value.toFixed(3) : '---'}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Tyres */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                    <p style={{ fontSize: 9, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Tyres</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: TIRE_COLORS[selected.tire?.toUpperCase()] || '#666' }} />
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{selected.tire || 'Unknown'}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'monospace', color: '#888' }}>{selected.tire_age || 0} laps</span>
                    </div>
                    <div style={{ marginTop: 8, height: 5, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, background: (selected.tire_age || 0) > 20 ? '#ef4444' : (selected.tire_age || 0) > 10 ? '#f59e0b' : '#22c55e', width: `${Math.max(5, 100 - (selected.tire_age || 0) * 3)}%`, transition: 'width 0.5s' }} />
                    </div>
                  </div>

                  {/* DRS */}
                  <div style={{ background: selected.drs > 10 ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${selected.drs > 10 ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, padding: 10, textAlign: 'center', marginBottom: 12 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: selected.drs > 10 ? '#4ade80' : '#666' }}>DRS</p>
                    <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: selected.drs > 10 ? '#4ade80' : '#555' }}>{selected.drs > 10 ? 'OPEN' : 'CLOSED'}</p>
                  </div>

                  {/* AI Insight */}
                  {isUnlocked && insight && (
                    <div style={{ background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
                      <p style={{ fontSize: 9, color: '#f87171', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Zap style={{ width: 10, height: 10 }} />AI Insight</p>
                      <p style={{ fontSize: 11, color: '#ccc', fontStyle: 'italic', lineHeight: 1.5, fontFamily: 'Georgia, serif' }}>{insight}</p>
                    </div>
                  )}

                  {/* Discord */}
                  {isUnlocked && (
                    <div style={{ background: 'rgba(88,101,242,0.08)', border: '1px solid rgba(88,101,242,0.2)', borderRadius: 10, padding: 10 }}>
                      <p style={{ fontSize: 9, color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><MessageSquare style={{ width: 10, height: 10 }} />Discord</p>
                      <code style={{ display: 'block', background: 'rgba(0,0,0,0.4)', padding: 6, borderRadius: 4, color: '#818cf8', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' }}>!link {sessionId.current}</code>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 12 }}>
                Select a driver from the standings
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
      `}</style>
    </main>
  );
}
