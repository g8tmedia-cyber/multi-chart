import { LoaderCircle, Maximize, Minimize, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import CandlestickChart from '@/components/charts/CandlestickChart';
import type { CandlestickChartProps } from '@/components/charts/chart-contracts';
import ChartNavigation from '@/components/charts/ChartNavigation';
import ChartPriceMarker from '@/components/charts/ChartPriceMarker';
import ChartQuote from '@/components/charts/ChartQuote';
import { useCandles } from '@/data/useCandles';
import type { Drawing, DrawingTool } from '@/drawings/types';
import { useChartDrawings } from '@/drawings/useChartDrawings';
import { defaultChartCount } from '@/lib/chart-geometry';
import type { PriceScaleMode } from '@/lib/chart-price-scale';
import { timeToCandleIndex } from '@/lib/chart-time-coordinates';
import type { ChartView, ChartViewControls } from '@/lib/chart-types';
import type { Candle } from '@/lib/trading-types';
import { chartViewKey, type Pane, type SavedPosition } from './workspace';

const noDrawings: Drawing[] = [];
type Feed = ReturnType<typeof useCandles>;

type Props = {
  pane: Pane;
  active: boolean;
  maximized: boolean;
  canMaximize: boolean;
  tool: DrawingTool;
  timeZone: string;
  onToolChange: (tool: DrawingTool) => void;
  onActivate: () => void;
  onMaximize: () => void;
  onPickSymbol: () => void;
  onPriceScaleChange: (mode: PriceScaleMode) => void;
  onSaveDrawings: (drawings: Drawing[]) => void;
  onSavePosition: (position: SavedPosition) => void;
};

export default function ChartPane({ pane, active, maximized, canMaximize, tool, timeZone,
  onToolChange, onActivate, onMaximize, onPickSymbol, onPriceScaleChange, onSaveDrawings, onSavePosition }: Props) {
  const { symbol, interval } = pane;
  const asset = symbol.slice(symbol.indexOf(':') + 1);
  const viewKey = chartViewKey(symbol, interval);
  const position = pane.views[viewKey];
  const feed = useCandles(symbol, interval, position);
  const drawing = useChartDrawings({
    drawings: pane.drawings[symbol] ?? noDrawings,
    onChange: onSaveDrawings, tool, onToolChange, scope: viewKey, enabled: Boolean(feed.candles.length), active,
  });

  const connectionText = feed.historical ? 'History' : feed.connection === 'live' ? 'Live' :
    feed.connection === 'delayed' ? 'Delayed' : feed.connection === 'updating' ? 'Updating' : feed.connection === 'reconnecting' ? 'Reconnecting' :
    feed.connection === 'offline' || feed.error ? 'Offline' : 'Connecting';
  const paging = feed.loadingHistory || feed.loadingLater;

  const renderHeader = (current?: Candle, ref?: Ref<HTMLDivElement>) => (
    <div ref={ref} className="pane-header" data-chart-header>
      <div className="pane-legend">
        <div className="pane-identity">
          <button className="pane-market" title="Change chart symbol" aria-label={`Change symbol for ${symbol}`} onClick={onPickSymbol}>
            <span className="asset-icon" data-asset={asset}>{asset.slice(0, 1)}</span>
            <strong>{symbol}</strong>
          </button>
          <span className="pane-interval">{interval}</span>
          <span className="pane-provider">TradingView</span>
        </div>
        {current && <ChartQuote current={current} />}
      </div>
      <div className="pane-header-end">
        <span className="connection" data-connection={connectionText.toLowerCase()} title={`TradingView · ${connectionText}${feed.delaySeconds ? ` ${Math.ceil(feed.delaySeconds / 60)} min` : ''}`}>
          <i aria-hidden="true" />{connectionText}
        </span>
        {drawing.selectedId && <button className="icon-button pane-button" title="Delete selected drawing" aria-label="Delete selected drawing" onClick={drawing.deleteSelected}><Trash2 size={15} /></button>}
        {canMaximize && <button className="icon-button pane-button" onClick={onMaximize}
          title={maximized ? 'Restore chart grid' : 'Maximize chart'} aria-label={maximized ? 'Restore chart grid' : 'Maximize chart'}>
          {maximized ? <Minimize size={15} /> : <Maximize size={15} />}
        </button>}
      </div>
    </div>
  );

  return (
    <section className="chart-pane" data-active={active} aria-label={`${symbol} ${interval} chart`}
      onPointerDownCapture={onActivate} onFocusCapture={onActivate}>
      <div className="pane-body">
        {feed.candles.length > 0 && <ChartSurface key={feed.windowId} pane={pane} feed={feed} active={active}
          timeZone={timeZone} position={position} drawingLayer={drawing.layer} onSavePosition={onSavePosition}
          onPriceScaleChange={onPriceScaleChange} renderHeader={renderHeader} />}
        {!feed.candles.length && renderHeader()}
        {!feed.candles.length && (feed.error ? (
          <div className="pane-empty" role="status">
            <strong>Candles unavailable</strong>
            <p>{feed.error}</p><button className="control" onClick={feed.retry}>Try again</button>
          </div>
        ) : (
          <div className="pane-empty" role="status"><LoaderCircle className="spinner" size={20} /><span>Loading candles…</span></div>
        ))}
        {feed.candles.length > 0 && (feed.loading || feed.error) && (
          <div className="pane-notice" role="status">{feed.loading ? 'Loading candles…' : feed.error}{feed.error && <button onClick={feed.retry}>Retry</button>}</div>
        )}
      </div>
      {(feed.hasLater || feed.historical || feed.historyError || paging) && <div className="pane-footer">
        {paging && <span className="history-label" role="status"><LoaderCircle className="spinner" size={12} />Loading {feed.loadingLater ? 'newer' : 'older'} candles…</span>}
        {feed.historyError && <span className="history-label" role="status">History unavailable <button onClick={feed.retry} title={feed.historyError}>Retry</button></span>}
        <div className="history-actions">
          {feed.hasLater && !feed.historyError && <button onClick={feed.loadLater} disabled={paging || feed.loading}>Load newer</button>}
          {feed.historical && <button onClick={feed.goLive} disabled={feed.loading}>Latest</button>}
        </div>
      </div>}
    </section>
  );
}

function ChartSurface({ pane, feed, active, position, timeZone, drawingLayer, onSavePosition, onPriceScaleChange, renderHeader }: {
  pane: Pane;
  feed: Feed;
  active: boolean;
  position?: SavedPosition;
  timeZone: string;
  drawingLayer: ReturnType<typeof useChartDrawings>['layer'];
  onSavePosition: (position: SavedPosition) => void;
  onPriceScaleChange: (mode: PriceScaleMode) => void;
  renderHeader: NonNullable<CandlestickChartProps['renderHeader']>;
}) {
  const { candles, historical } = feed;
  const latest = candles.at(-1)!;
  const closeAt = !historical && feed.candleClose?.time === latest.time ? feed.candleClose.closeAt : undefined;
  const [savedView] = useState<ChartView>(() => {
    if (!position || feed.windowId > 0) {
      return { right: 6, count: defaultChartCount(candles.length, true), min: null, max: null, priceScale: pane.priceScale };
    }
    const { view, anchor, anchorOffset = 0 } = position;
    let right = view.right;
    if (anchor !== undefined) {
      right = anchor >= candles[0].time && anchor <= latest.time
        ? timeToCandleIndex(candles, pane.interval, anchor) + anchorOffset - candles.length : 6;
    }
    return { ...view, right, priceScale: pane.priceScale,
      priceBarRatio: view.priceScale === pane.priceScale ? view.priceBarRatio : undefined };
  });
  const current = useRef({ candles, historical, onSavePosition });
  current.current = { candles, historical, onSavePosition };
  const save = useCallback((view: ChartView) => {
    const { candles, historical, onSavePosition } = current.current;
    if (!historical && view.right >= -1) {
      onSavePosition({ view });
      return;
    }
    const right = candles.length + view.right;
    const index = Math.min(candles.length - 1, Math.max(0, Math.floor(right)));
    onSavePosition({ view, anchor: candles[index].time, anchorOffset: right - index });
  }, []);

  const controlsRef = useRef<ChartViewControls>(null);
  const reset = useCallback(() => {
    if (historical) feed.goLive();
    else controlsRef.current?.resetView();
  }, [historical, feed.goLive]);
  useEffect(() => {
    if (!active) return;
    const handleReset = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          (event.code !== 'KeyR' && event.key.toLowerCase() !== 'r')) return;
      if (document.querySelector('dialog[open]') || (event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'))) return;
      event.preventDefault();
      reset();
    };
    window.addEventListener('keydown', handleReset);
    return () => window.removeEventListener('keydown', handleReset);
  }, [active, reset]);

  return (
    <CandlestickChart mode="market" frame="embedded" compact candles={candles} interval={pane.interval}
      controlsRef={controlsRef} savedView={savedView} onViewChange={save} onViewAction={({ after }) => save(after)}
      timeZoneOverride={timeZone} drawingLayer={drawingLayer}
      hasEarlier={feed.hasEarlier && !feed.historyError} loadingHistory={feed.loading || feed.loadingHistory || feed.loadingLater}
      onLoadEarlier={feed.loadEarlier}
      renderHeader={renderHeader}
      renderPriceMarker={(projection) => <ChartPriceMarker candle={latest} closeAt={closeAt} projection={projection} />}
      renderControls={(controls) => (
        <>
          <ChartNavigation pan={controls.pan} zoom={controls.zoom} reset={reset} />
          <div className="chart-scale" role="group" aria-label="Chart price scale">
            <button aria-label="Logarithmic scale" aria-pressed={controls.settings.priceScale === 'log'}
              title="Logarithmic scale" disabled={!controls.logarithmicAvailable && controls.settings.priceScale !== 'log'}
              onClick={() => {
                const priceScale = controls.settings.priceScale === 'log' ? 'linear' : 'log';
                controls.changeDisplay({ timeZone, priceScale });
                onPriceScaleChange(priceScale);
              }}>Log</button>
            <button aria-label="Auto fit price scale" aria-pressed={controls.automatic} title="Auto fit price scale" onClick={controls.toggleAutomatic}>Auto</button>
          </div>
        </>
      )} />
  );
}
