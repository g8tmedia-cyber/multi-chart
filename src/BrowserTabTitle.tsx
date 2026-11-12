import { useEffect, useState } from 'react';
import type { MarketQuote } from '@/data/provider';
import { formatChartPrice, formatDecimal } from '@/lib/number-format';

export default function BrowserTabTitle({ symbol, workspace }: { symbol: string; workspace: string }) {
  const [quote, setQuote] = useState<MarketQuote>();
  useEffect(() => {
    const source = new EventSource(`/api/tradingview/quote?${new URLSearchParams({ symbol })}`);
    source.addEventListener('quote', (event: MessageEvent<string>) => setQuote(JSON.parse(event.data) as MarketQuote));
    source.addEventListener('unavailable', () => source.close());
    return () => source.close();
  }, [symbol]);

  const ticker = symbol.slice(symbol.indexOf(':') + 1);
  const price = quote ? ` ${formatChartPrice(quote.price)}` : '';
  const percent = quote?.changePercent;
  const change = percent === undefined ? '' : ` ${percent < 0 ? '▼' : '▲'} ${percent > 0 ? '+' : ''}${formatDecimal(percent, 2, 2)}%`;
  const title = `${ticker}${price}${change} · ${workspace}`;
  useEffect(() => { document.title = title; }, [title]);
  return null;
}
