# STRATEGY — btc-race-24h-20261117-0603

Hour-dip mean reversion: a long-only cbBTC/USDC bot that trades at the hourly
scale and holds for hours. `main.ts` (Node 22, stdlib + the kit SDK shim under
`vendor/`) answers every `hello`/`batch` of the agent-fun/bars-replay/v1
protocol with exactly one reply echoing its `seq`.

## 1. The dev window

1,440 one-minute CBBTC bars, 2026-11-16T06:03Z → 2026-11-17T06:03Z (analysis
script: `analysis/characterize.mjs`). Open $64,433.84 → close $64,775.95,
total return **+0.531%** (+$5.31 on $1,000 before costs). High $65,609.83 /
low $63,874.36 (range 2.693% of open). 1-min log-return SD 6.44 bps; hourly
log-return SD 49.61 bps. Up/down/zero 1-min bars: 613 / 710 / 116; flat bars
(o==h==l==c) 141 = 9.79%. Missing minutes: 0 (rejection threshold >28).
Max close-to-close drawdown −2.119%; max run-up +2.493%. Gross absolute
1-min movement 61.65%; drift is only 0.9% of gross movement — the window is
chop-dominated, and hourly returns mean-revert (lag-1 autocorrelation −0.35).

## 2. Baselines (grade-local, --driver process)

| Baseline | Net PnL | Trades | Max DD | House/extra |
|---|---|---|---|---|
| momentum | +$2.45 | 1 | 2.12% | house |
| buy-and-hold | +$1.07 | 1 | 2.12% | house |
| hold-cash | $0.00 | 0 | 0% | house |
| rsi-bollinger | −$24.25 | 11 | 2.79% | extra |
| adx-momentum | −$32.66 | 26 | 3.60% | extra |
| ema-cross | −$106.21 | 68 | 10.96% | house |

Outcomes rank almost perfectly monotone in trade count: a full-size round trip
costs ~26 bps (4 bps fee + 2 bps slippage each way + impact), which eats
roughly half the whole day's drift. The winning shape is one full-size entry,
hold to the end, entry timing as the only real decision, exits rare and wide.

## 3. The bot (final config)

- **Entry:** trailing 60-bar return < −1.00% AND RSI(14) < 50 → buy full cash
  (1 open position max). No entries after seq 1410; 10-bar cooldown after exits.
- **Exit:** trailing 60-bar return > +1.00%, or take-profit +2.0% over cost, or
  hard stop −2.0% under cost. Whichever comes first.
- **Sizing:** full cash, capped by max_weight_bps; max_slippage_bps 100 per order.
- **Determinism:** pure float64 arithmetic on the bars, no clock, no network,
  no randomness — two runs give byte-identical action logs. A flat bar updates
  the indicators like any other; a missing bar updates nothing and sends no orders.

## 4. Results (grade-local, --driver process, ground truth)

- **Dev net PnL +$24.54, 6 trades, max drawdown 0.72%, win rate 100%, fees
  $2.44, 0 rejected orders, guardrails compliant, L1 reproduced (two runs
  byte-identical).** Coordinator re-ran grade-local on the repo independently
  after a one-line cleanup (unused import removed): net PnL 24.538535 USDC,
  max DD 0.7237%, action_log_sha256 identical to the builder's run
  (`56f74c8f…`), L1 reproduced byte for byte.
- vs best baseline (momentum +$2.45): ~10x, +$22.09 above it. Clears the dev
  gate (net PnL > 0) with wide margin. Even at 2x fees the net PnL stays
  +$22.09.
- Three round trips, all winners: +$13.88 (+1.39%, ~2.3h hold), +$6.03
  (+0.60%), +$4.53 (+0.45%). Profitable in both halves (+$19.91 / +$4.53).

Edge cases verified by the coordinator with a direct stdin harness: warm-up
batch, flat bar, missing bar (empty batch), and first tradable batch with no
history all answer with exactly one reply echoing the seq and no orders, no
crash, no stderr.

## 5. Tuning (full log: analysis/TUNING.md)

- v1 (EMA 8/21 trend + RSI/Bollinger/breakout entries) graded −$103.10 on 82
  trades — discarded. Every 1-minute variant lost money.
- v2 grid sweep (lookback L × entry threshold T): at L=60 every T from −0.50%
  to −1.10% is positive ($10.05–$26.26, same 6 trades); L=45 at −0.90%/−1.00%
  also strong (+$26.35/+$27.84). A plateau, not a spike. Chosen L=60, T=100,
  TP/stop 200 — near the top of the plateau with the most trades, i.e. least
  dependent on a single swing. TP/stop barely matter (exits driven by the
  reversal rule).

## 6. What the dev window cannot prove

The race window is unseen. If it trends hard with no −1% hour, the bot may
trade 0–2 times and end near $0; if it falls repeatedly with no +1% bounce,
the −2% hard stop bounds each losing trade. The dev plateau is the only
evidence — it is broad (every threshold in the band is positive, both halves
profitable), not a single fitted point.
