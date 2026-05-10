'use client';

import { useState, useEffect, useRef } from 'react';
import { wsUrl } from '../lib/api';

export interface CarState {
  id: string;
  number: string;
  name: string;
  team: string;
  pos: number;
  speed: number;
  rpm: number;
  n_gear: number;
  throttle: number;
  brake: number;
  drs: number;
  tire: string;
  tire_age: number;
  last_lap_time: string | null;
  best_lap_time: string | null;
  sector_1: string | null;
  sector_2: string | null;
  sector_3: string | null;
  interval: string | null;
  gap_to_leader: string | null;
  pits: number;
}

export interface RaceState {
  session_name: string;
  session_type: string;
  track_status: string;
  lap: number;
  total_laps: number;
  cars: CarState[];
  weather: Record<string, any>;
  race_control: string[];
  trackOutline?: number[][];
  session?: any;
}

export function useRaceData() {
  const [data, setData] = useState<RaceState | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const backoff = useRef(1000);
  const lastKnownState = useRef<RaceState | null>(null);

  useEffect(() => {
    let isMounted = true;

    const connect = () => {
      if (!isMounted) return;
      if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
        return;
      }

      setStatus('connecting');
      const ws = new WebSocket(wsUrl('/ws/race_data'));

      ws.onopen = () => {
        if (!isMounted) return;
        setStatus('connected');
        backoff.current = 1000;
        if (lastKnownState.current) {
            setData(lastKnownState.current);
        }
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const parsed = JSON.parse(event.data);
          setData(parsed);
          lastKnownState.current = parsed;
        } catch (err) {
          console.error('Failed to parse WebSocket message', err);
        }
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setStatus('disconnected');
        wsRef.current = null;
        if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = setTimeout(() => {
          backoff.current = Math.min(backoff.current * 1.5, 30000);
          connect();
        }, backoff.current);
      };

      ws.onerror = () => {
        ws.close();
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []); // Intentionally leaving out `data` dependency to avoid reconnect loops

  return { data, status };
}
