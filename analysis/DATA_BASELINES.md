# Dev-window data + baselines — btc-race-24h-20261117-0603

Worker A (data + baselines). Sources: kit `dataset/bars/CBBTC.ndjson.gz`
(1,440 bars, re-derived by `grade-local` from 42,798 pool-state samples) and
`RULES.txt`. All baseline grades below are local `grade-local` runs with
`--driver process` (Docker is not on this VM), Node v24.22.1; the server
harness runs Node v26.13.1, so the `result_sha256` values here will not equal
the server's. Every run's L1 regrade reproduced byte for byte.

Protocol reminder (from RULES.txt): the harness sends one `hello` (universe,
capital, caps, fees, phase seed), then one `batch` per minute — each batch
carries the bar that just closed, the fills of the `orders` sent on the
previous batch, and the account — and the bot answers every batch with exactly
one reply echoing its seq. An order decided on the batch of the bar closing at
minute t fills at the open of the next bar. A full-size round trip costs about
26 bps (4 bps fee each way + 2 bps modelled slippage each way + price impact
against the bar's open depth, ~7–13 bps per side at the depths seen here).

## 1. Dev-window characterization

Window: 2026-11-16T06:03Z → 2026-11-17T06:03Z (24 h, bars 06:04–06:04 UTC;
first bar covers 06:03–06:04). One symbol, CBBTC (cbBTC/USDC, Orca Whirlpool).
Characterization script: `analysis/characterize.mjs` (stdlib only).

| Stat | Value |
|---|---|
| Bars | 1,440 (all minutes present) |
| Missing minutes | 0 (rejection threshold is >28) |
| Open (first bar) | $64,433.84 |
| Close (last bar) | $64,775.95 |
| Total return, open → close | **+0.531%** (+$5.31 on $1,000 before costs) |
| Intraday high / low | $65,609.83 / $63,874.36 |
| High–low range | **2.693%** of open ($1,735.47) |
| 1-min log-return SD | 6.44 bps |
| 1-min log-return mean | +0.034 bps |
| Hourly log-return SD (23 non-overlapping hours) | 49.61 bps |
| Up / down / zero 1-min bars | 613 / 710 / 116 (up share 42.6%) |
| Flat bars (o == h == l == c) | 141 (**9.79%**) |
| Max drawdown, close-to-close | −2.119% |
| Max run-up, close-to-close | +2.493% |
| Best 60-min return | +1.964% (window ending 14:58 UTC 16 Nov) |
| Worst 60-min return | −2.060% (window ending 15:38 UTC 16 Nov) |
| Gross absolute 1-min movement (sum \|log-ret\|) | 61.65% |
| Drift share of gross movement | 0.009 (net drift is <1% of total wiggle) |

Hourly returns (%): +0.45, +0.03, −0.65, −0.06, +0.39, −0.39, −0.19, −0.20,
+1.21, −0.53, +0.57, −0.13, +0.19, +0.17, −0.04, +0.72, −0.39, −0.67, −0.37,
+0.40, −0.53, +0.75, −0.15. No hour moved more than 1.21%; 13 of 23 hours were
positive, 10 negative — the day chopped sideways around a small net gain.

## 2. Baseline grades (dev window, local, process driver)

| Baseline | Net PnL (USDC) | Trades | Max DD | Fees (USDC) | House / extra | Result sha256 |
|---|---|---|---|---|---|---|
| buy-and-hold | **+1.067187** | 1 | 2.119% | 0.801 | house | `fa18a70fa2c63af774b800809f15e6b429ee0e6520dd4ec28516008cb44fb401` |
| hold-cash | 0.000000 | 0 | 0.000% | 0.000 | house | `dff2d7371d4232b8a0dff3597d0f4aeafc216a3f1e19afb94e9e712e15ac6bb6` |
| momentum | **+2.445627** | 1 | 2.119% | 0.801 | house | `29b0e2676d53e911def7667e383af61c9ba2ff10fc6c5fa5fc0d1125edebc9f7` |
| ema-cross | −106.214838 | 68 | 10.958% | 25.737 | house | `b762990618d870d73a524679ffa8c4e377ff601ed887f31df5d25da3b31de0fa` |
| adx-momentum | −32.655586 | 26 | 3.601% | 10.262 | extra | `b043694e6adb287052c26847de2a52707005db3550a8faa4e185d2a56a688f05` |
| rsi-bollinger | −24.252523 | 11 | 2.789% | 4.753 | extra | `7e5e8c92768f0933c263c636ea843cf58823671ca0ed2c5df83564e83ca7f677` |

All six runs: status `finished`, 0 rejected orders, L1 regrade reproduced byte
for byte. Guardrails met for all except hold-cash (0 trades < 1 required).

What each bot does:

- **buy-and-hold** (house): spends all cash on CBBTC on the first batch and
  holds to the end; 1 trade. Net +$1.07 — the raw +0.53% drift (≈ +$5.31)
  minus the ~26 bps round trip and the buy filling at the second bar's open.
- **hold-cash** (house): never sends orders; net PnL exactly 0 on every
  window, fails the dev gate (needs > 0) and the ≥1-trade guardrail.
- **momentum** (house): buys the asset with the best trailing 24-bar return,
  rebalanced every 24 bars; on one asset it buys on batch 24 and holds.
  Bought at the bar-26 open ($64,356.01, below buy-and-hold's fill), so it
  kept more of the drift: net +$2.45.
- **ema-cross** (house): buys when EMA(8) crosses above EMA(21), sells on the
  cross back, +50% take-profit or −20% stop. Whipsawed 68 times in the chop:
  −$106.21, worst baseline by far, fees alone $25.74.
- **adx-momentum** (extra, not a house entry): buys only when ADX(14) > 25
  with the leading DI(25) confirming trend, +1% take-profit / −25% stop.
  26 trades, −$32.66 — trend filter still fired repeatedly in chop.
- **rsi-bollinger** (extra, not a house entry): buys RSI(14) < 30 near the
  lower Bollinger band (20 bars, 2σ), sells RSI > 70, +10% take-profit /
  −25% stop. 11 trades, −$24.25 — mean-reversion entries caught falling
  knives more often than bounces.

## 3. Interpretation — what the dev window rewards

**The bar to beat is momentum's +$2.45, not buy-and-hold's +$1.07.** Both
house bots are trivially beatable in principle — they are just "be long for
most of the day" — but they set the practical floor: any entry that trades
actively must clear +$2.45 on the dev window to be better than the dumbest
long-only timing, and must clear $0 to race at all. Note the house bots race
whatever their dev grade made, so ema-cross (−$106.21) still races; our entry
does not get that exemption. The extra baselines (adx-momentum, rsi-bollinger)
are not house entries and take no leaderboard slot — they are only reference
points, and both lost money.

**The dev window rewards being long and doing almost nothing — it is a chop
window with a small upward drift, not a trend window.** Net drift (+0.53%)
is 0.9% of gross movement (61.65% of absolute 1-minute wiggle): the price
spent the day oscillating inside a 2.69% high–low band, with the best and
worst hours (+1.21% / −0.67%) nearly cancelling and the largest single-hour
move barely over 1%. There was no sustained trend to ride: the max run-up
(+2.49%) and max drawdown (−2.12%) are nearly symmetric, and up-bars were a
minority (42.6%). Every active strategy lost: the faster the signal, the
worse the result — ema-cross (68 trades, −$106), adx-momentum (26, −$33),
rsi-bollinger (11, −$24). The ranking of outcomes is almost perfectly
monotone in trade count, which is the signature of a market where each trade
pays ~26 bps of round-trip cost to capture moves that mostly reverse within
the hour.

**Cost arithmetic is the whole game at this scale.** A full-size round trip
costs ~26 bps ≈ $2.60 on $1,000: fees $0.80 plus slippage/impact ~$1.80
against ~$800k open depth (deeper than the frozen $1.38M would suggest, so
impact ran ~12 bps/side, not ~7). Buy-and-hold's reconciliation makes this
concrete: raw drift +$5.31, minus buy/sell fees $0.80, minus slippage +
impact ≈ $3.44, = +$1.07 net. In other words the entire day's drift is only
~2× one round trip. Any strategy that trades more than ~2–4 times must
therefore extract a genuine edge per trade of >26 bps net of reversal — the
dev window shows no 1-hour move large enough to offer that more than once or
twice, and the best 60-minute window (+1.96%) is immediately followed by the
worst (−2.06% ending 40 minutes later), so chasing it would have given the
money back.

**Implications for sizing and holding (for the strategy worker):**

- **Hold, don't trade.** The winning shape is: enter once (or at most
  twice), at full size, and hold to the end. Partial sizing only dilutes the
  drift capture without reducing the per-trade cost rate; splitting an order
  across replies at the same open never pays less (each fill moves the same
  pool), so one full-size order beats scaled entries.
- **Entry timing is the only real decision.** Momentum beat buy-and-hold by
  $1.38 purely by filling ~25 minutes later at $64,356 vs ~$64,477 — a
  0.19% better entry on a day whose total drift was 0.53%. A rule that waits
  out the first dip (or enters on a small pullback / after a down-hour)
  instead of buying the first batch is worth more than any exit rule. But
  beware overfitting: the "buy after the early dip" edge is one observation
  on one day.
- **Exits must be rare and wide.** Any take-profit tighter than ~1% or any
  stop tighter than ~2% will fire on noise (hourly SD is ~50 bps, daily
  range 269 bps) and hand back the drift in costs. The final sale at the
  last close is free in the sense that it is forced — do not add a voluntary
  exit near the end.
- **Mean reversion and fast trend signals are traps here.** RSI/Bollinger
  mean reversion lost $24 on 11 trades; ADX trend-confirmation lost $33 on
  26; EMA-cross lost $106 on 68. The dev window punishes signal frequency,
  not signal quality — a slower version of any of these (hours, not minutes)
  is the only variant worth testing, and only if it trades ≤2–3 times.
- **Drawdown is not the binding constraint.** Worst close-to-close drawdown
  was 2.12% and even the worst baseline (ema-cross) peaked at 10.96% — all
  far under the 25% guardrail. Sizing for drawdown is unnecessary; size for
  cost efficiency instead (i.e. full size, few trades).
- **Do not extrapolate the dev window to the race window.** The dev window's
  lesson is "chop + small up-drift, costs dominate". The race window is a
  different 24 hours nobody has seen; it could trend hard either way. A bot
  that is just "buy and hold" passes the dev gate (+$1.07) but is fully
  exposed if the race window falls 2–3%. The robust shape is therefore:
  long-biased, 1–2 trades, full size — plus a genuinely wide disaster exit
  (several percent, not basis points) that only fires on a race-window-sized
  move, accepting that it costs the dev gate nothing if it never fires.
