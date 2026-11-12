import { MIN_CHART_PRICE, panPriceRange, scalePriceRange, validPriceRange, type PriceRange, type PriceScaleMode } from '@/lib/chart-price-scale';

export function validPriceToBarRatio(value: unknown): value is number {
 return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function transformedSpan(range: PriceRange, mode: PriceScaleMode): number {
 return mode === 'log' ? Math.log(Math.max(MIN_CHART_PRICE, range.max)) - Math.log(Math.max(MIN_CHART_PRICE, range.min)) : range.max - range.min;
}
// Price units per bar, adjusted for the actual plot aspect ratio. In log mode
// these are logarithmic units, not a linear difference between endpoint prices.
export function priceToBarRatio(range: PriceRange, mode: PriceScaleMode, count: number, width: number, height: number): number | null {
 if (!validPriceRange(range, mode) || ![count, width, height].every(validPriceToBarRatio)) return null;
 const ratio = transformedSpan(range, mode) * width / (height * count);
 return validPriceToBarRatio(ratio) ? ratio : null;
}
export function fitPriceToBarRatio(range: PriceRange, mode: PriceScaleMode, ratio: number, count: number, width: number, height: number, anchor = 0.5): PriceRange {
 if (!validPriceRange(range, mode) || ![ratio, count, width, height].every(validPriceToBarRatio)) return range;
 const previous = transformedSpan(range, mode), wanted = ratio * count * height / width;
 if (!validPriceToBarRatio(previous) || !validPriceToBarRatio(wanted)) return range;
 const scaled = scalePriceRange(range, wanted / previous, mode);
 const actual = transformedSpan(scaled, mode), fraction = Math.max(0, Math.min(1, anchor));
 // Keep the price beneath the zoom/pinch anchor stationary as both scales zoom.
 const next = panPriceRange(scaled, (fraction - 0.5) * (actual - previous) / actual, mode);
 return validPriceRange(next, mode) ? next : range;
}
