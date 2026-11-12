import type { Candle } from '@/lib/trading-types';
export type ChartRange = { right: number; count: number };
export function defaultChartCount(length: number, marketView: boolean): number {
  return Math.min(110, Math.max(marketView ? 16 : 35, length + 12));
}
export function clampRange(range: ChartRange, length: number, blankSpace=false): ChartRange {
  const count=Math.max(15,Math.min(2500,range.count));
  return {count,right:Math.max(Math.min(length+8,Math.max(8,count/5)),Math.min(length+(blankSpace?1000000:12),range.right))};
}
export function zoomRange(range: ChartRange, factor: number, anchor: number, length: number, blankSpace=false): ChartRange {
  const count=Math.max(15,Math.min(2500,range.count*factor));
  const point=range.right-range.count+Math.max(0,Math.min(1,anchor))*range.count;
  return clampRange({count,right:point+(1-anchor)*count},length,blankSpace);
}
export function candleIndex(candles: Candle[], time: number): number {
  let low=0,high=candles.length;
  while(low<high){const mid=(low+high)>>>1;if(candles[mid].time<time)low=mid+1;else high=mid;}return low;
}
export function priceTicks(low: number, high: number): number[] {
  const raw=Math.max((high-low)/6,Number.EPSILON),power=10**Math.floor(Math.log10(raw)),fraction=raw/power;
  const step=(fraction<=1?1:fraction<=2?2:fraction<=5?5:10)*power;
  const ticks:number[]=[];for(let p=Math.ceil(low/step)*step;p<=high && ticks.length<12;p+=step)ticks.push(p);return ticks;
}
