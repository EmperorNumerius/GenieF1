import React, { useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getTeamColor } from '../lib/constants';

interface TrackMapProps {
  trackOutline: number[][];
  cars: any[];
  positionTrails: Record<string, number[][]>;
  selectedDriver: number | null;
  onSelectDriver: (n: number) => void;
}

export function TrackMap({
  trackOutline,
  cars,
  positionTrails,
  selectedDriver,
  onSelectDriver,
}: TrackMapProps) {
  const { viewBox } = useMemo(() => {
    if (!trackOutline || trackOutline.length < 2) {
      return { viewBox: '0 0 900 600', scale: 1, offsetX: 0, offsetY: 0 };
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
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

  const trackPath = useMemo(() => {
    if (!trackOutline || trackOutline.length < 2) return '';
    return trackOutline.map(([x, y]) => `${x},${y}`).join(' ');
  }, [trackOutline]);

  const driverTrailPaths = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [dn, trail] of Object.entries(positionTrails)) {
      if (trail && trail.length > 1) {
        result[dn] = trail.map(([x, y]) => `${x},${y}`).join(' ');
      }
    }
    return result;
  }, [positionTrails]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const lastPan = useRef({ x: 0, y: 0 });

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const scaleDiff = e.deltaY * -0.001;
    setZoom((z) => Math.min(Math.max(0.4, z + scaleDiff), 8));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    lastPan.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastPan.current.x;
      const dy = e.clientY - lastPan.current.y;
      setPan((p) => ({
        x: p.x - dx * (2000 / zoom / window.innerWidth),
        y: p.y - dy * (2000 / zoom / window.innerHeight),
      }));
      lastPan.current = { x: e.clientX, y: e.clientY };
    },
    [isDragging, zoom]
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (!trackOutline || trackOutline.length < 10) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-neutral-600 font-mono text-sm animate-pulse">Loading circuit data...</p>
      </div>
    );
  }

  const [bx, by, bw, bh] = viewBox.split(' ').map(Number);
  const w = bw / zoom;
  const h = bh / zoom;
  const cx = bx + bw / 2 + pan.x * bw;
  const cy = by + bh / 2 + pan.y * bh;
  const activeViewBox = `${cx - w / 2} ${cy - h / 2} ${w} ${h}`;

  const getPointAt = (percent: number) => {
    if (!trackOutline.length) return [0, 0];
    const idx = Math.floor((trackOutline.length - 1) * percent);
    return trackOutline[idx];
  };

  return (
    <div
      className="w-full h-full relative overflow-hidden bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-900 via-black to-black"
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ touchAction: 'none' }}
    >
      {/* Zoom & View Controls Overlay */}
      <div className="absolute left-4 bottom-14 flex flex-col gap-2 z-20">
        <div className="flex flex-col gap-1 bg-black/80 p-1 rounded-xl border border-white/10 backdrop-blur-md shadow-2xl">
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.5, 8))}
            className="w-8 h-8 hover:bg-white/10 rounded-lg text-neutral-300 flex items-center justify-center font-bold text-lg transition-colors"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.5, 0.4))}
            className="w-8 h-8 hover:bg-white/10 rounded-lg text-neutral-300 flex items-center justify-center font-bold text-lg transition-colors"
            aria-label="Zoom out"
          >
            -
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
              setIs3D(false);
            }}
            className="w-8 h-8 mt-1 border-t border-white/10 hover:bg-white/10 rounded-b-lg text-neutral-400 flex items-center justify-center font-black text-[9px] transition-colors"
            aria-label="Reset zoom and pan"
          >
            RST
          </button>
        </div>
        <button
          onClick={() => setIs3D(!is3D)}
          className={`mt-2 w-10 h-10 rounded-xl font-black text-[10px] tracking-wider border shadow-2xl transition-all duration-300 ${
            is3D
              ? 'bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.5)]'
              : 'bg-black/80 border-white/10 text-neutral-400 hover:text-white backdrop-blur-md hover:bg-white/10'
          }`}
          aria-label={is3D ? 'Switch to 2D view' : 'Switch to 3D view'}
        >
          {is3D ? '2D' : '3D'}
        </button>
      </div>

      {/* The main SVG Stage */}
      <svg className="w-full h-full" style={{ perspective: '2000px' }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="trailGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <motion.svg
          viewBox={activeViewBox}
          className="w-full h-full overflow-visible"
          animate={{
            transform: is3D
              ? `perspective(2000px) rotateX(60deg) rotateZ(-30deg) scale(1.2)`
              : 'perspective(2000px) rotateX(0deg) rotateZ(0deg) scale(1)',
          }}
          transition={{ duration: 1, ease: [0.25, 1, 0.5, 1] }}
          style={{
            transformStyle: 'preserve-3d',
            transformOrigin: '50% 50%',
          }}
        >
          <g>
            {/* 3D Track Base Layers (rendered slightly offset to simulate thickness) */}
            {is3D &&
              [1, 2, 3, 4, 5].map((layerVal) => (
                <polyline
                  key={`layer-${layerVal}`}
                  points={trackPath}
                  fill="none"
                  stroke="rgba(0,0,0,0.8)"
                  strokeWidth="180"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform={`translate(0, ${layerVal * 15})`}
                />
              ))}
            {is3D &&
              [1, 2, 3, 4, 5].map((layerVal) => (
                <polyline
                  key={`layer-line-${layerVal}`}
                  points={trackPath}
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform={`translate(0, ${layerVal * 15})`}
                />
              ))}

            {/* Track surface — thick faded line */}
            <polyline
              points={trackPath}
              fill="none"
              stroke={is3D ? 'rgba(40,40,40,0.9)' : 'rgba(255,255,255,0.1)'}
              strokeWidth="220"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: is3D ? 'drop-shadow(0px 30px 40px rgba(0,0,0,0.8))' : 'none' }}
            />

            {/* Track outline */}
            <polyline
              points={trackPath}
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="24"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Track Markers (Corners, Aero Zones, Checkpoints) */}
            {[
              { pt: getPointAt(0.01), label: 'START', color: '#ffffff', size: 300, isZone: false },
              { pt: getPointAt(0.05), label: 'T1', color: '#fbbf24', size: 400, isZone: false },
              { pt: getPointAt(0.1), label: 'DRS ZONE 1', color: '#34d399', size: 250, isZone: true },
              { pt: getPointAt(0.35), label: 'T6', color: '#fbbf24', size: 400, isZone: false },
              { pt: getPointAt(0.5), label: 'OVERTAKE', color: '#f87171', size: 250, isZone: true },
              { pt: getPointAt(0.65), label: 'T11', color: '#fbbf24', size: 400, isZone: false },
              { pt: getPointAt(0.85), label: 'DRS ZONE 2', color: '#34d399', size: 250, isZone: true },
              { pt: getPointAt(0.95), label: 'T14', color: '#fbbf24', size: 400, isZone: false },
            ].map((marker, i) => (
              <g key={`marker-${i}`} transform={`translate(${marker.pt[0]}, ${marker.pt[1]})`}>
                <circle r="150" fill={marker.color} opacity="0.1" filter="url(#glow)" />
                <circle r="60" fill={marker.color} />
                <text
                  y="-250"
                  textAnchor="middle"
                  fill={marker.color}
                  fontFamily="sans-serif"
                  fontWeight="900"
                  fontSize={marker.size}
                  style={{ textShadow: '0 0 50px rgba(0,0,0,0.9)' }}
                  transform={is3D ? 'rotateX(-60deg)' : 'none'}
                >
                  {marker.label}
                </text>
                {marker.isZone && (
                  <text
                    y="200"
                    textAnchor="middle"
                    fill={marker.color}
                    fontFamily="monospace"
                    fontWeight="bold"
                    fontSize="200"
                    opacity="0.8"
                    transform={is3D ? 'rotateX(-60deg)' : 'none'}
                  >
                    [ACTIVE]
                  </text>
                )}
              </g>
            ))}

            {/* Racing lines — colored trails per driver */}
            {cars.map((car: any) => {
              const dn = String(car.number);
              const trailPath = driverTrailPaths[dn];
              if (!trailPath) return null;
              const isSelected = selectedDriver === car.number;
              const teamColor = getTeamColor(car);
              return (
                <polyline
                  key={`trail-${dn}`}
                  points={trailPath}
                  fill="none"
                  stroke={teamColor}
                  strokeWidth={isSelected ? '22' : '8'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={isSelected ? 1 : 0.2}
                  filter={isSelected ? 'url(#trailGlow)' : undefined}
                  style={{ transition: 'opacity 0.5s, stroke-width 0.3s' }}
                />
              );
            })}

            {/* Car dots on track -> Upgraded to animated motion.g */}
            <AnimatePresence>
              {cars.map((car: any) => {
                const x = car.location?.x || 0;
                const y = car.location?.y || 0;
                if (!x && !y) return null;
                const isSelected = selectedDriver === car.number;
                const teamColor = getTeamColor(car);

                return (
                  <motion.g
                    key={`dot-${car.number}`}
                    onClick={() => onSelectDriver(car.number)}
                    style={{ cursor: 'pointer' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {/* Outer pulse for selected */}
                    {isSelected && (
                      <circle cx={x} cy={y} r="300" fill="none" stroke={teamColor} strokeWidth="6" opacity={0.6}>
                        <animate attributeName="r" values="150;350;150" dur="1.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.8;0.0;0.8" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* Car dot animated translation */}
                    <motion.g
                      animate={{
                        x,
                        y,
                        rotateX: is3D ? -60 : 0,
                      }}
                      transition={{ type: 'spring', stiffness: 50, damping: 15 }} // Smooth interpolation
                    >
                      <path
                        d={
                          isSelected
                            ? 'M0,-250 L100,-50 L200,50 L-200,50 L-100,-50 Z' // Larger pointer for selected
                            : 'M0,-120 L70,0 L-70,0 Z' // F1 arrowhead shape
                        }
                        fill={teamColor}
                        stroke="#fff"
                        strokeWidth={isSelected ? '20' : '10'}
                        filter="url(#glow)"
                        style={{
                          transformOrigin: '0 0',
                        }}
                      />
                      {/* Driver acronym */}
                      {isSelected && (
                        <text
                          x="0"
                          y="-300"
                          textAnchor="middle"
                          fill="#fff"
                          fontSize="180"
                          fontFamily="monospace"
                          fontWeight="900"
                          style={{ textShadow: `0 10px 40px ${teamColor}` }}
                        >
                          {car.id}
                        </text>
                      )}
                      {/* Position number */}
                      <text
                        x="0"
                        y={isSelected ? '150' : '80'}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize={isSelected ? '140' : '80'}
                        fontFamily="monospace"
                        fontWeight="900"
                      >
                        P{car.pos}
                      </text>
                    </motion.g>
                  </motion.g>
                );
              })}
            </AnimatePresence>
          </g>
        </motion.svg>
      </svg>
    </div>
  );
}
