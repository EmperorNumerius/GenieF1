import React, { useEffect, useMemo, useRef, useState } from 'react';
import MapLibreMap, { AttributionControl, Layer, MapRef, Source } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { Map as MapIcon, Maximize, Monitor, Navigation, Pause, Play, RotateCcw } from 'lucide-react';
import { resolveCircuit } from '../lib/circuits';
import type { CircuitConfig } from '../lib/circuits';

// ─── Types ───────────────────────────────────────────────────────────────────

type LngLat = [number, number];
type CameraMode = 'free' | 'chase' | 'top' | 'broadcast';
type TimelineMode = 'live' | 'replay';

interface CarState {
  id: string;
  number: number;
  color?: string;
  pos?: number;
  speed?: number;
  location?: {
    x?: number;
    y?: number;
    z?: number;
  };
}

interface TrackMap3DProps {
  trackOutline: number[][];
  cars: CarState[];
  positionTrails: Record<string, number[][]>;
  selectedDriver: number | null;
  onSelectDriver: (n: number) => void;
  circuitName?: string;
}

type TrailProperties = {
  driver_no: string;
  color: string;
  width: number;
  opacity: number;
};

type CarFeatureProperties = {
  id: string;
  number: number;
  color: string;
  selected: boolean;
  speed: number;
  pos: number;
};

// ─── MapLibre style with OSM raster tiles ─────────────────────────────────────
// We inject the OSM tile source directly into a minimal style JSON object so
// that no external style CDN is required.  A dark-mode CSS filter is applied
// to the tile canvas via a scoped class so that text/vector overlays are
// unaffected.

const OSM_MAP_STYLE = {
  version: 8 as const,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'osm-tiles': {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-tiles-layer',
      type: 'raster' as const,
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 22,
      paint: {
        'raster-opacity': 1,
      },
    },
  ],
};

// ─── Replay buffer ────────────────────────────────────────────────────────────

const MAX_REPLAY_POINTS = 2400;

// ─── Coordinate transform ─────────────────────────────────────────────────────

/**
 * Convert F1 telemetry (x, y) to WGS-84 [lng, lat] using per-circuit
 * calibration from circuits.ts.
 *
 * Steps:
 *  1. Rotate the (x, y) vector by rotationDeg (clockwise).
 *  2. Scale to degrees using scaleX / scaleY.
 *  3. Apply cosine correction to longitude.
 *  4. Offset from circuit centre.
 *
 * flipY handles circuits where the telemetry Y axis increases southward.
 */
function f1ToLngLat(x: number, y: number, cfg: CircuitConfig): LngLat {
  const rad = (cfg.rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  const rx = x * cosR - y * sinR;
  const ry = x * sinR + y * cosR;

  const cosLat = Math.cos((cfg.centerLat * Math.PI) / 180);

  const lat = cfg.centerLat + (cfg.flipY ? -ry : ry) * cfg.scaleY;
  const lng = cfg.centerLng + (rx * cfg.scaleX) / (cosLat || 1);

  return [lng, lat];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMapColor(color?: string): string {
  if (!color) return '#888';
  return color.startsWith('#') ? color : `#${color}`;
}

function isSamePoint(a: LngLat, b: LngLat): boolean {
  return Math.abs(a[0] - b[0]) < 1e-10 && Math.abs(a[1] - b[1]) < 1e-10;
}

function interpolateTrailPoint(trail: LngLat[] | undefined, frame: number): LngLat | null {
  if (!trail || trail.length === 0) return null;
  if (trail.length === 1) return trail[0];

  const clamped = Math.max(0, Math.min(frame, trail.length - 1));
  const startIndex = Math.floor(clamped);
  const endIndex = Math.min(startIndex + 1, trail.length - 1);
  const progress = clamped - startIndex;
  const start = trail[startIndex];
  const end = trail[endIndex];

  return [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress,
  ];
}

function trailUntilFrame(trail: LngLat[] | undefined, frame: number): LngLat[] {
  if (!trail || trail.length < 2) return [];

  const clamped = Math.max(0, Math.min(frame, trail.length - 1));
  const whole = Math.floor(clamped);
  const coords = trail.slice(0, whole + 1);

  if (whole < clamped) {
    const extraPoint = interpolateTrailPoint(trail, clamped);
    if (extraPoint) coords.push(extraPoint);
  }

  return coords;
}

function headingFromTrail(trail: LngLat[] | undefined, frame: number): number {
  const now = interpolateTrailPoint(trail, frame);
  const before = interpolateTrailPoint(trail, Math.max(0, frame - 4));
  if (!now || !before) return 0;
  const dLng = now[0] - before[0];
  const dLat = now[1] - before[1];
  const heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  return (heading + 360) % 360;
}

function distanceMeters(a: LngLat, b: LngLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TrackMap3D({
  trackOutline,
  cars,
  positionTrails,
  selectedDriver,
  onSelectDriver,
  circuitName,
}: TrackMap3DProps) {
  const mapRef = useRef<MapRef | null>(null);
  const cameraTickRef = useRef(0);
  const [cameraMode, setCameraMode] = useState<CameraMode>('broadcast');
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('live');
  const [replayFrameRaw, setReplayFrameRaw] = useState(0);
  const [isReplayPlaying, setIsReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(2);
  const [replayTrails, setReplayTrails] = useState<Record<string, LngLat[]>>({});
  const [mapError, setMapError] = useState<string | null>(null);

  // ── Circuit calibration ──────────────────────────────────────────────────

  const circuitCfg = useMemo<CircuitConfig>(() => resolveCircuit(circuitName), [circuitName]);

  // ── Fly to circuit when circuitName changes ───────────────────────────────

  const prevCircuitRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!mapRef.current) return;
    if (prevCircuitRef.current === circuitName) return;
    prevCircuitRef.current = circuitName;

    mapRef.current.flyTo({
      center: [circuitCfg.centerLng, circuitCfg.centerLat],
      zoom: circuitCfg.zoom,
      pitch: 0,
      bearing: 0,
      duration: 1200,
    });
  }, [circuitCfg, circuitName]);

  // ── Coordinate projections ───────────────────────────────────────────────

  const projectedTrackOutline = useMemo<LngLat[]>(() => {
    if (!trackOutline?.length) return [];
    return trackOutline.map((pt) => f1ToLngLat(pt[0], pt[1], circuitCfg));
  }, [trackOutline, circuitCfg]);

  const projectedFeedTrails = useMemo<Record<string, LngLat[]>>(() => {
    const trails: Record<string, LngLat[]> = {};
    for (const [driverNo, rawTrail] of Object.entries(positionTrails || {})) {
      if (!rawTrail?.length) continue;
      trails[driverNo] = rawTrail.map((pt) => f1ToLngLat(pt[0], pt[1], circuitCfg));
    }
    return trails;
  }, [positionTrails, circuitCfg]);

  // ── Reset replay state on circuit change ─────────────────────────────────

  useEffect(() => {
    setReplayTrails({});
    setTimelineMode('live');
    setIsReplayPlaying(false);
    setReplayFrameRaw(0);
  }, [circuitCfg]);

  // ── Accumulate replay buffer ──────────────────────────────────────────────

  useEffect(() => {
    setReplayTrails((prev) => {
      let changed = false;
      const next: Record<string, LngLat[]> = { ...prev };

      for (const [driverNo, trail] of Object.entries(projectedFeedTrails)) {
        if (!trail.length) continue;
        const existing = next[driverNo] || [];

        if (!existing.length) {
          next[driverNo] = trail.slice(-MAX_REPLAY_POINTS);
          changed = true;
          continue;
        }

        const existingLast = existing[existing.length - 1];
        let appendIndex = -1;
        for (let i = Math.max(0, trail.length - 30); i < trail.length; i += 1) {
          if (isSamePoint(trail[i], existingLast)) appendIndex = i + 1;
        }

        const toAppend =
          appendIndex >= 0 ? trail.slice(appendIndex) : [trail[trail.length - 1]];
        if (!toAppend.length) continue;

        const merged = [...existing, ...toAppend];
        if (merged.length > MAX_REPLAY_POINTS) {
          merged.splice(0, merged.length - MAX_REPLAY_POINTS);
        }

        if (!isSamePoint(existing[existing.length - 1], merged[merged.length - 1])) {
          next[driverNo] = merged;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [projectedFeedTrails]);

  // ── Frame calculations ────────────────────────────────────────────────────

  const replayMaxFrame = useMemo(() => {
    const maxLength = Object.values(replayTrails).reduce(
      (best, trail) => Math.max(best, trail.length),
      0
    );
    return Math.max(0, maxLength - 1);
  }, [replayTrails]);

  const liveMaxFrame = useMemo(() => {
    const maxLength = Object.values(projectedFeedTrails).reduce(
      (best, trail) => Math.max(best, trail.length),
      0
    );
    return Math.max(0, maxLength - 1);
  }, [projectedFeedTrails]);

  useEffect(() => {
    if (timelineMode !== 'replay' || !isReplayPlaying || replayMaxFrame <= 0) return;

    const interval = setInterval(() => {
      setReplayFrameRaw((prev) => {
        const next = prev + replaySpeed;
        if (next >= replayMaxFrame) {
          setIsReplayPlaying(false);
          return replayMaxFrame;
        }
        return next;
      });
    }, 90);

    return () => clearInterval(interval);
  }, [timelineMode, isReplayPlaying, replaySpeed, replayMaxFrame]);

  const replayFrame =
    timelineMode === 'live' ? replayMaxFrame : Math.min(replayFrameRaw, replayMaxFrame);
  const activeFrame = timelineMode === 'live' ? liveMaxFrame : replayFrame;
  const activeTrailSource = timelineMode === 'live' ? projectedFeedTrails : replayTrails;

  const trailSegments = useMemo<Record<string, LngLat[]>>(() => {
    if (timelineMode === 'live') return activeTrailSource;

    const segments: Record<string, LngLat[]> = {};
    for (const [driverNo, trail] of Object.entries(activeTrailSource)) {
      const capped = trailUntilFrame(trail, activeFrame);
      if (capped.length > 1) segments[driverNo] = capped;
    }
    return segments;
  }, [activeTrailSource, timelineMode, activeFrame]);

  // ── GeoJSON features ──────────────────────────────────────────────────────

  const outlineGeojson = useMemo<FeatureCollection<LineString> | null>(() => {
    if (!projectedTrackOutline.length) return null;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: projectedTrackOutline,
          },
        },
      ],
    };
  }, [projectedTrackOutline]);

  const carsByNumber = useMemo(() => {
    const lookup = new Map<string, CarState>();
    for (const car of cars) lookup.set(String(car.number), car);
    return lookup;
  }, [cars]);

  const trailsGeojson = useMemo<FeatureCollection<LineString, TrailProperties>>(() => {
    const features: Array<Feature<LineString, TrailProperties>> = [];
    for (const [driverNo, trail] of Object.entries(trailSegments)) {
      if (trail.length < 2) continue;
      const car = carsByNumber.get(driverNo);
      const isSelected = selectedDriver === Number(driverNo);
      features.push({
        type: 'Feature',
        properties: {
          driver_no: driverNo,
          color: toMapColor(car?.color),
          width: isSelected ? 8 : 3,
          opacity: isSelected ? 0.95 : 0.34,
        },
        geometry: {
          type: 'LineString',
          coordinates: trail,
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [trailSegments, carsByNumber, selectedDriver]);

  const activeCars = useMemo(() => {
    return cars
      .map((car) => {
        const driverNo = String(car.number);
        const trail = activeTrailSource[driverNo];
        let coordinates: LngLat | null = null;

        if (timelineMode === 'replay') {
          coordinates = interpolateTrailPoint(trail, activeFrame);
        }

        if (!coordinates && car.location?.x != null && car.location?.y != null) {
          coordinates = f1ToLngLat(car.location.x, car.location.y, circuitCfg);
        }

        if (!coordinates) return null;

        return {
          car,
          coordinates,
          heading: headingFromTrail(
            trail,
            timelineMode === 'live' ? liveMaxFrame : activeFrame
          ),
        };
      })
      .filter(
        (
          entry
        ): entry is { car: CarState; coordinates: LngLat; heading: number } => !!entry
      );
  }, [cars, activeTrailSource, timelineMode, activeFrame, circuitCfg, liveMaxFrame]);

  const activeCarLookup = useMemo(() => {
    const lookup = new Map<number, { car: CarState; coordinates: LngLat; heading: number }>();
    for (const entry of activeCars) lookup.set(entry.car.number, entry);
    return lookup;
  }, [activeCars]);

  const carsGeojson = useMemo<FeatureCollection<Point, CarFeatureProperties>>(() => {
    const features: Array<Feature<Point, CarFeatureProperties>> = activeCars.map((entry) => {
      const isSelected = selectedDriver === entry.car.number;
      return {
        type: 'Feature',
        properties: {
          id: String(entry.car.id ?? entry.car.number),
          number: entry.car.number,
          color: toMapColor(entry.car.color),
          selected: isSelected,
          speed: Number(entry.car.speed || 0),
          pos: Number(entry.car.pos || 0),
        },
        geometry: {
          type: 'Point',
          coordinates: entry.coordinates,
        },
      };
    });
    return { type: 'FeatureCollection', features };
  }, [activeCars, selectedDriver]);

  const selectedProjectionGeojson = useMemo<FeatureCollection<LineString> | null>(() => {
    if (!selectedDriver) return null;
    const trail = activeTrailSource[String(selectedDriver)];
    if (!trail || trail.length < 2) return null;

    const frame = timelineMode === 'live' ? trail.length - 1 : activeFrame;
    const now = interpolateTrailPoint(trail, frame);
    const back = interpolateTrailPoint(trail, Math.max(0, frame - 5));
    if (!now || !back) return null;

    const dLng = now[0] - back[0];
    const dLat = now[1] - back[1];
    if (Math.abs(dLng) + Math.abs(dLat) < 1e-9) return null;

    const lookAhead: LngLat[] = [now];
    for (let i = 1; i <= 8; i += 1) {
      lookAhead.push([now[0] + dLng * i * 1.25, now[1] + dLat * i * 1.25]);
    }

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: lookAhead,
          },
        },
      ],
    };
  }, [selectedDriver, activeTrailSource, timelineMode, activeFrame]);

  const selectedFocus = useMemo(() => {
    if (!selectedDriver) return null;
    const selected = activeCarLookup.get(selectedDriver);
    if (!selected) return null;
    return {
      coordinates: selected.coordinates,
      heading: selected.heading,
    };
  }, [selectedDriver, activeCarLookup]);

  const battleInfo = useMemo(() => {
    if (!selectedDriver) return null;
    const selected = cars.find((car) => car.number === selectedDriver);
    if (!selected) return null;

    const ahead = selected.pos ? cars.find((car) => car.pos === selected.pos! - 1) : null;
    const behind = selected.pos ? cars.find((car) => car.pos === selected.pos! + 1) : null;
    const selectedCoords = activeCarLookup.get(selectedDriver)?.coordinates;

    const aheadGap =
      ahead && selectedCoords && activeCarLookup.get(ahead.number)?.coordinates
        ? Math.round(
            distanceMeters(selectedCoords, activeCarLookup.get(ahead.number)!.coordinates)
          )
        : null;
    const behindGap =
      behind && selectedCoords && activeCarLookup.get(behind.number)?.coordinates
        ? Math.round(
            distanceMeters(selectedCoords, activeCarLookup.get(behind.number)!.coordinates)
          )
        : null;

    return { ahead, behind, aheadGap, behindGap };
  }, [cars, selectedDriver, activeCarLookup]);

  const trackBounds = useMemo(() => {
    if (projectedTrackOutline.length < 2) return null;
    const lats = projectedTrackOutline.map((p) => p[1]);
    const lngs = projectedTrackOutline.map((p) => p[0]);
    return [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ] as [LngLat, LngLat];
  }, [projectedTrackOutline]);

  // ── Camera effects ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapRef.current || !trackBounds) return;
    mapRef.current.fitBounds(trackBounds, { padding: 64, duration: 1000, maxZoom: 16 });
  }, [trackBounds]);

  useEffect(() => {
    if (!mapRef.current || !trackBounds) return;

    if (cameraMode === 'top') {
      mapRef.current.fitBounds(trackBounds, { padding: 80, duration: 900, maxZoom: 16.2 });
      mapRef.current.easeTo({ pitch: 0, bearing: 0, duration: 900 });
      return;
    }

    if (cameraMode === 'free') {
      mapRef.current.fitBounds(trackBounds, { padding: 64, duration: 800, maxZoom: 16 });
      mapRef.current.easeTo({ pitch: 45, bearing: 0, duration: 800 });
    }
  }, [cameraMode, trackBounds]);

  useEffect(() => {
    if (!mapRef.current || !selectedFocus) return;
    if (cameraMode !== 'chase' && cameraMode !== 'broadcast') return;

    const now = Date.now();
    if (now - cameraTickRef.current < 120) return;
    cameraTickRef.current = now;

    mapRef.current.easeTo({
      center: selectedFocus.coordinates,
      zoom: cameraMode === 'broadcast' ? 17.25 : 16.4,
      pitch: cameraMode === 'broadcast' ? 68 : 55,
      bearing: selectedFocus.heading,
      duration: 340,
      offset: cameraMode === 'broadcast' ? [0, 170] : [0, 100],
    });
  }, [cameraMode, selectedFocus, activeFrame]);

  const leader = useMemo(() => {
    if (!cars.length) return null;
    return cars.reduce((best, current) => {
      if (!best) return current;
      const currentPos = current.pos ?? Number.MAX_SAFE_INTEGER;
      const bestPos = best.pos ?? Number.MAX_SAFE_INTEGER;
      return currentPos < bestPos ? current : best;
    }, null as CarState | null);
  }, [cars]);

  const replayProgress =
    replayMaxFrame > 0
      ? Math.round((Math.min(replayFrame, replayMaxFrame) / replayMaxFrame) * 100)
      : 0;

  // ── Error fallback ────────────────────────────────────────────────────────

  if (mapError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-neutral-950 rounded-xl border border-white/10 gap-4 p-8">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <MapIcon className="w-6 h-6 text-red-400" />
        </div>
        <div className="text-center max-w-xs">
          <p className="text-sm font-bold text-neutral-300 mb-1">Map tiles unavailable</p>
          <p className="text-xs font-mono text-neutral-500 leading-relaxed">
            OpenStreetMap tiles could not be loaded. This may be due to a network restriction or
            ad-blocker. Live telemetry data is still being received — try refreshing or check your
            network connection.
          </p>
          <p className="text-[10px] font-mono text-neutral-700 mt-3 italic">Error: {mapError}</p>
        </div>
        <button
          onClick={() => setMapError(null)}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-neutral-300 hover:bg-white/10 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full relative isolate overflow-hidden rounded-xl">
      {/*
        Dark-mode filter applied only to the raster tile canvas.
        invert(100%) flips the light OSM tiles to a dark background;
        hue-rotate(180deg) corrects the resulting colour cast so that
        roads, parks and water remain recognisably coloured.
        brightness / contrast fine-tune contrast to match the app palette.
        The filter class wraps only the MapLibre canvas — the vector layer
        overlay divs that MapLibre appends outside the canvas are siblings
        of the osm-dark-filter div and are therefore unaffected.
      */}
      <style>{`
        .osm-dark-filter .maplibregl-canvas {
          filter: invert(100%) hue-rotate(180deg) brightness(0.85) contrast(1.1);
        }
        .maplibregl-ctrl-attrib {
          background: rgba(0,0,0,0.7) !important;
          color: #6b7280 !important;
          font-size: 9px !important;
          border-radius: 4px !important;
        }
        .maplibregl-ctrl-attrib a {
          color: #9ca3af !important;
        }
      `}</style>

      {/* Tile canvas wrapper — receives the dark CSS filter */}
      <div className="osm-dark-filter w-full h-full">
        <MapLibreMap
          ref={mapRef}
          initialViewState={{
            longitude: circuitCfg.centerLng,
            latitude: circuitCfg.centerLat,
            zoom: circuitCfg.zoom,
            pitch: 45,
          }}
          mapStyle={OSM_MAP_STYLE}
          interactive={cameraMode === 'free'}
          attributionControl={false}
          onError={(e) => {
            // Surface tile-load failures only; ignore routine WebGL messages
            const msg =
              (e as { error?: { message?: string } }).error?.message ?? String(e);
            if (msg && msg.toLowerCase().includes('tile')) {
              setMapError(msg);
            }
          }}
          onClick={(e) => {
            const features = mapRef.current?.queryRenderedFeatures(e.point, {
              layers: ['car-markers-layer'],
            });
            if (features && features.length > 0) {
              const selectedNumber = Number(features[0].properties?.number);
              if (Number.isFinite(selectedNumber)) onSelectDriver(selectedNumber);
            }
          }}
        >
          {/* Track outline */}
          {outlineGeojson && (
            <Source id="track-outline" type="geojson" data={outlineGeojson}>
              <Layer
                id="track-outline-glow"
                type="line"
                paint={{
                  'line-color': '#ef4444',
                  'line-opacity': 0.25,
                  'line-width': 18,
                  'line-blur': 1.4,
                }}
                layout={{
                  'line-cap': 'round',
                  'line-join': 'round',
                }}
              />
              <Layer
                id="track-outline-layer"
                type="line"
                paint={{
                  'line-color': '#ffffff',
                  'line-opacity': 0.28,
                  'line-width': 9,
                }}
                layout={{
                  'line-cap': 'round',
                  'line-join': 'round',
                }}
              />
            </Source>
          )}

          {/* Driver trails */}
          <Source id="track-trails" type="geojson" data={trailsGeojson}>
            <Layer
              id="track-trails-layer"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': ['get', 'width'],
                'line-opacity': ['get', 'opacity'],
                'line-blur': 0.25,
              }}
              layout={{
                'line-cap': 'round',
                'line-join': 'round',
              }}
            />
          </Source>

          {/* Projection vector for selected driver */}
          {selectedProjectionGeojson && (
            <Source
              id="selected-driver-projection"
              type="geojson"
              data={selectedProjectionGeojson}
            >
              <Layer
                id="selected-driver-projection-layer"
                type="line"
                paint={{
                  'line-color': '#f43f5e',
                  'line-width': 3,
                  'line-opacity': 0.65,
                  'line-dasharray': [1.2, 1.1],
                }}
              />
            </Source>
          )}

          {/* Car markers */}
          <Source id="car-markers" type="geojson" data={carsGeojson}>
            <Layer
              id="car-markers-glow"
              type="circle"
              paint={{
                'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 21, 10],
                'circle-color': ['get', 'color'],
                'circle-opacity': [
                  'case',
                  ['boolean', ['get', 'selected'], false],
                  0.38,
                  0.03,
                ],
                'circle-blur': 1,
              }}
            />
            <Layer
              id="car-markers-layer"
              type="circle"
              paint={{
                'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 8, 5],
                'circle-color': ['get', 'color'],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff',
              }}
            />
            <Layer
              id="car-labels-layer"
              type="symbol"
              layout={{
                'text-field': [
                  'concat',
                  ['get', 'id'],
                  '  P',
                  ['to-string', ['get', 'pos']],
                  '  ',
                  ['to-string', ['get', 'speed']],
                  ' km/h',
                ],
                'text-size': ['case', ['boolean', ['get', 'selected'], false], 14, 10],
                'text-offset': [0, 1.4],
                'text-anchor': 'top',
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              }}
              paint={{
                'text-color': '#ffffff',
                'text-halo-color': '#000000',
                'text-halo-width': 2,
              }}
            />
          </Source>

          {/* Attribution — bottom-right, dark-styled via CSS above */}
          <AttributionControl
            position="bottom-right"
            customAttribution="© OpenStreetMap contributors"
            compact={true}
          />
        </MapLibreMap>
      </div>

      {/* ── Camera mode controls ── */}
      <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-2 max-w-[70%]">
        <button
          onClick={() => setCameraMode('free')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
            cameraMode === 'free'
              ? 'bg-red-600 text-white border-red-500'
              : 'bg-black/80 backdrop-blur-md text-neutral-400 border-white/10 hover:border-white/30'
          }`}
        >
          <MapIcon className="w-3 h-3" /> Free
        </button>
        <button
          onClick={() => setCameraMode('top')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
            cameraMode === 'top'
              ? 'bg-red-600 text-white border-red-500'
              : 'bg-black/80 backdrop-blur-md text-neutral-400 border-white/10 hover:border-white/30'
          }`}
        >
          <Maximize className="w-3 h-3" /> Top
        </button>
        <button
          onClick={() => {
            if (!selectedDriver && leader) onSelectDriver(leader.number);
            setCameraMode('chase');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
            cameraMode === 'chase'
              ? 'bg-red-600 text-white border-red-500'
              : 'bg-black/80 backdrop-blur-md text-neutral-400 border-white/10 hover:border-white/30'
          }`}
        >
          <Navigation className="w-3 h-3" /> Chase
        </button>
        <button
          onClick={() => {
            if (!selectedDriver && leader) onSelectDriver(leader.number);
            setCameraMode('broadcast');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${
            cameraMode === 'broadcast'
              ? 'bg-red-600 text-white border-red-500'
              : 'bg-black/80 backdrop-blur-md text-neutral-400 border-white/10 hover:border-white/30'
          }`}
        >
          <Monitor className="w-3 h-3" /> TV Cam
        </button>
      </div>

      {/* ── Battle radar ── */}
      {selectedDriver && battleInfo && (
        <div className="absolute top-4 right-4 z-10 bg-black/75 backdrop-blur-xl border border-white/15 rounded-xl px-3 py-2 text-[10px] font-mono min-w-[220px]">
          <p className="text-neutral-300 uppercase tracking-widest font-black mb-1">
            Battle Radar
          </p>
          <p className="text-neutral-200">
            Ahead:{' '}
            <span className="font-black text-white">
              {battleInfo.ahead
                ? `${battleInfo.ahead.id} (+${battleInfo.aheadGap ?? '--'}m)`
                : 'None'}
            </span>
          </p>
          <p className="text-neutral-200">
            Behind:{' '}
            <span className="font-black text-white">
              {battleInfo.behind
                ? `${battleInfo.behind.id} (-${battleInfo.behindGap ?? '--'}m)`
                : 'None'}
            </span>
          </p>
          <p className="text-neutral-500 mt-1">
            Replay buffer: {Math.max(0, replayMaxFrame + 1)} samples
          </p>
        </div>
      )}

      {/* ── Timeline / replay controls ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[min(740px,94%)] bg-black/75 border border-white/15 backdrop-blur-xl rounded-xl px-3 py-3">
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => {
              setTimelineMode('live');
              setIsReplayPlaying(false);
            }}
            className={`px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest uppercase border ${
              timelineMode === 'live'
                ? 'bg-red-600 border-red-500 text-white'
                : 'bg-white/5 border-white/10 text-neutral-300'
            }`}
          >
            Live
          </button>
          <button
            onClick={() => {
              setTimelineMode('replay');
              setIsReplayPlaying(false);
              setReplayFrameRaw(0);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest uppercase border ${
              timelineMode === 'replay'
                ? 'bg-red-600 border-red-500 text-white'
                : 'bg-white/5 border-white/10 text-neutral-300'
            }`}
          >
            <RotateCcw className="w-3 h-3" /> Replay
          </button>
          <button
            onClick={() => {
              if (timelineMode !== 'replay') setTimelineMode('replay');
              setIsReplayPlaying((prev) => !prev);
            }}
            disabled={replayMaxFrame <= 0}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black tracking-widest uppercase border bg-white/5 border-white/10 text-neutral-200 disabled:opacity-40"
          >
            {isReplayPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isReplayPlaying ? 'Pause' : 'Play'}
          </button>
          <div className="ml-auto flex items-center gap-1">
            {[1, 2, 4].map((speed) => (
              <button
                key={speed}
                onClick={() => setReplaySpeed(speed)}
                className={`px-2 py-1 rounded-md text-[10px] font-black border ${
                  replaySpeed === speed
                    ? 'bg-red-600 text-white border-red-500'
                    : 'bg-white/5 text-neutral-300 border-white/10'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={Math.max(1, replayMaxFrame)}
            step={1}
            value={Math.floor(Math.min(replayFrame, replayMaxFrame))}
            onChange={(event) => {
              setTimelineMode('replay');
              setIsReplayPlaying(false);
              setReplayFrameRaw(Number(event.target.value));
            }}
            className="w-full accent-red-500"
          />
          <p className="text-[10px] font-mono text-neutral-300 w-12 text-right">
            {replayProgress}%
          </p>
        </div>
      </div>
    </div>
  );
}
