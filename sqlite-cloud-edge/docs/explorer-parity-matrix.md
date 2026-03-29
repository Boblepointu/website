# Explorer Public Surface Parity Matrix

This matrix captures the public explorer page/API contract used for demo parity work.

## Public Pages

- `/explorer` -> demo `/explorer`
- `/explorer/blocks` -> demo `/explorer/blocks`
- `/explorer/block/:hashOrHeight` -> demo `/explorer/block/:hashOrHeight`
- `/explorer/tx/:txid` -> demo `/explorer/tx/:txid`
- `/explorer/address/:address` -> demo `/explorer/address/:address`
- `/stats` -> demo `/explorer/stats`
- `/richlist` -> demo `/explorer/richlist`
- `/network` -> demo `/explorer/network`

## API Families

- Core explorer: overview, chain-info, mempool, blocks, block detail, tx detail, address detail, address balance
- Stats parity: cards, period chart series (`day|week|month|quarter|year`)
- Richlist parity: top by balance, top by cumulative received, wealth distribution buckets
- Network parity: peers table and node line exports (`addnode`, `onetry`)

Canonical machine-readable contract: `docs/explorer-parity-matrix.json`.
