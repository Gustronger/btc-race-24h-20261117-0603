# Tuning log — btc-race-24h-20261117-0603

All numbers are `grade-local --driver process --worktree` on the kit dev
window (1,440 one-minute CBBTC bars), unless marked `sim` (offline
approximation in /tmp/sim*.mjs: fills at next bar's open, 4 bps fee, 2 bps
slippage, constant-product impact against the bar's o_depth, flatten at the
last close). The sim reproduced the shipped v1 exactly (-$103.09, 82 trades),
so it was trusted for sweeping and every shortlisted config was re-checked
with grade-local.

Dev window facts: BTC +0.49% start to end, range about ±1%, 1-minute log-return
sd ~6.4 bps, hourly returns mean-revert (lag-1 autocorrelation -0.35).
A full-size round trip costs ~26 bps, so a trade must catch a move well
bigger than that. Best baseline is momentum at +$2.45 (buy at bar 24, hold).

## Baselines (grade-local)

| baseline | dev net PnL | trades | max DD |
| --- | --- | --- | --- |
| buy-and-hold | +$1.07 | 1 | 2.12% |
| momentum | **+$2.45** | 1 | 2.12% |
| ema-cross | -$106.21 | 68 | 10.96% |
| adx-momentum | -$32.66 | 26 | 3.60% |
| rsi-bollinger | -$24.25 | 11 | 2.79% |
| hold-cash | $0.00 | 0 | 0% |

## v1: fast trend + mean-reversion entries (FAILED, discarded)

EMA(8)/EMA(21) trend filter, entries on RSI(14) < 45 dip, lower-Bollinger tag,
close dipping under EMA8, or 24-bar breakout; exits on cross down, TP +1.5%,
stop -1.0%, trailing 0.8%, RSI > 65, stale 6h; 10-bar cooldown.

- grade-local: **-$103.10, 82 trades, max DD 10.34%, win rate 2.4%**
- Diagnosis: 1-minute signals are noise at this cost level. The
  `close < EMA8` dip leg alone lost -$101 (62 trades). RSI < 45 fired 22
  times for -$40. Every active 1-minute variant lost money; widening the
  exits only reduced the loss (best wide-exit variant: -$15.89, 11 trades).
  Lesson: hold hours, not minutes.

## v2: slow hourly mean reversion (SHIPPED)

Entry: trailing 60-bar return < -1.00% and RSI(14) < 50, full cash.
Exit: trailing 60-bar return > +1.00%, or TP +2.0%, or stop -2.0%.
10-bar cooldown after an exit; no entries after seq 1410.

### Grid sweep (sim): lookback L x entry threshold T, TP/stop 150-300 bps

| L | T (bps) | dev net PnL | trades | max DD |
| --- | --- | --- | --- | --- |
| 45 | 100 | +$27.84 | 4 | 0.66% |
| 45 | 90 | +$26.35 | 4 | 0.66% |
| 60 | 110 | +$26.26 | 6 | 0.73% |
| 60 | 100 | +$24.44 | 6 | 0.73% |
| 60 | 80 | +$13.28 | 6 | 1.32% |
| 60 | 50 | +$10.05 | 6 | 1.32% |
| 60 | 120 | +$6.03 | 2 | 0.58% |
| 75 | 100 | +$5.51 | 5 | 1.32% |
| 90 | 100 | +$5.00 | 5 | 1.32% |
| 120 | 100 | +$0.73 | 5 | 1.32% |

Plateau, not a spike: at L=60 every T from 50 to 110 bps is positive
($10.05-$26.26, same 6 trades), and L=45 at T=90-100 is also strong.
TP/stop barely matter (exits are driven by the reversal rule): TP 100/200/300
and stop 100/200/300 all give $20.28-$24.44 at L=60/T=100. The sell-reversal
threshold does matter: +50 bps gives $4.67, +100 bps $24.44, +150 bps $23.00.

Chosen: L=60, T=100, TP 200, stop 200 — near the top of the plateau, with
the most trades (6) of any top variant, i.e. the least dependent on a single
swing.

Note on the RSI(14) < 50 entry filter: it never binds on the dev window —
all three entries had RSI 21-35, and the sweep shows identical results with
the filter at 45, 50, or off. It is kept as a principled guard (it blocks
buying a -1% hour that is still accelerating downward with RSI pinned high
on a rebound leg), not as a tuned parameter; it costs nothing on dev and may
save a bad fill on the race window.

Note on sim vs graded PnL: the offline sim said +$24.44 for the final
config; grade-local says +$24.54. The $0.10 gap is the sim's fill-model
approximation (it prices impact off the fill bar's o_depth exactly as the
harness does, but rounds through float64 USDC instead of the harness's
integer quote units). The graded number is the truth.

### Final config, grade-local (ground truth)

- **dev net PnL +$24.54, 6 trades, max drawdown 0.72%, win rate 100%,
  fees $2.44, exposure 26.5%, 0 rejected orders, guardrails compliant**
- result_sha256 `6a62ab4b65bf9817e57766d0c7625e897bb731f3fcd2264fe88ffffbafe9aee1`
- action_log_sha256 `56f74c8f55c59be764325b9e2e716aa41136dba51688c617c20f7ecaefadfc65`
- L1 reproduced: true (two runs byte-identical)
- vs best baseline (momentum +$2.45): **~10x**, and +$22.09 above it.

### The three round trips (sim, fills approximated)

| entry (UTC) | exit (UTC) | hold | trade PnL |
| --- | --- | --- | --- |
| seq 374, 12:18, $64,071.64 (r60 -1.10%, RSI 21.3) | seq 511, 14:35, $65,012.85 (r60 +1.23%) | ~2.3h | +$13.88 (+1.39%) |
| seq 571, 15:35, $64,238.75 (r60 -1.52%, RSI 35.4) | seq 624, 16:28, $64,678.03 (r60 +1.01%) | ~0.9h | +$6.03 (+0.60%) |
| seq 1097, 00:21, $64,645.91 (r60 -1.02%, RSI 24.8) | seq 1288, 03:32, $64,990.91 (r60 +1.02%) | ~3.2h | +$4.53 (+0.45%) |

### Half-window robustness (sim, same config)

- First half (bars 0-719): +$19.91, 4 trades
- Second half (bars 720-1439): +$4.53, 2 trades
- Profitable in both halves; no single trade carries the result
  (largest is $13.88 of $24.44).

## What was NOT verified

- The race window is unseen; the dev plateau is the only evidence. If the
  race 24h trends hard in one direction with no -1% hour, the bot may trade
  0-2 times and end near $0 (it cannot lose much while flat, but it also
  cannot win). If it trends down with repeated -1% hours and no +1% bounce,
  the -2% hard stop bounds each losing trade.
- grade-local ran with `--driver process` (Docker is not on this VM) and
  node v24.22.1; the server runs node v26.13.1 in Docker. The score notes
  this mismatch; the strategy uses only plain float64 arithmetic and the
  kit shim, so no version-sensitive behaviour is expected.
