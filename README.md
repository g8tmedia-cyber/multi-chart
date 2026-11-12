# Multi Chart

Run the app locally with Node.js 22.22 or later.

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the local URL printed by Vite. To check the production build, run `npm.cmd run build`, then `npm.cmd run preview`. Both commands serve the local TradingView adapter.

## GoDaddy Node.js Hosting

This app follows [GoDaddy's ZIP upload instructions](https://www.godaddy.com/en-ph/help/upload-my-ai-generated-app-to-nodejs-hosting-42987).
Use the `godaddy-deployment` branch for these changes.

Run `npm ci`, then `npm run package:godaddy` (requires Python 3 for ZIP creation).
Upload **`artifacts/multi-chart-godaddy.zip`** at
[GoDaddy Node.js Hosting](https://www.godaddy.com/nodejs) using **Upload ZIP → Deploy**.
Open the private preview URL to check the app and live charts. Publishing and domain
options depend on your GoDaddy account's hosting entitlement.

The ZIP contains the compiled frontend and TradingView server, with `package.json`
at its root. It excludes `node_modules`, Git metadata, caches, local environment
files, and development tools. GoDaddy installs the two server dependencies;
`npm run build` checks the compiled server and `npm start` runs it. Rebuild and
upload a new ZIP after changing the source. Do not upload only `dist`: the chart
feed requires the included server.

For a GitHub source deployment, select this branch. The source manifest includes
`name`, `version`, `main`, and real `build`/`start` scripts. Build tools are in
`dependencies` because GoDaddy's documented install may omit development packages.
The production server binds to `0.0.0.0:$PORT`; Vite development and preview servers
also respect `PORT`. No database, API key, or other secret is required.

Verify `/healthz`, symbol search, candle history, and live updates on GoDaddy.
The guest TradingView connection requires outbound HTTPS and WebSocket access;
preview success for the UI alone does not verify that feed access works.

## Railway hosting

Connect this repository to a Railway service using the `main` branch. The checked-in
`railway.json` runs `npm run build`, starts the production server with `npm start`,
and checks `/healthz`. Use Node.js 22.22 or later. The server binds to
`0.0.0.0` on Railway's `PORT` and serves both the built app and the TradingView API,
including live event streams. No database or credentials are required. Generate
a Railway domain to open the app. Pushes to the connected branch deploy updates.

To run the same server locally, use `npm run build` followed by `npm start`, then
open `http://localhost:3000` (or set `PORT`).

## Workspace

- Use **Layout** for one chart or grids of two, four, six, or eight. Click a pane to set its symbol and timeframe. Drag a divider to resize the grid. Choose **Layout → Reset layout** to restore equal chart sizes for the current layout.
- Type on a chart to open symbol search, or enter digits to open the timeframe dialog. Enter the duration in minutes. For example, `120` selects `2h`.
- Use **+** to open a workspace tab. Double-click a tab name to rename it. The browser saves each pane’s symbol, timeframe, scale, position, zoom, and drawings. It also saves workspace layouts, the time zone, theme, and candle colors.
- The browser tab shows the active pane’s ticker, live TradingView price and percentage change, and the workspace name.
- Drag the chart to pan, scroll or pinch to zoom, and drag either axis to adjust its scale. Hover near the lower center to reveal the navigation controls. On touch screens, tap the chart to reveal them; they hide after 2.5 seconds of inactivity. Press **Alt+R** to reset the active chart view. **Log** and **Auto** control the price scale.
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
