/**
 * Central API base resolution.
 *
 * Production: NEXT_PUBLIC_API_BASE is baked in at build time
 *   (e.g. https://f1-api.numeri.us)
 * Dev:        falls back to http://localhost:8000
 *
 * WS_BASE derives the websocket URL from API_BASE so https → wss automatically.
 */

export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, '') || 'http://localhost:8000';

export const WS_BASE: string = API_BASE.replace(/^http(s?):/, (_, s) => `ws${s}:`);

export function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function wsUrl(path: string): string {
  if (path.startsWith('ws')) return path;
  return `${WS_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}
