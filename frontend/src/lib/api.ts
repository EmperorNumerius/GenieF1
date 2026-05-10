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

export async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = apiUrl(path);
  const response = await fetch(url, options);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`API call failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.json() as Promise<T>;
}