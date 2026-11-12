import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import { createTradingViewApi } from './tradingview';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');

const api = createTradingViewApi();
const serve = sirv(fileURLToPath(new URL('../dist', import.meta.url)), { single: true });
const prefix = '/api/tradingview';
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/healthz') {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('ok');
    return;
  }
  if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
    request.url = request.url!.slice(prefix.length) || '/';
    api.middleware(request, response);
    return;
  }
  serve(request, response);
});

server.listen(port, '0.0.0.0', () => console.log(`Multi Chart listening on port ${port}`));
function shutdown() {
  api.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
