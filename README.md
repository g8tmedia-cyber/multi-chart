# Multi Chart

Run the app locally with Node.js 22.22 or later.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the local URL printed by Vite. To check the production build, run `npm.cmd run build`, then `npm.cmd run preview`. Both commands serve the local TradingView adapter.

## Workspace

- Use **Layout** for one chart or grids of two, four, six, or eight. Click a pane to set its symbol and timeframe. Drag a divider to resize the grid.
- Type on a chart to open symbol search, or enter digits to open the timeframe dialog. Enter the duration in minutes. For example, `120` selects `2h`.
- Use **+** to open a workspace tab. Double-click a tab name to rename it. The browser saves each pane’s symbol, timeframe, scale, position, zoom, and drawings. It also saves workspace layouts, the time zone, theme, and candle colors.
- The browser tab shows the active pane’s ticker, live TradingView price and percentage change, and the workspace name.
- Drag the chart to pan, scroll or pinch to zoom, and drag either axis to adjust its scale. Hover near the lower center to reveal the navigation controls. Press **Alt+R** to reset the active chart view. **Log** and **Auto** control the price scale.
- With **Auto** on, dragging the plot pans through time and candles fit below the chart labels. Turn **Auto** off or adjust either axis directly to enable vertical panning.
- The countdown under the last price shows the time remaining in the current candle when the TradingView feed supplies its session hours.
- Use the drawing toolbar for a horizontal ray, trend line, or rectangle. Drawings stay on the same symbol and pane across timeframes. Select a drawing and press **Delete** or use its trash button.

## Data and history

The app uses ICT Toolbox’s unofficial TradingView guest connection. Search for a market or enter a qualified symbol such as `VANTAGE:NAS100`. Pan toward the left edge to fetch earlier candles. TradingView controls symbol access, available resolutions, delays, and historical depth.

The app requests candles as needed and keeps its data cache in memory. The local Vite process connects to TradingView without a database or account credentials.

During a feed interruption, charts keep the candles already loaded and retry with TradingView snapshots. When the stream resumes, the app fills gaps with any candles TradingView returns.

The candlestick renderer, price and time axes, viewport behavior, layout grid, drawing logic, and provider patterns were adapted from `C:\dev\ICT_Toolbox`.

## Chart and feed verification

Run `npm.cmd run build`, then `npm.cmd run dev -- --port 5173 --strictPort` when the dev server is down. `ChartQuoteHeader.tsx` keeps the old Vite module URL available to tabs opened before the quote row was renamed.

Browser checks covered desktop and mobile auto-fit, manual vertical panning, and an eight-pane TradingView layout. Changing one timeframe kept the other seven panes connected. Forcing the stream closed kept the candles visible while the live subscriptions recovered. Simulated longer outages also verified historical backfill and preservation of a panned viewport.
