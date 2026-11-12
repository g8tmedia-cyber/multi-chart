import { Check, ChevronDown, Clock3, Search, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isTradingViewSymbol, searchTradingViewSymbols, TRADINGVIEW_PRESETS, type TradingViewSymbol } from '@/data/tradingview';
import { TRADINGVIEW_INTERVALS } from '@/data/tradingview-shared';
import { duration, type Interval } from '@/lib/trading-types';
import { DEFAULT_COLORS, type Colors, type Theme } from './workspace';
import './styles/timeframe-entry.css';

export function Popup({ label, name, className = '', expanded, onToggle, onClose, children }: {
  label: ReactNode;
  name?: string;
  className?: string;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [expanded, onClose]);

  return (
    <div className={`popup ${className}`} ref={host}>
      <button className="control popup-trigger" ref={trigger} type="button" aria-label={name} aria-expanded={expanded} onClick={onToggle}>
        {label}<ChevronDown size={13} aria-hidden="true" />
      </button>
      {expanded && <div className="popup-panel" onClick={(event) => {
        if ((event.target as HTMLElement).closest('button')) trigger.current?.focus();
      }}>{children}</div>}
    </div>
  );
}

export function Modal({ title, onClose, className = '', children }: {
  title: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = 'workspace-dialog-title';
  useLayoutEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement;
    element?.showModal();
    const initialFocus = element?.querySelector<HTMLElement>('[data-initial-focus]');
    initialFocus?.focus();
    if (initialFocus instanceof HTMLInputElement && initialFocus.type === 'text') {
      const end = initialFocus.value.length;
      initialFocus.setSelectionRange(end, end);
    }
    return () => {
      element?.close();
      if ((opener instanceof HTMLElement || opener instanceof SVGElement) && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog ref={dialog} className={`modal ${className}`} aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog" title="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function TradingViewSearch({ active, initialQuery = '', onPick, onClose }: {
  active: string;
  initialQuery?: string;
  onPick: (symbol: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<{ query: string; markets: TradingViewSymbol[]; error: boolean }>();
  const needle = query.trim().toUpperCase();
  const isQualified = isTradingViewSymbol(needle);
  const ready = result?.query === needle;
  const matches = needle ? (ready ? result.markets : []) : TRADINGVIEW_PRESETS;
  const options = isQualified && !matches.some((market) => market.symbol === needle)
    ? [{ symbol: needle, name: 'Open this symbol', exchange: needle.split(':')[0], type: '' }, ...matches] : matches;

  useEffect(() => {
    if (!needle) return;
    const request = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const markets = await searchTradingViewSymbols(needle, AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]));
        if (!request.signal.aborted) setResult({ query: needle, markets, error: false });
      } catch {
        if (!request.signal.aborted) setResult({ query: needle, markets: [], error: true });
      }
    }, 250);
    return () => { window.clearTimeout(timer); request.abort(); };
  }, [needle]);

  return <Modal title="Symbol search" className="symbol-modal" onClose={onClose}>
    <form className="symbol-search" onSubmit={(event) => { event.preventDefault(); if (options[0]) onPick(options[0].symbol); }}>
      <Search size={18} aria-hidden="true" />
      <input data-initial-focus value={query} onChange={(event) => setQuery(event.target.value)} maxLength={96}
        aria-label="Search TradingView symbols" placeholder="Search or enter EXCHANGE:SYMBOL" autoComplete="off" />
    </form>
    <div className="symbol-list-title"><span>TradingView guest</span>{needle && !ready && <span>Searching…</span>}</div>
    <div className="symbol-list" aria-label="Matching markets">
      {options.map((market) => <button type="button" className="symbol-result" key={market.symbol}
        onClick={() => onPick(market.symbol)} aria-current={market.symbol === active}>
        <span className="asset-icon">{market.exchange.slice(0, 1)}</span>
        <span className="symbol-result-name"><strong>{market.symbol}</strong><small>{market.name || market.exchange}</small></span>
        {market.symbol === active && <Check size={16} aria-hidden="true" />}
      </button>)}
      {needle && ready && result.error && <p className="symbol-list-message" role="status">Search unavailable. You can enter an exchange-qualified symbol.</p>}
      {needle && ready && !result.error && !options.length && <p className="symbol-list-message">No matching symbols.</p>}
    </div>
  </Modal>;
}

const MINUTE_INTERVALS = TRADINGVIEW_INTERVALS.filter((interval) => interval !== '1M')
  .map((interval) => ({ interval, minutes: duration(interval) / 60_000 }));

export function TimeframeSearch({ initialQuery, onPick, onClose }: {
  initialQuery: string;
  onPick: (interval: Interval) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(false);
  const digits = query.trim();
  const numeric = /^\d+$/.test(digits);
  const match = numeric ? MINUTE_INTERVALS.find(({ minutes }) => minutes === Number(digits)) : undefined;
  const suggestions = MINUTE_INTERVALS.filter(({ minutes }) => String(minutes).startsWith(digits));
  const unsupported = Boolean(digits && !match && (submitted || !suggestions.length));

  return <Modal title="Change timeframe" className="timeframe-modal" onClose={onClose}>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (match) onPick(match.interval);
      else setSubmitted(true);
    }}>
      <div className="symbol-search">
        <Clock3 size={17} aria-hidden="true" />
        <input data-initial-focus inputMode="numeric" value={query} autoComplete="off" maxLength={8}
          aria-label="Timeframe in minutes" aria-describedby="timeframe-entry-hint" aria-invalid={unsupported}
          onChange={(event) => { setQuery(event.target.value); setSubmitted(false); }} />
        <span>min</span>
      </div>
      <p className="timeframe-hint" id="timeframe-entry-hint" role="status">
        {unsupported ? 'Choose a supported whole-minute interval.' : match ? `${match.interval} · Press Enter to apply` : 'Enter the timeframe in minutes.'}
      </p>
      <div className="timeframe-choices" aria-label="Supported timeframes">
        {(suggestions.length ? suggestions : MINUTE_INTERVALS).map(({ interval, minutes }) => (
          <button type="button" className="control" key={interval} onClick={() => onPick(interval)}
            aria-current={interval === match?.interval}>
            <strong>{interval}</strong><small>{minutes} min</small>
          </button>
        ))}
      </div>
    </form>
  </Modal>;
}

const COLOR_LABELS: Record<keyof Colors, string> = {
  up: 'Up candle', down: 'Down candle', upWick: 'Up wick', downWick: 'Down wick',
};

export function Appearance({ theme, colors, onTheme, onColors, onClose }: {
  theme: Theme;
  colors: Colors;
  onTheme: (theme: Theme) => void;
  onColors: (colors: Colors) => void;
  onClose: () => void;
}) {
  return (
    <Modal title="Chart appearance" onClose={onClose}>
      <div className="appearance-content">
        <fieldset>
          <legend>Theme</legend>
          <div className="theme-options">
            {(['dark', 'light'] as const).map((option) => (
              <button key={option} className="control" aria-pressed={theme === option} onClick={() => onTheme(option)}>{option === 'dark' ? 'Dark' : 'Light'}</button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Candle colors</legend>
          <div className="color-settings">
            {(Object.keys(COLOR_LABELS) as (keyof Colors)[]).map((key) => (
              <label className="color-setting" key={key}>
                <span>{COLOR_LABELS[key]}</span>
                <code>{colors[key].toUpperCase()}</code>
                <input type="color" value={colors[key]} onChange={(event) => onColors({ ...colors, [key]: event.target.value })} />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="modal-actions">
          <button className="control" onClick={() => onColors(DEFAULT_COLORS)}>Reset colors</button>
          <button className="primary-button" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  );
}
