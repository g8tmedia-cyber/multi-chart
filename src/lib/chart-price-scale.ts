import { priceTicks } from '@/lib/chart-geometry';

export type PriceScaleMode = 'linear' | 'log';
export type PriceRange = { min: number; max: number };
export const MIN_CHART_PRICE = 1e-16;
const LOG_MIN = Math.log(MIN_CHART_PRICE);
const LOG_MAX = Math.log(1e16);

export function validPriceRange(range: PriceRange, mode: PriceScaleMode): boolean {
  return Number.isFinite(range.min) && Number.isFinite(range.max) && range.max > range.min && (mode !== 'log' || range.min > 0);
}

function coordinate(price: number, mode: PriceScaleMode): number {
  return mode === 'log' ? Math.log(Math.max(MIN_CHART_PRICE, price)) : price;
}

function logRange(min: number, max: number): PriceRange {
  // Bound transformed coordinates, rather than individual endpoints, so extreme
  // zooms and pans remain finite without flattening or reversing the price axis.
  const span = Math.max(0.000001, Math.min(LOG_MAX - LOG_MIN, max - min));
  const lower = Math.max(LOG_MIN, Math.min(LOG_MAX - span, min));
  return { min: Math.exp(lower), max: Math.exp(lower + span) };
}

export function automaticPriceRange(low: number, high: number, mode: PriceScaleMode, topFraction = 0): PriceRange {
  const fraction = Math.max(0, Math.min(0.85, topFraction));
  // Reserve space by expanding the auto-fit range. The plot remains drawable up to y=0.
  const upperPadding = (span: number, padding: number) => Math.max(padding, (span + padding) * fraction / (1 - fraction));
  if (mode === 'log') {
    const min = coordinate(Math.max(MIN_CHART_PRICE, low), mode);
    const max = coordinate(Math.max(MIN_CHART_PRICE, high), mode);
    const padding = Math.max((max - min) * 0.12, 0.0001);
    return logRange(min - padding, max + upperPadding(max - min, padding));
  }
  const padding = Math.max((high - low) * 0.12, Math.abs(high) * 0.00005, MIN_CHART_PRICE);
  return { min: low - padding, max: high + upperPadding(high - low, padding) };
}

export function scalePriceRange(range: PriceRange, factor: number, mode: PriceScaleMode): PriceRange {
  const min = coordinate(range.min, mode), max = coordinate(range.max, mode);
  const center = (min + max) / 2, span = (max - min) * factor;
  return mode === 'log' ? logRange(center - span / 2, center + span / 2) : { min: center - span / 2, max: center + span / 2 };
}

export function panPriceRange(range: PriceRange, fraction: number, mode: PriceScaleMode): PriceRange {
  const min = coordinate(range.min, mode), max = coordinate(range.max, mode);
  const shift = (max - min) * fraction;
  return mode === 'log' ? logRange(min + shift, max + shift) : { min: min + shift, max: max + shift };
}

// Extend tick coverage without changing the normal visible spacing. Pan previews
// can then translate price labels without reconstructing them on each frame.
export function overscanPriceTicks(ticks: number[], mode: PriceScaleMode): number[] {
  if (ticks.length < 2) return ticks;
  const first = mode === "log" ? Math.log10(ticks[0]) : ticks[0];
  const step = (mode === "log" ? Math.log10(ticks[1]) : ticks[1]) - first;
  return Array.from({ length: ticks.length * 3 }, (_, index) => {
    const value = first + (index - ticks.length) * step;
    return mode === "log" ? 10 ** value : value;
  }).filter(value => Number.isFinite(value) && (mode !== "log" || value > 0));
}

export function logarithmicPriceTicks(min: number, max: number): number[] {
  return priceTicks(Math.log10(min), Math.log10(max)).map(value => 10 ** value);
}

export function priceProjection(range: PriceRange, mode: PriceScaleMode, top: number, bottom: number) {
  const min = coordinate(range.min, mode), max = coordinate(range.max, mode), span = max - min;
  return {
    y: (price: number) => top + (max - coordinate(price, mode)) / span * (bottom - top),
    price: (y: number) => {
      const value = max - (y - top) / (bottom - top) * span;
      return mode === 'log' ? Math.exp(Math.max(LOG_MIN, Math.min(LOG_MAX, value))) : value;
    },
  };
}
