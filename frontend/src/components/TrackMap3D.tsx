import React, { useMemo, useEffect, useRef, useState } from 'react';
import Map, { Source, Layer, MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion } from 'framer-motion';
import { Camera, Navigation, Map as MapIcon, Maximize } from 'lucide-react';

interface TrackMap3DProps {
  trackOutline: number[][];
  cars: any[];
  positionTrails: Record<string, number[][]>;
  selectedDriver: number | null;
  onSelectDriver: (n: number) => void;
  circuitName?: string;
}

// A dictionary of approximate track origins to project F1 telemetry onto actual world coordinates.
const TRACK_ORIGINS: Record<string, { lat: number; lng: number; rot: number; scale: number; flip: boolean }> = {
  "Shanghai": { lat: 31.3387, lng: 121.2201, rot: 0, scale: 0.000009, flip: false },
  "Melbourne": { lat: -37.8497, lng: 144.968, rot: 0, scale: 0.000009, flip: false },
  "Bahrain": { lat: 26.0325, lng: 50.5106, rot: 0, scale: 0.000009, flip: false },
  "Default": { lat: 31.3387, lng: 121.2201, rot: 0, scale: 0.000009, flip: false }
};

function f1ToLngLat(x: number, y: number, meta = TRACK_ORIGINS["Default"]) {
  const rX = x * Math.cos(meta.rot) - y * Math.sin(meta.rot);
  const rY = x * Math.sin(meta.rot) + y * Math.cos(meta.rot);
  // F1 Y is usually North (+), X is East (+).
  const lat = meta.lat + (meta.flip ? -rY : rY) * meta.scale;
  const lng = meta.lng + (rX * meta.scale / Math.cos(meta.lat * Math.PI / 180));
  return [lng, lat];
}

export default function TrackMap3D({
  trackOutline,
  cars,
  positionTrails,
  selectedDriver,
  onSelectDriver,
  circuitName
}: TrackMap3DProps) {

  const mapRef = useRef<MapRef | null>(null);
  const [viewAngle, setViewAngle] = useState<'free' | 'chase' | 'top'>('free');

  const meta = useMemo(() => {
    if (!circuitName) return TRACK_ORIGINS["Default"];
    for (const key of Object.keys(TRACK_ORIGINS)) {
      if (circuitName.toLowerCase().includes(key.toLowerCase())) return TRACK_ORIGINS[key];
    }
    return TRACK_ORIGINS["Default"];
  }, [circuitName]);

  // Provide the Base Line geojson from telemetry
  const outlineGeojson = useMemo(() => {
    if (!trackOutline?.length) return null;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: trackOutline.map(pt => f1ToLngLat(pt[0], pt[1], meta))
        }
      }]
    };
  }, [trackOutline, meta]);

  // Provide Trails Geojson
  const trailsGeojson = useMemo(() => {
    const features: any[] = [];
    for (const [dn, trail] of Object.entries(positionTrails)) {
      if (trail && trail.length > 1) {
        const c = cars.find(car => car.number.toString() === dn);
        const isSelected = selectedDriver === Number(dn);
        features.push({
          type: 'Feature',
          properties: {
            driver_no: dn,
            color: c?.color || '#888',
            width: isSelected ? 8 : 3,
            opacity: isSelected ? 1.0 : 0.3
          },
          geometry: {
            type: 'LineString',
            coordinates: trail.map(pt => f1ToLngLat(pt[0], pt[1], meta))
          }
        });
      }
    }
    return { type: 'FeatureCollection', features };
  }, [positionTrails, selectedDriver, cars, meta]);

  // Provide Current Car Markers Geojson
  const carsGeojson = useMemo(() => {
    const features: any[] = [];
    for (const car of cars) {
      if (!car.location?.x && !car.location?.y) continue;
      const isSelected = selectedDriver === car.number;
      features.push({
        type: 'Feature',
        properties: {
          id: car.id,
          number: car.number,
          color: car.color || '#fff',
          selected: isSelected
        },
        geometry: {
          type: 'Point',
          coordinates: f1ToLngLat(car.location.x, car.location.y, meta)
        }
      });
    }
    return { type: 'FeatureCollection', features };
  }, [cars, selectedDriver, meta]);

  // Fit bounds on initial load if top view/free
  useEffect(() => {
    if (trackOutline?.length && viewAngle !== 'chase' && mapRef.current) {
      const lats = trackOutline.map(p => f1ToLngLat(p[0], p[1], meta)[1]);
      const lngs = trackOutline.map(p => f1ToLngLat(p[0], p[1], meta)[0]);
      mapRef.current.fitBounds([
         [Math.min(...lngs), Math.min(...lats)],
         [Math.max(...lngs), Math.max(...lats)]
      ], { padding: 50, duration: 1000 });
    }
  }, [trackOutline, viewAngle, meta]);

  // Chase Cam Logic
  useEffect(() => {
    if (viewAngle === 'chase' && selectedDriver && mapRef.current) {
      const car = cars.find(c => c.number === selectedDriver);
      if (car?.location?.x && car?.location?.y) {
        const [lng, lat] = f1ToLngLat(car.location.x, car.location.y, meta);
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: 16.5,
          pitch: 70,       // Full 3D tilt
          duration: 800    // Smooth follow
        });
      }
    }
  }, [cars, selectedDriver, viewAngle, meta]);

  // Top Down Mode Transition
  useEffect(() => {
    if (viewAngle === 'top' && mapRef.current) {
      mapRef.current.flyTo({
          pitch: 0,
          bearing: 0,
          duration: 1000
      });
    }
  }, [viewAngle]);

  return (
    <div className="w-full h-full relative isolate">
      
      {/* 3D Map Container */}
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: meta.lng,
          latitude: meta.lat,
          zoom: 13,
          pitch: 45
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        interactive={viewAngle === 'free'}
        onClick={(e: any) => {
           const features = mapRef.current?.queryRenderedFeatures(e.point, { layers: ['car-markers-layer'] });
           if (features && features.length > 0) {
             onSelectDriver(features[0].properties.number);
           }
        }}
      >
        {/* Track Outline Layer */}
        {outlineGeojson && (
          <Source id="track-outline" type="geojson" data={outlineGeojson}>
            <Layer
              id="track-outline-layer"
              type="line"
              paint={{
                'line-color': '#ffffff',
                'line-opacity': 0.15,
                'line-width': 12
              }}
            />
          </Source>
        )}

        {/* Trail Extrusions (Racing Lines) */}
        {trailsGeojson && (
          <Source id="track-trails" type="geojson" data={trailsGeojson}>
            <Layer
              id="track-trails-layer"
              type="line"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': ['get', 'width'],
                'line-opacity': ['get', 'opacity'],
                'line-blur': 1
              }}
            />
          </Source>
        )}

        {/* Car Position Markers (Circles w/ Names) */}
        {carsGeojson && (
          <Source id="car-markers" type="geojson" data={carsGeojson}>
            {/* Outer Glow */}
            <Layer
              id="car-markers-glow"
              type="circle"
              paint={{
                'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 20, 10],
                'circle-color': ['get', 'color'],
                'circle-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.4, 0.0],
                'circle-blur': 1
              }}
            />
            {/* Inner Dot */}
            <Layer
              id="car-markers-layer"
              type="circle"
              paint={{
                'circle-radius': ['case', ['boolean', ['get', 'selected'], false], 8, 5],
                'circle-color': ['get', 'color'],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#ffffff'
              }}
            />
            {/* Driver Name Labels */}
            <Layer
              id="car-labels-layer"
              type="symbol"
              layout={{
                'text-field': ['get', 'id'],
                'text-size': ['case', ['boolean', ['get', 'selected'], false], 16, 10],
                'text-offset': [0, 1.5],
                'text-anchor': 'top'
              }}
              paint={{
                'text-color': '#fff',
                'text-halo-color': '#000',
                'text-halo-width': 2
              }}
            />
          </Source>
        )}
      </Map>

      {/* Camera Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button 
          onClick={() => setViewAngle('free')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${viewAngle === 'free' ? 'bg-red-600 text-white border-red-500' : 'bg-black/80 backdrop-blur-md text-neutral-400 border-white/10 hover:border-white/30'}`}
        >
          <MapIcon className="w-3 h-3" /> Free Roam
        </button>
        <button 
          onClick={() => setViewAngle('top')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${viewAngle === 'top' ? 'bg-red-600 text-white border-red-500' : 'bg-black/80 backdrop-blur-md text-neutral-400 border-white/10 hover:border-white/30'}`}
        >
          <Maximize className="w-3 h-3" /> Top Down
        </button>
        <button 
          onClick={() => {
            if (!selectedDriver) onSelectDriver(cars[0]?.number);
            setViewAngle('chase');
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${viewAngle === 'chase' ? 'bg-red-600 text-white border-red-500' : 'bg-black/80 backdrop-blur-md text-neutral-400 border-white/10 hover:border-white/30'}`}
        >
          <Navigation className="w-3 h-3" /> Chase Cam
        </button>
      </div>

    </div>
  );
}
