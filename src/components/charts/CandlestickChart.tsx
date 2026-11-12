import { useCallback, useId, useMemo } from 'react';
import type { CandlestickChartProps } from '@/components/charts/chart-contracts';
import { useChartInteractionState } from '@/components/charts/useChartInteractionState';
import { useChartSize } from '@/components/charts/useChartSize';
import { useChartViewport } from '@/components/charts/useChartViewport';
import { useChartPriceScale } from '@/components/charts/useChartPriceScale';
import { useChartActionObserver } from '@/components/charts/useChartActionObserver';
import { useChartViewPersistence } from '@/components/charts/useChartViewPersistence';
import { useChartHistory } from '@/components/charts/useChartHistory';
import { useChartSynchronization } from '@/components/charts/useChartSynchronization';
import { useChartActions } from '@/components/charts/useChartActions';
import { useChartGestures } from '@/components/charts/useChartGestures';
import { useChartTimeAxis } from '@/components/charts/useChartTimeAxis';
import CandleLayer from '@/components/charts/CandleLayer';
import {
  ChartPriceAxis,
  ChartPriceAxisHitArea,
  ChartTimeAxis,
} from '@/components/charts/ChartAxes';
import {
  ChartCrosshairLabels,
  ChartCrosshairLines,
} from '@/components/charts/ChartCrosshair';
import { priceTicks } from '@/lib/chart-geometry';
import { chartTimeWindow } from '@/lib/chart-sync';
import {
  logarithmicPriceTicks,
  MIN_CHART_PRICE,
  overscanPriceTicks,
  priceProjection,
} from '@/lib/chart-price-scale';
import { chartTimeFormatters } from '@/lib/chart-timezones';
import {
  candleIndexToTime,
  timeToCandleIndex,
} from '@/lib/chart-time-coordinates';
import type { ChartProjection } from '@/lib/chart-drawing';

// The renderer owns only geometry and interactions. Its adapters supply market
// chrome/evidence and decide which candles are eligible; it never fetches data.
export default function CandlestickChart({
  mode,
  frame = 'card',
  timeZoneOverride,
  renderHeader,
  renderPriceMarker,
  renderTradeLevels,
  renderFooter,
  renderControls,
  layers,
  historyRetryAt,
  controlsRef,
  chartSync,
  interval = '4h',
  candles,
  showCandles = true,
  focusTime,
  replayCursor,
  onLoadEarlier,
  hasEarlier = false,
  loadingHistory = false,
  compact = false,
  drawingLayer,
  savedView,
  onViewChange,
  onViewAction,
  pending = false,
}: CandlestickChartProps) {
  const marketView = mode === 'market';
  const interaction = useChartInteractionState();
  const { host, size, header, headerHeight } = useChartSize(compact, Boolean(renderHeader));
  const viewport = useChartViewport({
    candles,
    interval,
    marketView,
    savedView,
    focusTime,
    replayCursor,
    hasDrawingLayer: Boolean(drawingLayer),
    drag: interaction.drag,
    panning: interaction.panning,
  });
  const {
    range,
    rangeRef,
    setRange,
    following,
    visible,
    panStart,
    panVisible,
    panPreviewActive,
    panLayerRef,
    timePanLayerRef,
    pricePanLayerRef,
  } = viewport;
  const plotWidth = Math.max(100, size.width - 78);
  const top = 0,
    bottom = size.height - 35,
    priceBottom = bottom;
  const price = useChartPriceScale({
    visible,
    savedView,
    marketTimeZone: timeZoneOverride,
    hasDrawingLayer: Boolean(drawingLayer),
    count: range.count,
    width: plotWidth,
    height: priceBottom - top,
    autoTopSpace: headerHeight ? headerHeight + 6 : 0,
  });
  const {
    settings,
    logarithmicAvailable,
    timeZone,
    priceScale,
    activeManualPrice,
    priceRatio,
  } = price;
  const { min, max } = priceRatio.bounds;
  const persistedView = useChartViewPersistence({
    range,
    candleCount: candles.length,
    bounds: priceRatio.bounds,
    manual: Boolean(activeManualPrice),
    ratio: priceRatio.ratio,
    timeZone,
    priceScale,
    marketView,
    onViewChange,
  });
  const actionObserver = useChartActionObserver(persistedView, onViewAction);
  const history = useChartHistory({
    marketView,
    replayCursor,
    candles,
    interval,
    range,
    rangeRef,
    hasEarlier,
    loadingHistory,
    historyRetryAt,
    onLoadEarlier,
  });
  const timeFormatters = useMemo(
    () => chartTimeFormatters(timeZone, interval === '1s'),
    [timeZone, interval],
  );
  const fullTime = useCallback(
    (time: number) => timeFormatters.full.format(time),
    [timeFormatters],
  );
  const crosshairTime = useCallback(
    (time: number) => timeFormatters.crosshair.format(time),
    [timeFormatters],
  );
  const clipId = 'chart-' + useId().replace(/:/g, '');
  const x = useCallback(
    (index: number) =>
      ((index - range.right + range.count) / range.count) * plotWidth,
    [range.right, range.count, plotWidth],
  );
  const priceMapping = useMemo(
    () => priceProjection({ min, max }, priceScale, top, priceBottom),
    [min, max, priceScale, top, priceBottom],
  );
  const y = priceMapping.y;
  const bodyWidth = Math.max(1, (plotWidth / range.count) * 0.68);
  const projection = useMemo<ChartProjection>(
    () => ({
      candleBodyWidth: bodyWidth,
      priceScale,
      timeZone,
      axisBottom: bottom,
      renderBounds: panPreviewActive
        ? {
            left: -plotWidth,
            right: plotWidth * 2,
            top: top - (priceBottom - top),
            bottom: priceBottom + (priceBottom - top),
          }
        : undefined,
      x: (time: number) => x(timeToCandleIndex(candles, interval, time)),
      y,
      width: plotWidth,
      top,
      bottom: priceBottom,
      point: (px: number, py: number, snap = false) => {
        const index =
          range.right - range.count + (px / plotWidth) * range.count;
        return {
          time: candleIndexToTime(
            candles,
            interval,
            snap ? Math.round(index) : index,
          ),
          price: Math.max(MIN_CHART_PRICE, priceMapping.price(py)),
        };
      },
    }),
    [
      priceScale,
      timeZone,
      bottom,
      x,
      y,
      plotWidth,
      top,
      priceBottom,
      range.right,
      range.count,
      candles,
      interval,
      priceMapping,
      bodyWidth,
      panPreviewActive,
    ],
  );
  const geometry = useMemo(
    () => ({ candles, x, y, plotWidth, timeZone, fullTime }),
    [candles, x, y, plotWidth, timeZone, fullTime],
  );
  // Crosshair motion changes quote/labels, not artwork. Keep expensive SVG trees
  // intact until their data, drawing state, trade state, or projection changes.
  const evidenceArtwork = useMemo(
    () => ({
      zones: layers?.zones?.(geometry),
      levels: layers?.levels?.(geometry),
      overlays: layers?.overlays?.(geometry),
    }),
    [layers, geometry],
  );
  const drawingArtwork = useMemo(
    () => ({
      background: drawingLayer?.renderBackground?.(projection),
      objects: drawingLayer?.render(projection),
      axes: drawingLayer?.renderAxes?.(projection),
    }),
    [drawingLayer, projection],
  );
  const priceMarker = useMemo(
    () => renderPriceMarker?.(projection),
    [renderPriceMarker, projection],
  );
  const tradeLevels = useMemo(
    () => renderTradeLevels?.(projection),
    [renderTradeLevels, projection],
  );
  const synchronize = useChartSynchronization(
    marketView ? chartSync : undefined,
    {
      candles,
      interval,
      range,
      setRange,
      following,
      hasEarlier,
      loadingHistory,
      onLoadEarlier,
    },
  );
  const shared = synchronize.externalPoint;
  const sharedX = shared ? projection.x(shared.time) : -1;
  const pointer = interaction.panning
    ? null
    : (interaction.localPointer ??
      (shared && sharedX >= 0 && sharedX <= plotWidth
        ? { x: sharedX, y: y(shared.price) }
        : null));
  const { setPointer } = interaction;
  const visibleWindow = chartTimeWindow(candles, interval, range);

  // Crosshair time follows the selected bar grid, including blank future space.
  // Drawing projection.point remains continuous unless its caller requests snapping.
  const nearestPointerIndex = pointer
    ? Math.round(
        range.right - range.count + (pointer.x / plotWidth) * range.count,
      )
    : -1;
  const nearestPointerX = x(nearestPointerIndex);
  const crosshairX =
    pointer &&
    candles.length &&
    nearestPointerX >= 0 &&
    nearestPointerX <= plotWidth
      ? nearestPointerX
      : (pointer?.x ?? 0);
  const pointerTime =
    pointer && candles.length
      ? candleIndexToTime(candles, interval, nearestPointerIndex)
      : undefined;
  const pointerIndex = pointer
    ? Math.max(0, Math.min(candles.length - 1, nearestPointerIndex))
    : candles.length - 1;
  const current = candles[pointerIndex];
  const latest = candles.at(-1);
  const ticks = useMemo(() => {
    const base =
      priceScale === 'log'
        ? logarithmicPriceTicks(min, max)
        : priceTicks(min, max);
    return panPreviewActive ? overscanPriceTicks(base, priceScale) : base;
  }, [priceScale, min, max, panPreviewActive]);
  const { automatic, changeDisplay, restoreAutomatic, toggleAutomatic, toggleRatio, reset, zoom } =
    useChartActions({
      candles,
      marketView,
      drawingLayer,
      controlsRef,
      persistedView,
      actionObserver,
      onViewChange,
      plotWidth,
      top,
      priceBottom,
      price,
      viewport,
      interaction,
      synchronize,
    });
  const { down, move, up, cancel, doubleClick, keyboard } = useChartGestures({
    host,
    size,
    candles,
    marketView,
    drawingLayer,
    projection,
    plotWidth,
    top,
    bottom,
    priceBottom,
    viewport,
    price,
    history,
    interaction,
    synchronize,
    restoreAutomatic,
    reset,
    zoom,
  });
  const { ticks: timeTicks, measurementRef: timeAxisMeasurement } =
    useChartTimeAxis(
      candles,
      interval,
      range,
      plotWidth,
      timeZone,
      panPreviewActive,
    );
  return (
    <div
      data-chart-frame={frame}
      className="research-chart"
    >
      <div
        ref={host}
        data-chart-plot
        aria-busy={pending}
        onWheelCapture={() => actionObserver.begin('wheel')}
        onWheel={actionObserver.settle}
      >
        <svg
          data-chart-canvas
          style={{ cursor: drawingLayer?.cursor ?? 'default' }}
          viewBox={'0 0 ' + size.width + ' ' + size.height}
          preserveAspectRatio="none"
          role="group"
          data-price-scale={priceScale}
          data-price-bar-locked={priceRatio.locked}
          data-price-bar-ratio={priceRatio.ratio ?? undefined}
          data-chart-price-min={min}
          data-chart-price-max={max}
          data-chart-time-zone={timeZone}
          data-chart-sync-id={chartSync?.id}
          data-chart-sync-group={chartSync?.group}
          data-chart-visible-from={visibleWindow?.from}
          data-chart-visible-to={visibleWindow?.to}
          data-chart-range-count={range.count}
          aria-label={
            (marketView
              ? 'Interactive market candlestick chart, '
              : drawingLayer
                ? 'Interactive candlestick chart with manual strategy annotations, '
                : 'Interactive candlestick chart with ICT detection overlays, ') +
            timeZone +
            ' time, ' +
            (priceScale === 'log' ? 'logarithmic' : 'linear') +
            ' price scale'
          }
          aria-describedby={clipId + '-help'}
          tabIndex={0}
          onPointerDown={(event) => {
            actionObserver.pointerDown(event.pointerId);
            down(event);
          }}
          onPointerMove={move}
          onPointerUp={(event) => {
            actionObserver.pointerUp(event.pointerId);
            up(event);
          }}
          onPointerCancel={(event) => {
            actionObserver.pointerCancel(event.pointerId);
            cancel(event);
          }}
          onLostPointerCapture={(event) => {
            actionObserver.pointerCancel(event.pointerId);
            cancel(event);
          }}
          onPointerLeave={() => {
            setPointer(null);
            synchronize.leave();
          }}
          onDoubleClick={(event) => actionObserver.run(doubleClick, event)}
          onKeyDown={(event) => {
            actionObserver.begin('keyboard');
            keyboard(event);
            actionObserver.settle();
          }}
        >
          <title>
            {marketView
              ? 'Observed market candles'
              : drawingLayer
                ? 'Historical candles and manual strategy annotations'
                : 'Historical candles and confirmed ICT patterns'}
          </title>
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y={top} width={plotWidth} height={bottom - top} />
            </clipPath>
            <clipPath id={clipId + '-time'}>
              <rect
                x="0"
                y={bottom}
                width={plotWidth}
                height={size.height - bottom}
              />
            </clipPath>
            <clipPath id={clipId + '-price'}>
              <rect
                x={plotWidth}
                y="0"
                width={size.width - plotWidth}
                height={bottom}
              />
            </clipPath>
          </defs>
          <g clipPath={'url(#' + clipId + ')'}>
            {/* Both-axis pan transforms are painted once per animation frame;
                React commits the final time/price geometry on pointer-up. */}
            <g ref={panLayerRef} data-pan-layer>
              {evidenceArtwork.zones}
              {drawingArtwork.background}
              {evidenceArtwork.levels}
              {/* Manual artwork stays behind candles; candle hit tests pass through. */}
              {drawingArtwork.objects}
              {showCandles && (
                <CandleLayer
                  visible={panVisible}
                  start={panStart}
                  x={x}
                  y={y}
                  bodyWidth={bodyWidth}
                />
              )}
              {evidenceArtwork.overlays}
            </g>
            <g ref={pricePanLayerRef} data-pan-last-price>
              {latest && (
                <line
                  data-chart-last-price
                  x1="0"
                  x2={plotWidth}
                  pointerEvents="none"
                  y1={y(latest.close)}
                  y2={y(latest.close)}
                  stroke="hsl(var(--chart-crosshair))"
                  strokeDasharray="2 4"
                  strokeWidth="0.6"
                />
              )}
            </g>
            <ChartCrosshairLines
              pointer={pointer}
              crosshairX={crosshairX}
              plotWidth={plotWidth}
              top={top}
              bottom={bottom}
            />
          </g>
          <ChartPriceAxis
            plotWidth={plotWidth}
            bottom={bottom}
            size={size}
            ticks={ticks}
            y={y}
            panLayerRef={pricePanLayerRef}
            clipId={clipId + '-price'}
          />
          <g ref={pricePanLayerRef} data-pan-price-overlays>
            {priceMarker}
          </g>
          <ChartTimeAxis
            plotWidth={plotWidth}
            bottom={bottom}
            size={size}
            timeTicks={timeTicks}
            timeAxisMeasurement={timeAxisMeasurement}
            fullTime={fullTime}
            panLayerRef={timePanLayerRef}
            clipId={clipId + '-time'}
          />
          <g ref={pricePanLayerRef} data-pan-drawing-axes>
            {drawingArtwork.axes}
          </g>
          <ChartCrosshairLabels
            pointer={pointer}
            crosshairX={crosshairX}
            plotWidth={plotWidth}
            top={top}
            bottom={bottom}
            pointerTime={pointerTime}
            priceAtY={priceMapping.price}
            formatTime={crosshairTime}
          />
          <ChartPriceAxisHitArea
            plotWidth={plotWidth}
            bottom={bottom}
            size={size}
          />
          <g ref={pricePanLayerRef} data-pan-trade-levels>
            {tradeLevels}
          </g>
          {!candles.length && !pending && (
            <text
              x={size.width / 2}
              y={size.height / 2}
              textAnchor="middle"
              fill="hsl(var(--muted-foreground))"
              fontSize="13"
            >
              No candles available
            </text>
          )}
        </svg>
        {renderHeader?.(current, header)}
        {renderControls?.({
          settings,
          timeZone,
          logarithmicAvailable,
          automatic,
          ratioLocked: priceRatio.locked,
          changeDisplay,
          toggleAutomatic,
          toggleRatio,
          reset,
          zoom,
          pan: (direction) =>
            actionObserver.run(() => {
              synchronize.interact();
              following.current = false;
              if (direction < 0) {
                history.intent.current = true;
                history.boundary.current = null;
              }
              setRange((currentRange) =>
                viewport.clampRange(
                  {
                    ...currentRange,
                    right:
                      currentRange.right + (direction * currentRange.count) / 5,
                  },
                  candles.length,
                  Boolean(drawingLayer),
                ),
              );
            }),
        })}
      </div>
      <p id={clipId + '-help'} className="chart-sr-only">
        Drag the chart to pan across time. With Auto off, drag vertically to pan prices.
        Drag the right price scale vertically
        to adjust candle height. Drag the bottom time scale horizontally to
        adjust candle width and spacing. Double-click either scale to reset it
        independently. Scroll or pinch to zoom. Arrow keys pan; plus and minus
        zoom. Home returns to the latest candle. {marketView && 'Type a symbol to search, or type a timeframe in minutes.'} Times are displayed in {timeZone}.
      </p>
      {renderFooter?.({
        current,
        timeZone,
        priceScale,
        requestedPriceScale: settings.priceScale,
        fullTime,
        changeDisplay,
      })}
    </div>
  );
}
