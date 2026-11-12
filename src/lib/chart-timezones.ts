export const COMMON_CHART_TIME_ZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai',
  'Asia/Hong_Kong', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
];

const validatedZones = new Map<string, boolean>();

export function isChartTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 80) return false;
  const cached = validatedZones.get(value);
  if (cached !== undefined) return cached;
  let valid = true;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0); }
  catch { valid = false; }
  if (validatedZones.size >= 64)
    validatedZones.delete(validatedZones.keys().next().value!);
  validatedZones.set(value, valid);
  return valid;
}

export function supportedChartTimeZones(): string[] {
  const api = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  try { return [...new Set([...COMMON_CHART_TIME_ZONES, ...(api.supportedValuesOf?.('timeZone') ?? [])])]; }
  catch { return [...COMMON_CHART_TIME_ZONES]; }
}

export function chartTimeFormatters(timeZone: string, withSeconds = false) {
  const zone = isChartTimeZone(timeZone) ? timeZone : 'UTC';
  const seconds = withSeconds ? { second: '2-digit' as const } : {};
  return {
    short: new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...seconds }),
    crosshair: new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...seconds }),
    full: new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' }),
  };
}
