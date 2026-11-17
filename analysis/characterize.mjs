// Dev-window characterization for btc-race-24h-20261117-0603.
// Stdlib only. Reads dataset/bars/CBBTC.ndjson.gz, prints stats as JSON + text.
// Prices are integer USDC-scaled values; all returns below are scale-free ratios.
import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const path = process.argv[2];
const bars = [];
const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
for await (const line of rl) {
  if (!line.trim()) continue;
  const b = JSON.parse(line);
  bars.push({ t: b.t, o: Number(b.o), h: Number(b.h), l: Number(b.l), c: Number(b.c) });
}
bars.sort((a, b) => a.t - b.t);

const n = bars.length;
const first = bars[0], last = bars[n - 1];
const open = first.o, close = last.c;
const totalRet = close / open - 1;
let hi = -Infinity, lo = Infinity;
for (const b of bars) { hi = Math.max(hi, b.h); lo = Math.min(lo, b.l); }
const rangePct = (hi - lo) / open;

// Missing minutes: bars are 60,000 ms apart; count gaps > 60s.
let missing = 0; const gaps = [];
for (let i = 1; i < n; i++) {
  const d = (bars[i].t - bars[i - 1].t) / 60000;
  if (d > 1) { missing += d - 1; gaps.push([new Date(bars[i - 1].t).toISOString(), d]); }
}

// Flat bars: o==h==l==c
const flat = bars.filter(b => b.o === b.h && b.h === b.l && b.l === b.c).length;

// 1-min log returns on closes
const lr = [];
for (let i = 1; i < n; i++) lr.push(Math.log(bars[i].c / bars[i - 1].c));
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const sd1 = sd(lr);
const up = lr.filter(x => x > 0).length, down = lr.filter(x => x < 0).length, zero = lr.filter(x => x === 0).length;

// Hourly log returns (60-bar closes), non-overlapping
const hr = [];
for (let i = 60; i < n; i += 60) hr.push(Math.log(bars[i].c / bars[i - 60].c));
const sdH = sd(hr);

// Max run-up / run-down on closes (peak-to-trough and trough-to-peak, %)
let peak = bars[0].c, maxDD = 0, ddStart = 0, ddEnd = 0;
let trough = bars[0].c, maxRU = 0, ruStart = 0, ruEnd = 0;
for (let i = 1; i < n; i++) {
  if (bars[i].c > peak) peak = bars[i].c;
  const dd = bars[i].c / peak - 1;
  if (dd < maxDD) { maxDD = dd; ddStart = peak; ddEnd = i; }
  if (bars[i].c < trough) trough = bars[i].c;
  const ru = bars[i].c / trough - 1;
  if (ru > maxRU) { maxRU = ru; ruStart = trough; ruEnd = i; }
}
// Longest monotonic run of closes (up-run / down-run in bars) and best/worst 60-min window return
let best60 = -Infinity, worst60 = Infinity, best60i = 0, worst60i = 0;
for (let i = 60; i < n; i++) {
  const r = bars[i].c / bars[i - 60].c - 1;
  if (r > best60) { best60 = r; best60i = i; }
  if (r < worst60) { worst60 = r; worst60i = i; }
}
// Net drift vs gross movement: sum |1-min returns| vs |total|
const gross = lr.reduce((s, x) => s + Math.abs(x), 0);
const driftShare = Math.abs(Math.log(close / open)) / gross;

console.log(JSON.stringify({
  bars: n,
  window_start_utc: new Date(first.t).toISOString(),
  window_end_utc: new Date(last.t + 60000).toISOString(),
  open_usd: open / 1e5, close_usd: close / 1e5,
  total_return_pct: +(totalRet * 100).toFixed(4),
  high_usd: hi / 1e5, low_usd: lo / 1e5,
  high_low_range_pct_of_open: +(rangePct * 100).toFixed(4),
  logret_1min_sd_bps: +(sd1 * 1e4).toFixed(2),
  logret_1min_mean_bps: +(mean(lr) * 1e4).toFixed(3),
  logret_hourly_sd_bps: +(sdH * 1e4).toFixed(2),
  hourly_returns_pct: hr.map(x => +(x * 100).toFixed(3)),
  up_bars: up, down_bars: down, zero_bars_1min: zero,
  up_share_pct: +(100 * up / lr.length).toFixed(2),
  flat_bars: flat, flat_share_pct: +(100 * flat / n).toFixed(2),
  missing_minutes: missing, gaps,
  max_drawdown_close_to_close_pct: +(maxDD * 100).toFixed(3),
  max_runup_close_to_close_pct: +(maxRU * 100).toFixed(3),
  best_60min_return_pct: +(best60 * 100).toFixed(3),
  worst_60min_return_pct: +(worst60 * 100).toFixed(3),
  best_60min_end_utc: new Date(bars[best60i].t).toISOString(),
  worst_60min_end_utc: new Date(bars[worst60i].t).toISOString(),
  gross_abs_1min_move_pct: +(gross * 100).toFixed(3),
  drift_share_of_gross_move: +driftShare.toFixed(3),
}, null, 2));
