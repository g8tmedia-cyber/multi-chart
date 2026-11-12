import {
  ChartCandlestick, Crosshair, Ellipsis, Minus, Moon, MoveUpRight,
  Plus, Search, Settings2, Square, Sun, X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { sameChartView } from '@/components/charts/useChartActionObserver';
import MarketGrid from '@/components/markets/MarketGrid';
import MarketLayoutIcon from '@/components/markets/MarketLayoutIcon';
import { TRADINGVIEW_INTERVALS } from '@/data/tradingview-shared';
import type { DrawingTool } from '@/drawings/types';
import { supportedChartTimeZones } from '@/lib/chart-timezones';
import { MARKET_LAYOUTS, type MarketLayout } from '@/lib/markets-workspace';
import type { Interval } from '@/lib/trading-types';
import ChartPane from './ChartPane';
import { Appearance, Modal, Popup, TimeframeSearch, TradingViewSearch } from './menus';
import { chartViewKey, LAYOUT_NAMES, newWorkspace, readWorkspace, writeWorkspace, type AppState, type Pane, type Workspace } from './workspace';

const QUICK_INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const GROUPS: { label: string; values: Interval[] }[] = [
  { label: 'Minutes', values: TRADINGVIEW_INTERVALS.filter((interval) => interval.endsWith('m')) },
  { label: 'Hours', values: TRADINGVIEW_INTERVALS.filter((interval) => interval.endsWith('h')) },
  { label: 'Days and months', values: TRADINGVIEW_INTERVALS.filter((interval) => /[dwM]$/.test(interval)) },
];
const TOOLS = [
  { tool: 'select', name: 'Crosshair / Select', Icon: Crosshair },
  { tool: 'ray', name: 'Horizontal ray', Icon: Minus },
  { tool: 'line', name: 'Trend line', Icon: MoveUpRight },
  { tool: 'box', name: 'Rectangle', Icon: Square },
] as const;

type ChartDialog = { type: 'symbol' | 'timeframe'; query: string } | { type: 'appearance' | 'rename' };

function hslChannels(hex: string) {
  const values = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = values;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lightness = (min + max) / 2;
  const delta = max - min;
  if (delta === 0) return `0 0% ${lightness * 100}%`;
  const angle = max === red ? (green - blue) / delta : max === green ? 2 + (blue - red) / delta : 4 + (red - green) / delta;
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  return `${(angle * 60 + 360) % 360} ${saturation * 100}% ${lightness * 100}%`;
}

function priceLabelBackground(hex: string) {
  const linear = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  // White label text needs at least 4.5:1 contrast against custom candle colors.
  if (luminance <= 0.18) return hex;
  const channels = linear.map((channel) => {
    const value = channel * 0.18 / luminance;
    return Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
  });
  return `rgb(${channels.join(', ')})`;
}

function Clock({ timeZone }: { timeZone: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const formatter = useMemo(() => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }), [timeZone]);
  return <time className="clock" dateTime={new Date(now).toISOString()}>{formatter.format(now)}</time>;
}

function Rename({ name, onSave, onClose }: { name: string; onSave: (name: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState(name);
  return <Modal title="Rename workspace" onClose={onClose}>
    <form className="rename-form" onSubmit={(event) => { event.preventDefault(); if (title.trim()) onSave(title.trim()); }}>
      <label>Workspace name<input data-initial-focus value={title} maxLength={36} onChange={(event) => setTitle(event.target.value)} required /></label>
      <div className="modal-actions"><button className="control" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!title.trim()}>Save name</button></div>
    </form>
  </Modal>;
}

export default function App() {
  const [state, setState] = useState(readWorkspace);
  const currentState = useRef(state);
  const [popup, setPopup] = useState<'interval' | 'layout' | 'workspace' | null>(null);
  const [dialog, setDialog] = useState<ChartDialog | null>(null);
  const [tool, setTool] = useState<DrawingTool>('select');
  const timeZones = useMemo(supportedChartTimeZones, []);
  const workspace = state.tabs.find((tab) => tab.id === state.current) ?? state.tabs[0];
  const active = workspace.panes[workspace.active];
  const count = MARKET_LAYOUTS[workspace.layout].count;

  useEffect(() => { writeWorkspace(currentState.current); }, []);

  useEffect(() => {
    if (dialog || popup) return;
    const openFromTyping = (event: globalThis.KeyboardEvent) => {
      const { key, target } = event;
      if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey ||
          [...key].length !== 1 || !key.trim() || '+-='.includes(key)) return;
      if (target instanceof Element && target !== document.body && (
        !target.closest('.chart-pane') || target.closest('input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])')
      )) return;
      event.preventDefault();
      setDialog(/^\d$/.test(key) ? { type: 'timeframe', query: key } : { type: 'symbol', query: key === '/' ? '' : key });
    };
    window.addEventListener('keydown', openFromTyping);
    return () => window.removeEventListener('keydown', openFromTyping);
  }, [dialog, popup]);

  const update = useCallback((mutate: (value: AppState) => AppState) => {
    const previous = currentState.current;
    const next = mutate(previous);
    if (previous === next) return;
    currentState.current = next;
    writeWorkspace(next);
    setState(next);
  }, []);

  function updateTab(id: string, mutate: (tab: Workspace) => Workspace) {
    update((previous) => {
      const index = previous.tabs.findIndex((tab) => tab.id === id);
      if (index < 0) return previous;
      const next = mutate(previous.tabs[index]);
      if (next === previous.tabs[index]) return previous;
      return { ...previous, tabs: previous.tabs.map((tab, i) => i === index ? next : tab) };
    });
  }

  function updatePane(id: string, index: number, mutate: (pane: Pane) => Pane) {
    updateTab(id, (tab) => {
      const next = mutate(tab.panes[index]);
      if (next === tab.panes[index]) return tab;
      return { ...tab, panes: tab.panes.map((pane, i) => i === index ? next : pane) };
    });
  }

  function activateTab(id: string) {
    setTool('select');
    setPopup(null);
    update((value) => value.current === id ? value : { ...value, current: id });
  }

  function addTab() {
    const names = new Set(state.tabs.map((tab) => tab.name));
    let next = state.tabs.length + 1;
    while (names.has(`Workspace ${next}`)) next += 1;
    const tab = newWorkspace(`Workspace ${next}`, active);
    update((value) => ({ ...value, current: tab.id, tabs: [...value.tabs, tab] }));
    setTool('select');
    setPopup(null);
    requestAnimationFrame(() => document.getElementById(`tab-${tab.id}`)?.focus());
  }

  function closeTab(id: string) {
    const previous = currentState.current;
    if (previous.tabs.length === 1) return;
    const index = previous.tabs.findIndex((tab) => tab.id === id);
    const tabs = previous.tabs.filter((tab) => tab.id !== id);
    const current = previous.current === id ? tabs[Math.min(index, tabs.length - 1)].id : previous.current;
    update((value) => ({ ...value, tabs, current }));
    setTool('select');
    requestAnimationFrame(() => document.getElementById(`tab-${current}`)?.focus());
  }

  function navigateTabs(event: KeyboardEvent, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % state.tabs.length;
    else if (event.key === 'ArrowLeft') next = (index + state.tabs.length - 1) % state.tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = state.tabs.length - 1;
    else if (event.key === 'Delete' && state.tabs.length > 1) { event.preventDefault(); closeTab(state.tabs[index].id); return; }
    else return;
    event.preventDefault();
    const id = state.tabs[next].id;
    activateTab(id);
    document.getElementById(`tab-${id}`)?.focus();
  }

  function setInterval(interval: Interval) {
    updatePane(workspace.id, workspace.active, (pane) => pane.interval === interval ? pane : { ...pane, interval });
    setPopup(null);
  }

  function pickLayout(layout: MarketLayout) {
    updateTab(workspace.id, (tab) => tab.layout === layout && tab.maximized === null ? tab : {
      ...tab, layout, active: Math.min(tab.active, MARKET_LAYOUTS[layout].count - 1), maximized: null,
    });
    setPopup(null);
  }

  function pickSymbol(symbol: string) {
    updatePane(workspace.id, workspace.active, (pane) => pane.symbol === symbol ? pane : { ...pane, symbol });
    setDialog(null);
    setTool('select');
  }

  const closePopup = useCallback(() => setPopup(null), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const openSymbolSearch = () => { closePopup(); setDialog({ type: 'symbol', query: '' }); };
  const togglePopup = (menu: NonNullable<typeof popup>) => setPopup((value) => value === menu ? null : menu);
  const palette = {
    '--chart-bullish': hslChannels(state.colors.up), '--chart-bearish': hslChannels(state.colors.down),
    '--chart-bullish-wick': hslChannels(state.colors.upWick), '--chart-bearish-wick': hslChannels(state.colors.downWick),
    '--up-price-label-background': priceLabelBackground(state.colors.up),
    '--down-price-label-background': priceLabelBackground(state.colors.down),
  } as CSSProperties;

  return (
    <div className="app" data-theme={state.theme} style={palette}>
      <header className="titlebar">
        <div className="brand"><span className="brand-mark"><ChartCandlestick size={21} strokeWidth={1.9} /></span><h1>Multi Chart</h1></div>
        <div className="tabs" role="tablist" aria-label="Chart workspaces">
          {state.tabs.map((tab, index) => <div className="tab-item" key={tab.id} data-current={tab.id === workspace.id}>
            <button type="button" id={`tab-${tab.id}`} role="tab" aria-selected={tab.id === workspace.id} aria-controls="workspace-panel"
              tabIndex={tab.id === workspace.id ? 0 : -1} onClick={() => activateTab(tab.id)} onKeyDown={(event) => navigateTabs(event, index)}
              onDoubleClick={() => setDialog({ type: 'rename' })} title={tab.name}>{tab.name}</button>
            {state.tabs.length > 1 && <button className="tab-close" aria-label={`Close ${tab.name}`} title={`Close ${tab.name}`} onClick={() => closeTab(tab.id)}><X size={13} /></button>}
          </div>)}
        </div>
        <button className="icon-button add-tab" onClick={addTab} aria-label="New workspace tab" title="New workspace tab"><Plus size={18} /></button>
        <div className="titlebar-end">
          <Popup className="workspace-options" label={<><Ellipsis size={18} /><span className="sr-only">Workspace options</span></>}
            expanded={popup === 'workspace'} onToggle={() => togglePopup('workspace')} onClose={closePopup}>
            <button className="menu-item" onClick={() => { closePopup(); setDialog({ type: 'rename' }); }}>Rename workspace</button>
            {state.tabs.length > 1 && <button className="menu-item" onClick={() => { closePopup(); closeTab(workspace.id); }}>Close workspace</button>}
          </Popup>
          <span className="top-separator" />
          <button className="icon-button" title={`Switch to ${state.theme === 'dark' ? 'light' : 'dark'} mode`}
            aria-label={`Switch to ${state.theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={() => update((value) => ({ ...value, theme: value.theme === 'dark' ? 'light' : 'dark' }))}>
            {state.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="icon-button" title="Chart appearance" aria-label="Chart appearance" onClick={() => { closePopup(); setDialog({ type: 'appearance' }); }}><Settings2 size={18} /></button>
        </div>
      </header>

      <div className="chart-toolbar" role="toolbar" aria-label="Active chart settings">
        <button className="control symbol-trigger" aria-label={`Symbol search, current symbol ${active.symbol}`} onClick={openSymbolSearch}>
          <Search size={16} /><strong>{active.symbol}</strong>
        </button>
        <span className="top-separator" />
        <div className="quick-intervals" aria-label="Quick intervals">
          {QUICK_INTERVALS.map((interval) => (
            <button className="interval-button" key={interval} aria-pressed={active.interval === interval} onClick={() => setInterval(interval)}>{interval}</button>
          ))}
        </div>
        <Popup className="interval-popup" name={`Interval ${active.interval}`}
          label={<span className={QUICK_INTERVALS.includes(active.interval) ? 'quick-interval-current' : ''}>{active.interval}</span>}
          expanded={popup === 'interval'} onToggle={() => togglePopup('interval')} onClose={closePopup}>
          <div className="interval-menu" aria-label="Candle intervals">
            {GROUPS.map((group) => <div className="interval-group" key={group.label}><p>{group.label}</p><div>
              {group.values.map((interval) => <button key={interval} className="interval-button" aria-pressed={active.interval === interval} onClick={() => setInterval(interval)}>{interval}</button>)}
            </div></div>)}
          </div>
        </Popup>
        <div className="toolbar-end">
          <Popup className="layout-popup" name="Layout" label={<><MarketLayoutIcon layout={workspace.layout} /><span>Layout</span></>}
            expanded={popup === 'layout'} onToggle={() => togglePopup('layout')} onClose={closePopup}>
            <p className="menu-heading">Chart layout</p>
            <div className="layout-choices">
              {(Object.keys(MARKET_LAYOUTS) as MarketLayout[]).map((layout) => <button key={layout} className="layout-choice" aria-pressed={workspace.layout === layout} onClick={() => pickLayout(layout)}>
                <MarketLayoutIcon layout={layout} /><span>{LAYOUT_NAMES[layout]}</span>
              </button>)}
            </div>
          </Popup>
        </div>
      </div>

      <main className="workspace-panel" id="workspace-panel" role="tabpanel" aria-labelledby={`tab-${workspace.id}`}>
        <aside className="drawing-toolbar" aria-label="Drawing tools">
          {TOOLS.map(({ tool: option, name, Icon }) => <button className="icon-button tool-button" key={option}
            aria-label={name} title={name} aria-pressed={tool === option} onClick={() => setTool(option)}>
            <Icon size={19} strokeWidth={1.65} />
          </button>)}
        </aside>
        <div className="chart-area">
          <MarketGrid key={workspace.id} layout={workspace.layout} maximized={workspace.maximized}
            paneIds={workspace.panes.slice(0, count).map((pane) => pane.id)} sizes={workspace.sizes}
            onResize={(columns, sizes) => updateTab(workspace.id, (tab) => ({ ...tab, sizes: { ...tab.sizes, [`${tab.layout}:${columns}`]: sizes } }))}>
            {workspace.panes.slice(0, count).map((pane, index) => {
              const viewKey = chartViewKey(pane.symbol, pane.interval);
              const activate = () => updateTab(workspace.id, (tab) => tab.active === index ? tab : { ...tab, active: index });
              return <ChartPane key={`${pane.id}:${viewKey}`} pane={pane} active={workspace.active === index} maximized={workspace.maximized === index}
                canMaximize={count > 1} timeZone={state.timeZone} tool={tool} onToolChange={setTool}
                onActivate={activate} onPickSymbol={() => { activate(); openSymbolSearch(); }}
                onMaximize={() => updateTab(workspace.id, (tab) => ({ ...tab, active: index, maximized: tab.maximized === index ? null : index }))}
                onPriceScaleChange={(priceScale) => updatePane(workspace.id, index, (value) => value.priceScale === priceScale ? value : { ...value, priceScale })}
                onSaveDrawings={(drawings) => updatePane(workspace.id, index, (value) => ({ ...value, drawings: { ...value.drawings, [pane.symbol]: drawings } }))}
                onSavePosition={(position) => updatePane(workspace.id, index, (value) => {
                  const before = value.views[viewKey];
                  if (before && before.anchor === position.anchor && before.anchorOffset === position.anchorOffset &&
                      sameChartView(before.view, position.view)) return value;
                  return { ...value, views: { ...value.views, [viewKey]: position } };
                })} />;
            })}
          </MarketGrid>
        </div>
      </main>

      <footer className="statusbar">
        <span className="workspace-status">{count} {count === 1 ? 'chart' : 'charts'}<span aria-hidden="true">·</span><span>Saved locally</span></span>
        <div className="time-controls">
          <Clock timeZone={state.timeZone} />
          <select aria-label="Chart time zone" value={state.timeZone} title="Chart time zone" onChange={(event) => {
            const timeZone = event.target.value;
            update((value) => ({ ...value, timeZone }));
          }}>
            {[...new Set([...(timeZones.includes(state.timeZone) ? [] : [state.timeZone]), ...timeZones])].map((zone) => (
              <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>
            ))}
          </select>
        </div>
      </footer>

      {dialog?.type === 'symbol' && <TradingViewSearch initialQuery={dialog.query} active={active.symbol} onPick={pickSymbol} onClose={closeDialog} />}
      {dialog?.type === 'timeframe' && <TimeframeSearch initialQuery={dialog.query} onClose={closeDialog} onPick={(interval) => {
        setInterval(interval); closeDialog();
      }} />}
      {dialog?.type === 'appearance' && <Appearance theme={state.theme} colors={state.colors} onClose={closeDialog}
        onTheme={(theme) => update((value) => ({ ...value, theme }))} onColors={(colors) => update((value) => ({ ...value, colors }))} />}
      {dialog?.type === 'rename' && <Rename name={workspace.name} onClose={closeDialog} onSave={(name) => {
        updateTab(workspace.id, (tab) => ({ ...tab, name })); closeDialog();
      }} />}
    </div>
  );
}
