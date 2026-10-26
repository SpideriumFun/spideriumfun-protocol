# Spiderium

Eight legs, one lattice.

[![Live site](https://img.shields.io/badge/live-spiderium.fun-9c8cd5?style=flat-square)](https://spiderium.fun)

**Chain:** Solana  
**Contract address:** pending

## Overview

Spiderium is a Solana project with a single-page site: a living silk lattice in the hero, a live board of the busiest Solana tokens, and a contract slot that wakes up the moment an address is stated.

## Features

- Live board of the ten Solana tokens with the most 24h volume, refreshed every minute, paused while the tab is hidden
- Ticker, pulse tiles and a focus panel fed by the same data
- Contract slot pinned to the top of the page with click-to-copy, inert until an address is stated
- Register of external facts: each is stated, absent or unconfirmed, and unstated ones stay inert
- Respects reduced-motion settings

## Links

- Site: https://spiderium.fun
- X: https://x.com/SpideriumFun
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Develop

```bash
npm run build   # writes dist/
npm run gates   # rebuilds and checks dist/
npm run serve   # static server for dist/
```

Upload the contents of `dist/` to any static host.

## License

MIT, see [LICENSE](LICENSE).
