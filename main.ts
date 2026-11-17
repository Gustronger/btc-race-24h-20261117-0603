// Hour-dip mean reversion: a long-only cbBTC/USDC minute-bar bot for the
// make.fun BTC race.
//
// The dev window taught one structural fact (see analysis/TUNING.md): on
// 1-minute bars every fast signal is noise — EMA crosses, RSI dips and
// breakouts all churned at ~26 bps a round trip and lost money — while the
// hourly returns mean-revert (lag-1 autocorrelation -0.35). So this bot
// trades at the hourly scale and holds for hours, not minutes:
//
//   - Entry: the trailing 60-bar (one hour) return falls below -1.00% and
//     RSI(14) is under 50 (the dip is a real wash-out, not a drift). Buy the
//     full cash balance; one open position, never more.
//   - Exit: the trailing 60-bar return swings above +1.00% (the bounce has
//     played out), or take-profit +2.0% over cost, or hard stop -2.0% under
//     cost. Whichever comes first; holds run about 1-3 hours on the dev
//     window, each round trip clearing its ~26 bps of fee + slippage +
//     impact several times over.
//   - Nothing else trades: in a downtrend with no -1% hour we sit in cash,
//     and after an exit we wait 10 bars before looking again. No new entry
//     in the last 30 bars — a fresh trade cannot pay its round trip before
//     the replay flattens everything at the last close.
//   - Determinism: pure float64 arithmetic on the bars, no clock, no
//     network, no randomness at all, so two runs give byte-identical action
//     logs. A flat bar or a missing bar is handled the same way: no bar, no
//     indicator update and no decision on that batch.
//   - Protocol: the kit shim speaks agent-fun/bars-replay/v1 for us; we
//     answer every batch with exactly one reply echoing its seq, and send
//     no orders while warming up.

import { BPS, runBars, type BuyInput, type OrderInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// --- tunables (swept in analysis/TUNING.md; the plateau, not a sharp optimum) ---
const LOOKBACK_BARS = 60; // one hour of 1-minute bars
const ENTRY_RETURN_BPS = -100; // buy when the trailing hour is down 1.00% or more
const EXIT_RETURN_BPS = 100; // sell when the trailing hour is up 1.00% or more
const RSI_PERIOD = 14;
const RSI_ENTRY_MAX = 50; // entry only while RSI is under 50
const TP_BPS = 200; // take profit: value >= cost * 1.02
const STOP_BPS = 200; // hard stop: value <= cost * 0.98
const COOLDOWN_BARS = 10; // bars to wait after an exit before re-entering
const NO_ENTRY_AFTER_SEQ = 1410; // window is 1440 bars; stop opening late
const MAX_SLIPPAGE_BPS = 100; // 1% past the close we decided on

// --- indicator state, one series for the single symbol ---
const closes: number[] = []; // closes, oldest first, capped at LOOKBACK_BARS + 1
let rsiGain: number | null = null;
let rsiLoss: number | null = null;
const rsiFirst: number[] = [];
let lastClose: number | null = null;
let cooldownUntil = -1; // no entries before this seq

function pushBar(c: number): void {
  closes.push(c);
  if (closes.length > LOOKBACK_BARS + 1) closes.shift();
  // RSI(14), Wilder's smoothing, seeded on the first 14 changes.
  if (lastClose !== null) {
    const change = c - lastClose;
    if (rsiGain === null || rsiLoss === null) {
      rsiFirst.push(change);
      if (rsiFirst.length === RSI_PERIOD) {
        rsiGain = rsiFirst.reduce((a, x) => a + (x > 0 ? x : 0), 0) / RSI_PERIOD;
        rsiLoss = rsiFirst.reduce((a, x) => a + (x < 0 ? -x : 0), 0) / RSI_PERIOD;
      }
    } else {
      rsiGain = (rsiGain * (RSI_PERIOD - 1) + (change > 0 ? change : 0)) / RSI_PERIOD;
      rsiLoss = (rsiLoss * (RSI_PERIOD - 1) + (change < 0 ? -change : 0)) / RSI_PERIOD;
    }
  }
  lastClose = c;
}

/** RSI(14), or null before it is seeded. */
function rsi(): number | null {
  if (rsiGain === null || rsiLoss === null) return null;
  const moved = rsiGain + rsiLoss;
  return moved === 0 ? 50 : (100 * rsiGain) / moved;
}

/** Trailing LOOKBACK_BARS return in bps, or null before enough bars. */
function trailingReturnBps(): number | null {
  if (closes.length <= LOOKBACK_BARS) return null;
  const now = closes[closes.length - 1]!;
  const then = closes[closes.length - 1 - LOOKBACK_BARS]!;
  return ((now - then) / then) * 10_000;
}

await runBars({
  onBatch(state, batch) {
    // Fold this batch's bar (if CBBTC has one) into the indicators. A flat
    // bar updates them like any other; a missing bar updates nothing.
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    const fresh = bar !== undefined;
    if (fresh) pushBar(Number(bar.c));
    if (state.warmingUp || !fresh) return [];

    const { caps, fees } = state.hello;
    const held = state.positions.get(SYMBOL);
    const orders: OrderInput[] = [];

    if (held !== undefined) {
      const value = state.value(SYMBOL, held.qty);
      const retBps = trailingReturnBps();
      const exit =
        (retBps !== null && retBps >= EXIT_RETURN_BPS) ||
        value * 10_000n >= held.cost * BigInt(10_000 + TP_BPS) ||
        value * 10_000n <= held.cost * BigInt(10_000 - STOP_BPS);
      if (exit) {
        orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput);
        cooldownUntil = batch.seq + COOLDOWN_BARS;
      }
      return orders;
    }

    // Flat: look for the hour-dip entry, only early enough and off cooldown.
    if (batch.seq >= NO_ENTRY_AFTER_SEQ || batch.seq < cooldownUntil) return [];
    const retBps = trailingReturnBps();
    const r = rsi();
    if (retBps === null || retBps > ENTRY_RETURN_BPS) return [];
    if (r === null || r >= RSI_ENTRY_MAX) return [];
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
    let slice = state.cash;
    if (slice > byWeight) slice = byWeight;
    if (slice === 0n || slice < BigInt(fees.min_notional_quote_units)) return [];
    orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies BuyInput);
    return orders;
  },
});
