export const MARKET_LAYOUTS = {
  single: { count: 1, columns: 1 },
  two_columns: { count: 2, columns: 2 },
  two_rows: { count: 2, columns: 1 },
  four: { count: 4, columns: 2 },
  six: { count: 6, columns: 3 },
  eight: { count: 8, columns: 4 },
} as const;
export type MarketLayout = keyof typeof MARKET_LAYOUTS;
export type MarketGridSizes = { columns: number[]; rows: number[] };

export function isMarketLayout(value: unknown): value is MarketLayout {
  return typeof value === 'string' && Object.hasOwn(MARKET_LAYOUTS, value);
}

export function equalMarketGridSizes(
  count: number,
  columns: number,
): MarketGridSizes {
  const rows = Math.ceil(count / columns);
  return {
    columns: Array.from({ length: columns }, () => 100 / columns),
    rows: Array.from({ length: rows }, () => 100 / rows),
  };
}
export function restoreMarketGridSizes(
  value: unknown,
  count: number,
  columns: number,
): MarketGridSizes | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const normalize = (input: unknown, length: number): number[] | null => {
    if (
      !Array.isArray(input) ||
      input.length !== length ||
      input.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n <= 0)
    )
      return null;
    const total = (input as number[]).reduce((sum, n) => sum + n, 0);
    if (!Number.isFinite(total) || total <= 0) return null;
    const normalized =
      Math.abs(total - 100) < 0.000001
        ? [...(input as number[])]
        : (input as number[]).map((n) => (n * 100) / total);
    return normalized.some((n) => n < 5) ? null : normalized;
  };
  const x = normalize(raw.columns, columns),
    y = normalize(raw.rows, Math.ceil(count / columns));
  return x && y ? { columns: x, rows: y } : null;
}
