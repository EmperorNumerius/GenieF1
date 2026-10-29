// @ts-nocheck
// TrackMapInner is a legacy Leaflet component kept for reference only.
// react-leaflet is not installed; this file is not imported anywhere in the active bundle.
import React, { useMemo, useEffect, useState } from 'react';
import { MapContainer, TileLayer, SVGOverlay, useMap } from 'react-leaflet';
import { getTeamColor } from '../lib/constants';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'framer-motion';

interface TrackMapInnerProps {
  trackOutline: number[][];
  cars: any[];
  positionTrails: Record<string, number[][]>;
  selectedDriver: number | null;
  onSelectDriver: (n: number) => void;
  circuitName?: string;
}

// Bounding boxes [ [minLat, minLon], [maxLat, maxLon] ] for tracks.
// Since we default to China (Shanghai), we use Shanghai's rough geographic bounds.
const TRACK_BOUNDS: Record<string, [[number, number], [number, number]]> = {
  "Shanghai": [[31.3283, 121.2132], [31.3435, 121.2295]],
  "Melbourne": [[-37.854, 144.958], [-37.838, 144.981]], // Albert Park
  "Bahrain": [[26.025, 50.505], [26.038, 50.518]],
  // Default to a generic location if not found
  "Default": [[0, 0], [0.015, 0.015]]
};

function MapFitter({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds);
  }, [map, bounds]);
  return null;
}

export default function TrackMapInner({
  trackOutline,
  cars,
  positionTrails,
  selectedDriver,
  onSelectDriver,
  circuitName = "Shanghai"
}: TrackMapInnerProps) {
  // Determine coordinate bounding box from F1 telemetry
  const { viewBox, minX, maxX, minY, maxY } = useMemo(() => {
    if (!trackOutline || trackOutline.length < 2) {
      return { viewBox: '0 0 900 600', minX: 0, maxX: 1, minY: 0, maxY: 1 };
    }
    let mx = Infinity, M= -Infinity, my = Infinity, My = -Infinity;
    for (const [x, y] of trackOutline) {
      if (x < mx) mx = x;
      if (x > M) M = x;
      if (y < my) my = y;
      if (y > My) My = y;
    }
    const pad = 200;
    const w = M - mx + pad * 2;
    const h = My - my + pad * 2;
    // Note: In SVG, +y is down. In F1 telemetry, +y can be North (up).
    // We will handle the flip in the SVG transform if needed.
    return {
      viewBox: `${mx - pad} ${my - pad} ${w} ${h}`,
      minX: mx, maxX: M, minY: my, maxY: My
    };
  }, [trackOutline]);

  const trackPath = useMemo(() => {
    if (!trackOutline || trackOutline.length < 2) return '';
    return trackOutline.map(([x, y]) => `${x},${-y}`).join(' '); // Flip Y for typical geographic orientation
  }, [trackOutline]);

  const driverTrailPaths = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [dn, trail] of Object.entries(positionTrails)) {
      if (trail && trail.length > 1) {
        result[dn] = trail.map(([x, y]) => `${x},${-y}`).join(' '); // Flip Y
      }
    }
    return result;
  }, [positionTrails]);

  // Flip Y for the SVG viewBox coordinate space as well.
  const svgViewBox = useMemo(() => {
    const pad = 300;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    // minX is same. minY becomes -maxY because we multiply all Ys by -1.
    return `${minX - pad} ${-maxY - pad} ${w} ${h}`;
  }, [minX, maxX, minY, maxY]);

  // Use the exact lat/lon bounds for the SVG Overlay.
  // We try to match circuitName, or fallback to China bounds, or Default.
  let geoBounds = TRACK_BOUNDS["Shanghai"];
  if (circuitName && TRACK_BOUNDS[circuitName]) {
    geoBounds = TRACK_BOUNDS[circuitName];
  } else {
    // Try to fuzzy match
    for (const key of Object.keys(TRACK_BOUNDS)) {
      if (circuitName?.toLowerCase().includes(key.toLowerCase())) {
        geoBounds = TRACK_BOUNDS[key];
        break;
      }
    }
  }

  if (!trackOutline || trackOutline.length < 10) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-neutral-600 font-mono text-sm animate-pulse">Loading circuit data...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" style={{ isolation: 'isolate' }}>
      <MapContainer
        bounds={geoBounds}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full absolute inset-0 z-0 bg-neutral-900"
      >
        <MapFitter bounds={geoBounds} />
        {/* We use CartoDB Dark Matter tiles which look super sleek and aesthetic */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        <SVGOverlay attributes={{ viewBox: svgViewBox }} bounds={geoBounds}>
          {/* F1 Tracks & Overlays */}
          <g>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="8" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Render the telemetry track geometry directly aligned on the Map */}
            <polyline
              points={trackPath}
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="45"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            <polyline
              points={trackPath}
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="15"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Racing lines / trails */}
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
                  strokeWidth={isSelected ? '25' : '10'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={isSelected ? 1 : 0.3}
                  style={{ transition: 'opacity 0.5s, stroke-width 0.3s' }}
                />
              );
            })}

            {/* Car marker elements (we use SVGs inside the overlay) */}
            <AnimatePresence>
              {cars.map((car: any) => {
                const x = car.location?.x || 0;
                const y = -(car.location?.y || 0); // Flip Y
                if (x === 0 && y === 0) return null;
                const isSelected = selectedDriver === car.number;
                const teamColor = getTeamColor(car);

                return (
                  <motion.g
                    key={`car-${car.number}`}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      onSelectDriver(car.number);
                    }}
                    style={{ cursor: 'pointer' }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, x, y }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 50, damping: 15 }}
                  >
                    {isSelected && (
                      <circle cx={0} cy={0} r="250" fill="none" stroke={teamColor} strokeWidth="15" opacity={0.6}>
                        <animate attributeName="r" values="100;300;100" dur="1.5s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.8;0.0;0.8" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                    )}
                    
                    {/* The Car SVG Pointer */}
                    <path
                      d={isSelected ? 'M0,-250 L100,-50 L200,50 L-200,50 L-100,-50 Z' : 'M0,-120 L70,0 L-70,0 Z'}
                      fill={teamColor}
                      stroke="#fff"
                      strokeWidth={isSelected ? '20' : '10'}
                      filter="url(#glow)"
                      style={{ transformOrigin: '0 0' }}
                    />
                    
                    {isSelected && (
                      <text
                        x="0"
                        y="-350"
                        textAnchor="middle"
                        fill="#fff"
                        fontSize="250"
                        fontFamily="monospace"
                        fontWeight="900"
                      >
                        {car.id}
                      </text>
                    )}
                  </motion.g>
                );
              })}
            </AnimatePresence>
          </g>
        </SVGOverlay>
      </MapContainer>
      
      {/* Front-facing overlay UI elements if needed can go here, like zoom buttons */}
      <div className="absolute top-4 right-4 z-[400] bg-black/50 text-white backdrop-blur px-3 py-1 rounded text-[10px] uppercase font-black tracking-widest pointer-events-none">
        OpenStreetMap Source (Live Telemetry Overlay)
      </div>
    </div>
  );
}
