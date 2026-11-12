import type { ReactNode, PointerEvent, MouseEvent, KeyboardEvent } from 'react';
import type { ChartPoint } from '@/lib/chart-types';
export type { ChartView } from '@/lib/chart-types';
import type { PriceScaleMode } from '@/lib/chart-price-scale';
export type ChartProjection = {
  /** Exact rendered body width, including next to gaps in candle history. */
  candleBodyWidth?: number;
  priceScale?: PriceScaleMode;
  timeZone?: string;
  axisBottom?: number;
  /** Artwork-only overscan for translated pans; does not widen detector input. */
  renderBounds?: { left: number; right: number; top: number; bottom: number };
  x: (time: number) => number;
  y: (price: number) => number;
  width: number;
  top: number;
  bottom: number;
  point: (x: number, y: number, snap?: boolean) => ChartPoint;
};
export type ChartDrawingLayer = {
  cursor: 'default' | 'crosshair';
  render: (projection: ChartProjection) => ReactNode;
  renderBackground?: (projection: ChartProjection) => ReactNode;
  renderAxes?: (projection: ChartProjection) => ReactNode;
  down: (
    point: ChartPoint,
    event: PointerEvent<globalThis.SVGSVGElement>,
    projection: ChartProjection,
  ) => boolean;
  move: (
    point: ChartPoint,
    event: PointerEvent<globalThis.SVGSVGElement>,
  ) => void;
  up: (
    point: ChartPoint,
    event: PointerEvent<globalThis.SVGSVGElement>,
  ) => void;
  cancel: () => void;
  doubleClick?: (event: MouseEvent<globalThis.SVGSVGElement>) => boolean;
  key?: (event: KeyboardEvent<globalThis.SVGSVGElement>) => void;
};
