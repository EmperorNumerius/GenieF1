/**
 * Per-circuit calibration table for converting F1 telemetry (x, y) coordinates
 * to real-world WGS-84 (longitude, latitude).
 *
 * The F1 LiveF1 stream emits positions in a local Cartesian frame (metres,
 * approximately).  The affine transform applied by f1ToLngLat is:
 *
 *   [x', y'] = Rot(rotationDeg) · [x, y]
 *   lat = centerLat + y' * scaleY
 *   lng = centerLng + x' * scaleX / cos(centerLat)
 *
 * Calibration notes
 * -----------------
 * scaleX / scaleY  ≈ (circuit length in degrees) / (telemetry coord range in units)
 * Typical F1 telemetry range: ±3 000–7 000 units.
 * At 50 °N latitude, 1 deg lat ≈ 111 km, 1 deg lng ≈ 71 km.
 *
 * rotationDeg aligns the telemetry frame with geographic north.
 * Values shown are reasonable estimates — fine-tune per circuit if needed.
 *
 * zoom is the MapLibre zoom level that fits the whole circuit in a ~800 px wide
 * panel (roughly zoom 14–15 for street circuits, 13–14 for full-size tracks).
 */

export interface CircuitConfig {
  /** Human-readable circuit name */
  label: string;
  /** WGS-84 latitude of track centroid */
  centerLat: number;
  /** WGS-84 longitude of track centroid */
  centerLng: number;
  /**
   * Clockwise rotation (degrees) to apply to telemetry coordinates before
   * projecting, so that the track outline aligns with the real-world map.
   */
  rotationDeg: number;
  /**
   * Longitude scale factor (degrees per telemetry unit, before cos-correction).
   * Includes the cos(lat) correction in f1ToLngLat — set as raw deg/unit.
   */
  scaleX: number;
  /**
   * Latitude scale factor (degrees per telemetry unit).
   */
  scaleY: number;
  /**
   * Whether to flip the Y axis (needed for tracks where the telemetry Y
   * increases southward rather than northward).
   */
  flipY: boolean;
  /** Suggested MapLibre zoom level for a circuit-overview view. */
  zoom: number;
}

/**
 * Lookup table keyed by lowercase circuit name / short name.
 * resolveCircuit() uses substring matching so partial names work too.
 */
export const CIRCUITS: Record<string, CircuitConfig> = {
  // ── Japan ──────────────────────────────────────────────────────────────────
  suzuka: {
    label: 'Suzuka Circuit',
    centerLat: 34.8431,
    centerLng: 136.5406,
    rotationDeg: 30,
    scaleX: 0.0000115,
    scaleY: 0.0000105,
    flipY: false,
    zoom: 14,
  },
  japan: {
    label: 'Suzuka Circuit',
    centerLat: 34.8431,
    centerLng: 136.5406,
    rotationDeg: 30,
    scaleX: 0.0000115,
    scaleY: 0.0000105,
    flipY: false,
    zoom: 14,
  },

  // ── Bahrain ────────────────────────────────────────────────────────────────
  bahrain: {
    label: 'Bahrain International Circuit',
    centerLat: 26.0325,
    centerLng: 50.5106,
    rotationDeg: 0,
    scaleX: 0.0000105,
    scaleY: 0.0000095,
    flipY: false,
    zoom: 14,
  },
  sakhir: {
    label: 'Bahrain International Circuit',
    centerLat: 26.0325,
    centerLng: 50.5106,
    rotationDeg: 0,
    scaleX: 0.0000105,
    scaleY: 0.0000095,
    flipY: false,
    zoom: 14,
  },

  // ── Saudi Arabia ───────────────────────────────────────────────────────────
  jeddah: {
    label: 'Jeddah Corniche Circuit',
    centerLat: 21.6319,
    centerLng: 39.1044,
    rotationDeg: -10,
    scaleX: 0.0000090,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },
  'saudi arabia': {
    label: 'Jeddah Corniche Circuit',
    centerLat: 21.6319,
    centerLng: 39.1044,
    rotationDeg: -10,
    scaleX: 0.0000090,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },

  // ── Australia ──────────────────────────────────────────────────────────────
  'albert park': {
    label: 'Albert Park Circuit',
    centerLat: -37.8497,
    centerLng: 144.9680,
    rotationDeg: 10,
    scaleX: 0.0000100,
    scaleY: 0.0000095,
    flipY: true,
    zoom: 14,
  },
  melbourne: {
    label: 'Albert Park Circuit',
    centerLat: -37.8497,
    centerLng: 144.9680,
    rotationDeg: 10,
    scaleX: 0.0000100,
    scaleY: 0.0000095,
    flipY: true,
    zoom: 14,
  },
  australia: {
    label: 'Albert Park Circuit',
    centerLat: -37.8497,
    centerLng: 144.9680,
    rotationDeg: 10,
    scaleX: 0.0000100,
    scaleY: 0.0000095,
    flipY: true,
    zoom: 14,
  },

  // ── China ──────────────────────────────────────────────────────────────────
  shanghai: {
    label: 'Shanghai International Circuit',
    centerLat: 31.3387,
    centerLng: 121.2201,
    rotationDeg: 0,
    scaleX: 0.0000095,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },
  china: {
    label: 'Shanghai International Circuit',
    centerLat: 31.3387,
    centerLng: 121.2201,
    rotationDeg: 0,
    scaleX: 0.0000095,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },

  // ── Miami ─────────────────────────────────────────────────────────────────
  miami: {
    label: 'Miami International Autodrome',
    centerLat: 25.9581,
    centerLng: -80.2389,
    rotationDeg: -5,
    scaleX: 0.0000095,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },

  // ── Imola ─────────────────────────────────────────────────────────────────
  imola: {
    label: 'Autodromo Enzo e Dino Ferrari',
    centerLat: 44.3439,
    centerLng: 11.7167,
    rotationDeg: -20,
    scaleX: 0.0000110,
    scaleY: 0.0000095,
    flipY: false,
    zoom: 14,
  },
  'emilia romagna': {
    label: 'Autodromo Enzo e Dino Ferrari',
    centerLat: 44.3439,
    centerLng: 11.7167,
    rotationDeg: -20,
    scaleX: 0.0000110,
    scaleY: 0.0000095,
    flipY: false,
    zoom: 14,
  },

  // ── Monaco ────────────────────────────────────────────────────────────────
  monaco: {
    label: 'Circuit de Monaco',
    centerLat: 43.7347,
    centerLng: 7.4206,
    rotationDeg: -40,
    scaleX: 0.0000085,
    scaleY: 0.0000080,
    flipY: false,
    zoom: 15,
  },

  // ── Spain / Barcelona ─────────────────────────────────────────────────────
  barcelona: {
    label: 'Circuit de Barcelona-Catalunya',
    centerLat: 41.5700,
    centerLng: 2.2611,
    rotationDeg: 5,
    scaleX: 0.0000100,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },
  spain: {
    label: 'Circuit de Barcelona-Catalunya',
    centerLat: 41.5700,
    centerLng: 2.2611,
    rotationDeg: 5,
    scaleX: 0.0000100,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },
  'catalunya': {
    label: 'Circuit de Barcelona-Catalunya',
    centerLat: 41.5700,
    centerLng: 2.2611,
    rotationDeg: 5,
    scaleX: 0.0000100,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },

  // ── Canada / Montreal ─────────────────────────────────────────────────────
  montreal: {
    label: 'Circuit Gilles Villeneuve',
    centerLat: 45.5000,
    centerLng: -73.5228,
    rotationDeg: -35,
    scaleX: 0.0000110,
    scaleY: 0.0000095,
    flipY: false,
    zoom: 14,
  },
  canada: {
    label: 'Circuit Gilles Villeneuve',
    centerLat: 45.5000,
    centerLng: -73.5228,
    rotationDeg: -35,
    scaleX: 0.0000110,
    scaleY: 0.0000095,
    flipY: false,
    zoom: 14,
  },
  'gilles villeneuve': {
    label: 'Circuit Gilles Villeneuve',
    centerLat: 45.5000,
    centerLng: -73.5228,
    rotationDeg: -35,
    scaleX: 0.0000110,
    scaleY: 0.0000095,
    flipY: false,
    zoom: 14,
  },

  // ── Austria / Red Bull Ring ───────────────────────────────────────────────
  'red bull ring': {
    label: 'Red Bull Ring',
    centerLat: 47.2197,
    centerLng: 14.7648,
    rotationDeg: -15,
    scaleX: 0.0000130,
    scaleY: 0.0000110,
    flipY: false,
    zoom: 14,
  },
  austria: {
    label: 'Red Bull Ring',
    centerLat: 47.2197,
    centerLng: 14.7648,
    rotationDeg: -15,
    scaleX: 0.0000130,
    scaleY: 0.0000110,
    flipY: false,
    zoom: 14,
  },
  spielberg: {
    label: 'Red Bull Ring',
    centerLat: 47.2197,
    centerLng: 14.7648,
    rotationDeg: -15,
    scaleX: 0.0000130,
    scaleY: 0.0000110,
    flipY: false,
    zoom: 14,
  },

  // ── UK / Silverstone ──────────────────────────────────────────────────────
  silverstone: {
    label: 'Silverstone Circuit',
    centerLat: 52.0786,
    centerLng: -1.0169,
    rotationDeg: -30,
    scaleX: 0.0000130,
    scaleY: 0.0000110,
    flipY: false,
    zoom: 13,
  },
  'great britain': {
    label: 'Silverstone Circuit',
    centerLat: 52.0786,
    centerLng: -1.0169,
    rotationDeg: -30,
    scaleX: 0.0000130,
    scaleY: 0.0000110,
    flipY: false,
    zoom: 13,
  },
  british: {
    label: 'Silverstone Circuit',
    centerLat: 52.0786,
    centerLng: -1.0169,
    rotationDeg: -30,
    scaleX: 0.0000130,
    scaleY: 0.0000110,
    flipY: false,
    zoom: 13,
  },

  // ── Hungary / Hungaroring ─────────────────────────────────────────────────
  hungaroring: {
    label: 'Hungaroring',
    centerLat: 47.5789,
    centerLng: 19.2486,
    rotationDeg: -10,
    scaleX: 0.0000115,
    scaleY: 0.0000100,
    flipY: false,
    zoom: 14,
  },
  hungary: {
    label: 'Hungaroring',
    centerLat: 47.5789,
    centerLng: 19.2486,
    rotationDeg: -10,
    scaleX: 0.0000115,
    scaleY: 0.0000100,
    flipY: false,
    zoom: 14,
  },

  // ── Belgium / Spa ─────────────────────────────────────────────────────────
  spa: {
    label: 'Circuit de Spa-Francorchamps',
    centerLat: 50.4372,
    centerLng: 5.9714,
    rotationDeg: -15,
    scaleX: 0.0000145,
    scaleY: 0.0000120,
    flipY: false,
    zoom: 13,
  },
  belgium: {
    label: 'Circuit de Spa-Francorchamps',
    centerLat: 50.4372,
    centerLng: 5.9714,
    rotationDeg: -15,
    scaleX: 0.0000145,
    scaleY: 0.0000120,
    flipY: false,
    zoom: 13,
  },
  'spa-francorchamps': {
    label: 'Circuit de Spa-Francorchamps',
    centerLat: 50.4372,
    centerLng: 5.9714,
    rotationDeg: -15,
    scaleX: 0.0000145,
    scaleY: 0.0000120,
    flipY: false,
    zoom: 13,
  },

  // ── Netherlands / Zandvoort ───────────────────────────────────────────────
  zandvoort: {
    label: 'Circuit Zandvoort',
    centerLat: 52.3888,
    centerLng: 4.5409,
    rotationDeg: 25,
    scaleX: 0.0000115,
    scaleY: 0.0000100,
    flipY: false,
    zoom: 14,
  },
  netherlands: {
    label: 'Circuit Zandvoort',
    centerLat: 52.3888,
    centerLng: 4.5409,
    rotationDeg: 25,
    scaleX: 0.0000115,
    scaleY: 0.0000100,
    flipY: false,
    zoom: 14,
  },
  dutch: {
    label: 'Circuit Zandvoort',
    centerLat: 52.3888,
    centerLng: 4.5409,
    rotationDeg: 25,
    scaleX: 0.0000115,
    scaleY: 0.0000100,
    flipY: false,
    zoom: 14,
  },

  // ── Italy / Monza ─────────────────────────────────────────────────────────
  monza: {
    label: 'Autodromo Nazionale di Monza',
    centerLat: 45.6156,
    centerLng: 9.2811,
    rotationDeg: -20,
    scaleX: 0.0000125,
    scaleY: 0.0000105,
    flipY: false,
    zoom: 13,
  },
  italy: {
    label: 'Autodromo Nazionale di Monza',
    centerLat: 45.6156,
    centerLng: 9.2811,
    rotationDeg: -20,
    scaleX: 0.0000125,
    scaleY: 0.0000105,
    flipY: false,
    zoom: 13,
  },
  italian: {
    label: 'Autodromo Nazionale di Monza',
    centerLat: 45.6156,
    centerLng: 9.2811,
    rotationDeg: -20,
    scaleX: 0.0000125,
    scaleY: 0.0000105,
    flipY: false,
    zoom: 13,
  },

  // ── Azerbaijan / Baku ─────────────────────────────────────────────────────
  baku: {
    label: 'Baku City Circuit',
    centerLat: 40.3725,
    centerLng: 49.8533,
    rotationDeg: -45,
    scaleX: 0.0000105,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },
  azerbaijan: {
    label: 'Baku City Circuit',
    centerLat: 40.3725,
    centerLng: 49.8533,
    rotationDeg: -45,
    scaleX: 0.0000105,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },

  // ── Singapore / Marina Bay ────────────────────────────────────────────────
  'marina bay': {
    label: 'Marina Bay Street Circuit',
    centerLat: 1.2914,
    centerLng: 103.8640,
    rotationDeg: -30,
    scaleX: 0.0000090,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },
  singapore: {
    label: 'Marina Bay Street Circuit',
    centerLat: 1.2914,
    centerLng: 103.8640,
    rotationDeg: -30,
    scaleX: 0.0000090,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },

  // ── USA / COTA ────────────────────────────────────────────────────────────
  cota: {
    label: 'Circuit of the Americas',
    centerLat: 30.1328,
    centerLng: -97.6411,
    rotationDeg: 5,
    scaleX: 0.0000110,
    scaleY: 0.0000095,
    flipY: false,
    zoom: 13,
  },
  austin: {
    label: 'Circuit of the Americas',
    centerLat: 30.1328,
    centerLng: -97.6411,
    rotationDeg: 5,
    scaleX: 0.0000110,
    scaleY: 0.0000095,
    flipY: false,
    zoom: 13,
  },
  'united states': {
    label: 'Circuit of the Americas',
    centerLat: 30.1328,
    centerLng: -97.6411,
    rotationDeg: 5,
    scaleX: 0.0000110,
    scaleY: 0.0000095,
    flipY: false,
    zoom: 13,
  },

  // ── Mexico ────────────────────────────────────────────────────────────────
  mexico: {
    label: 'Autodromo Hermanos Rodriguez',
    centerLat: 19.4042,
    centerLng: -99.0907,
    rotationDeg: 0,
    scaleX: 0.0000100,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },
  'mexico city': {
    label: 'Autodromo Hermanos Rodriguez',
    centerLat: 19.4042,
    centerLng: -99.0907,
    rotationDeg: 0,
    scaleX: 0.0000100,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },
  'hermanos rodriguez': {
    label: 'Autodromo Hermanos Rodriguez',
    centerLat: 19.4042,
    centerLng: -99.0907,
    rotationDeg: 0,
    scaleX: 0.0000100,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },

  // ── Brazil / Interlagos ───────────────────────────────────────────────────
  interlagos: {
    label: 'Autodromo Jose Carlos Pace',
    centerLat: -23.7036,
    centerLng: -46.6997,
    rotationDeg: 20,
    scaleX: 0.0000115,
    scaleY: 0.0000095,
    flipY: true,
    zoom: 14,
  },
  brazil: {
    label: 'Autodromo Jose Carlos Pace',
    centerLat: -23.7036,
    centerLng: -46.6997,
    rotationDeg: 20,
    scaleX: 0.0000115,
    scaleY: 0.0000095,
    flipY: true,
    zoom: 14,
  },
  'sao paulo': {
    label: 'Autodromo Jose Carlos Pace',
    centerLat: -23.7036,
    centerLng: -46.6997,
    rotationDeg: 20,
    scaleX: 0.0000115,
    scaleY: 0.0000095,
    flipY: true,
    zoom: 14,
  },

  // ── Las Vegas ─────────────────────────────────────────────────────────────
  'las vegas': {
    label: 'Las Vegas Street Circuit',
    centerLat: 36.1147,
    centerLng: -115.1728,
    rotationDeg: -5,
    scaleX: 0.0000090,
    scaleY: 0.0000085,
    flipY: false,
    zoom: 14,
  },

  // ── Qatar / Lusail ────────────────────────────────────────────────────────
  lusail: {
    label: 'Lusail International Circuit',
    centerLat: 25.4900,
    centerLng: 51.4542,
    rotationDeg: 0,
    scaleX: 0.0000110,
    scaleY: 0.0000100,
    flipY: false,
    zoom: 14,
  },
  qatar: {
    label: 'Lusail International Circuit',
    centerLat: 25.4900,
    centerLng: 51.4542,
    rotationDeg: 0,
    scaleX: 0.0000110,
    scaleY: 0.0000100,
    flipY: false,
    zoom: 14,
  },

  // ── Abu Dhabi / Yas Marina ────────────────────────────────────────────────
  'yas marina': {
    label: 'Yas Marina Circuit',
    centerLat: 24.4672,
    centerLng: 54.6031,
    rotationDeg: -15,
    scaleX: 0.0000100,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },
  'abu dhabi': {
    label: 'Yas Marina Circuit',
    centerLat: 24.4672,
    centerLng: 54.6031,
    rotationDeg: -15,
    scaleX: 0.0000100,
    scaleY: 0.0000090,
    flipY: false,
    zoom: 14,
  },
};

/** Fallback when no circuit can be matched */
export const DEFAULT_CIRCUIT: CircuitConfig = {
  label: 'Unknown Circuit',
  centerLat: 31.3387,
  centerLng: 121.2201,
  rotationDeg: 0,
  scaleX: 0.0000090,
  scaleY: 0.0000090,
  flipY: false,
  zoom: 14,
};

/**
 * Resolve a circuit configuration from a (potentially partial / mixed-case)
 * circuit name string.
 *
 * Matching strategy (in order):
 *  1. Exact lowercase key match
 *  2. Any key whose value is a substring of the query (e.g. "suzuka" in "Suzuka Circuit")
 *  3. The query is a substring of any key
 *  4. DEFAULT_CIRCUIT
 *
 * @example
 *   resolveCircuit("Yas Marina Circuit")  → CIRCUITS['yas marina']
 *   resolveCircuit("Gilles Villeneuve")   → CIRCUITS['gilles villeneuve']
 *   resolveCircuit("SPA")                → CIRCUITS['spa']
 */
export function resolveCircuit(name: string | undefined | null): CircuitConfig {
  if (!name) return DEFAULT_CIRCUIT;

  const lower = name.toLowerCase().trim();

  // 1. Exact match
  if (lower in CIRCUITS) return CIRCUITS[lower];

  // 2. Key is contained in the query (e.g. query = "Suzuka Circuit", key = "suzuka")
  for (const [key, config] of Object.entries(CIRCUITS)) {
    if (lower.includes(key)) return config;
  }

  // 3. Query is contained in the key (e.g. query = "yas", key = "yas marina")
  for (const [key, config] of Object.entries(CIRCUITS)) {
    if (key.includes(lower)) return config;
  }

  return DEFAULT_CIRCUIT;
}
