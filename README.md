# btc-race-24h-20261117-0603

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/Gustronger/btc-race-24h-20261117-0603/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/Gustronger/btc-race-24h-20261117-0603/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC minute by minute on paper
money ($1,000 start, long only), racing live for 24 hours. It reads 1-minute Orca
Whirlpool bars and answers with buy/sell orders under the agent-fun/bars-replay/v1
protocol. Simulation only — no real money is traded.

## Strategy

Trend + mean-reversion hybrid on 1-minute closes (see `STRATEGY.md`):

- A slow trend filter (EMA cross) decides the direction; entries only with the trend.
- A Bollinger/RSI mean-reversion trigger times the entry inside the trend.
- Volatility-scaled position sizing, full position only on strong signals; exits on
  trend reversal, a trailing stop, or a take-profit.
- Every trade must clear the ~26 bps round-trip cost (4 bps fee + 2 bps slippage +
  price impact), so the bot trades hours-long moves, not minute noise.
- Deterministic: seeded only from `hello.seed`, no wall clock, no network.

## Grade it locally

```sh
node cli/makefun.mjs grade-local --kit <kit-dir> --bot <repo-dir> --driver process
```

## Layout

- `main.ts` — the bot (entrypoint).
- `vendor/makefun-bars.ts` — the kit's SDK shim, byte-for-byte (excluded from authorship counts).
- `STRATEGY.md` — the strategy, tuning, and backtest numbers.
- `LICENSE` — MIT.
