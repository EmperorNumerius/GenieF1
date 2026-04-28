/**
 * Driver identity helpers: country flags and team logo paths.
 */

// Maps F1 3-letter country codes to 2-letter ISO 3166-1 alpha-2 codes.
const F1_TO_ISO2: Record<string, string> = {
  // Common F1 driver nationalities
  GBR: 'GB',
  NED: 'NL',
  MON: 'MC',
  GER: 'DE',
  ESP: 'ES',
  FIN: 'FI',
  FRA: 'FR',
  ITA: 'IT',
  AUS: 'AU',
  BRA: 'BR',
  MEX: 'MX',
  CAN: 'CA',
  JPN: 'JP',
  CHN: 'CN',
  USA: 'US',
  ARG: 'AR',
  AUT: 'AT',
  BEL: 'BE',
  DEN: 'DK',
  POL: 'PL',
  RUS: 'RU',
  SWE: 'SE',
  SUI: 'CH',
  NZL: 'NZ',
  IND: 'IN',
  THA: 'TH',
  MAL: 'MY',
  POR: 'PT',
  COL: 'CO',
  VEN: 'VE',
  IDN: 'ID',
  ZAF: 'ZA',
  CZE: 'CZ',
  HUN: 'HU',
};

/**
 * Convert a 3-letter F1 country code (e.g. "GBR") to a Unicode flag emoji (e.g. "🇬🇧").
 * Returns an empty string if the code is unrecognised.
 */
export function countryCodeToFlag(code: string | null | undefined): string {
  if (!code) return '';
  const iso2 = F1_TO_ISO2[code.toUpperCase()];
  if (!iso2) return '';
  // Regional indicator symbols: A=0x1F1E6, so offset each letter by (charCode - 65)
  return Array.from(iso2.toUpperCase())
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

// Maps normalised team name fragments to slug used for /teams/{slug}.svg
const TEAM_SLUG_MAP: Array<[string, string]> = [
  ['Red Bull', 'red-bull'],
  ['Ferrari', 'ferrari'],
  ['Mercedes', 'mercedes'],
  ['McLaren', 'mclaren'],
  ['Aston Martin', 'aston-martin'],
  ['Alpine', 'alpine'],
  ['Williams', 'williams'],
  ['Racing Bulls', 'racing-bulls'],
  ['RB', 'racing-bulls'],
  ['Audi', 'audi'],
  ['Sauber', 'audi'],          // Kick Sauber → Audi for 2026
  ['Haas', 'haas'],
  ['Cadillac', 'cadillac'],
];

/**
 * Returns the public path to a team's SVG logo, e.g. "/teams/ferrari.svg".
 * Falls back to "/teams/default.svg" if the team name is unknown.
 */
export function getTeamLogo(team: string | null | undefined): string {
  if (!team) return '/teams/default.svg';
  for (const [fragment, slug] of TEAM_SLUG_MAP) {
    if (team.toLowerCase().includes(fragment.toLowerCase())) {
      return `/teams/${slug}.svg`;
    }
  }
  return '/teams/default.svg';
}
