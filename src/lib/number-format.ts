const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const decimals = new Map<string, Intl.NumberFormat>();
export const formatUsd = (value: number): string => usd.format(value);
export function formatDecimal(
  value: number,
  maximumFractionDigits = 3,
  minimumFractionDigits = 0,
): string {
  const key = maximumFractionDigits + ":" + minimumFractionDigits;
  let formatter = decimals.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      maximumFractionDigits,
      minimumFractionDigits,
    });
    if (decimals.size < 16) decimals.set(key, formatter);
  }
  return formatter.format(value);
}

export function formatChartPrice(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude > 0 && magnitude < 1e-8) return value.toExponential(3);
  if (magnitude < 1) return formatDecimal(value, 8);
  if (magnitude >= 1000) return formatDecimal(value, 2);
  return formatDecimal(value, 4);
}
