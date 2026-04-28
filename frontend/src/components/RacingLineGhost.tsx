'use client';

import React, { useEffect, useRef } from 'react';

interface Location {
  x: number;
  y: number;
  z: number;
}

export interface Car {
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
  last_lap_time: number | string | null;
  lap_number: number;
  sector_1: number | string | null;
  sector_2: number | string | null;
  sector_3: number | string | null;
  location: Location;
}

export interface RacingLineBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface RacingLineGhostProps {
  cars: Car[];
  selectedId?: string | null;
  trailLength?: number;
  bounds?: RacingLineBounds;
}

type TrailPoint = { x: number; y: number };

function getCarColor(car: Car): string {
  return car.color?.startsWith('#') ? car.color : `#${car.color || '888888'}`;
}

export function RacingLineGhost({
  cars,
  selectedId = null,
  trailLength = 60,
  bounds,
}: RacingLineGhostProps) {
  // trails: map from car.id → array of {x,y}
  const trailsRef = useRef<Map<string, TrailPoint[]>>(new Map());

  // Update trails whenever cars prop changes
  useEffect(() => {
    for (const car of cars) {
      if (car.location == null) continue;
      const { x, y } = car.location;
      if (typeof x !== 'number' || typeof y !== 'number') continue;

      const existing = trailsRef.current.get(car.id) ?? [];
      const updated = [...existing, { x, y }].slice(-trailLength);
      trailsRef.current.set(car.id, updated);
    }
  });

  // Compute viewBox bounds
  const computedBounds: RacingLineBounds = React.useMemo(() => {
    if (bounds) return bounds;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const car of cars) {
      if (car.location == null) continue;
      const { x, y } = car.location;
      if (typeof x === 'number' && typeof y === 'number') {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (!isFinite(minX)) return { minX: 0, maxX: 100, minY: 0, maxY: 100 };
    // Add padding
    const padX = (maxX - minX) * 0.05 || 10;
    const padY = (maxY - minY) * 0.05 || 10;
    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minY: minY - padY,
      maxY: maxY + padY,
    };
  }, [cars, bounds]);

  const vbW = computedBounds.maxX - computedBounds.minX;
  const vbH = computedBounds.maxY - computedBounds.minY;
  const viewBox = `${computedBounds.minX} ${computedBounds.minY} ${vbW} ${vbH}`;

  const trails = trailsRef.current;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {cars.map((car) => {
        const trail = trails.get(car.id);
        if (!trail || trail.length < 2) return null;

        const isSelected = selectedId === car.id;
        const color = getCarColor(car);
        const strokeWidth = isSelected ? 3 : 1;

        // Render individual line segments with opacity increasing toward the end
        const segments: React.ReactNode[] = [];
        for (let i = 1; i < trail.length; i++) {
          const t = i / (trail.length - 1); // 0 → 1
          const opacity = 0.15 + t * (isSelected ? 0.85 : 0.45);
          const prev = trail[i - 1];
          const curr = trail[i];
          segments.push(
            <line
              key={i}
              x1={prev.x}
              y1={prev.y}
              x2={curr.x}
              y2={curr.y}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeOpacity={opacity}
              strokeLinecap="round"
            />
          );
        }

        return (
          <g key={car.id}>
            {segments}
          </g>
        );
      })}
    </svg>
  );
}
