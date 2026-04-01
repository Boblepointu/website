---
title: 'On-Chain Reputation Scoring with RANK'
description: 'How Lotusia uses burn-to-vote transactions and the RANK opcode for on-chain reputation scoring — a decentralized reputation protocol where every vote is permanent and auditable.'
linkTitle: 'Reputation (RANK)'
category: Script
weight: 4.6
modified: 2026-04-01
---

## Overview

Lotusia implements on-chain reputation scoring through the RANK protocol — a set of transaction formats that record burn-weighted votes directly on the blockchain. Every positive or negative vote is a permanent, auditable burn transaction. This makes Lotusia a decentralized reputation protocol where reputation cannot be revoked, forged, or silently modified by any central authority.

The burn-to-vote mechanism is the foundation: users destroy Lotus (XPI) to express sentiment. The amount burned is the signal. The blockchain records the vote permanently.

**Key Concepts**:

- **RANK transactions**: `OP_RETURN` outputs prefixed with the `RANK` LOKAD ID that encode vote metadata (platform, profile, post, sentiment)
- **Burn-weighted voting**: The satoshi value of a RANK output is permanently destroyed — it cannot be spent. The burn amount *is* the vote weight
- **On-chain reputation score**: The sum of all positive burns minus all negative burns for a given profile, computed directly from blockchain data
- **Sybil neutrality**: Scores aggregate total burns regardless of wallet count, making the system immune to wallet-splitting attacks

---

## RANK Transaction Format

A RANK vote is an `OP_RETURN` output with the following structure:

```
OP_RETURN <LOKAD_ID> <VERSION> <PLATFORM> <PROFILE_ID> <POST_ID> <SENTIMENT>
```

| Field | Size | Description |
|-------|------|-------------|
| LOKAD_ID | 4 bytes | `0x52414e4b` ("RANK") |
| VERSION | 1 byte | Protocol version (currently `0x01`) |
| PLATFORM | 1 byte | Platform identifier (e.g., `0x01` = Twitter/X) |
| PROFILE_ID | variable | Target profile identifier (UTF-8 encoded, length-prefixed) |
| POST_ID | variable | Optional post identifier (UTF-8 encoded, length-prefixed) |
| SENTIMENT | 1 byte | `0x01` = positive, `0x00` = negative |

### Example: Positive Vote

```typescript
import { Transaction, Output, Script } from 'lotus-sdk'

const rankOutput = new Output({
  script: Script.fromASM([
    'OP_RETURN',
    '52414e4b',           // "RANK"
    '01',                 // version 1
    '01',                 // platform: Twitter
    profileIdHex,         // target profile
    postIdHex,            // target post
    '01'                  // sentiment: positive
  ].join(' ')),
  satoshis: 10000        // 10,000 sats burned as vote weight
})

const tx = new Transaction()
  .from(utxo)
  .addOutput(rankOutput)
  .change(changeAddress)
  .sign(privateKey)
```

The 10,000 satoshis in the RANK output are permanently destroyed. This burn is what gives the vote its weight — a user burning 100,000 sats contributes ten times the signal of a user burning 10,000 sats.

---

## Score Computation

The on-chain reputation score for any profile is deterministic:

```
score = Σ(positive_burn_amounts) - Σ(negative_burn_amounts)
```

Any node with a copy of the blockchain can independently verify any profile's score by scanning all RANK transactions that reference that profile. There is no off-chain database, no API dependency, and no trust assumption.

### Indexing

The `rank-backend-ts` service indexes RANK transactions as they are confirmed:

1. Monitor new blocks for transactions containing `OP_RETURN` outputs with the `RANK` LOKAD prefix
2. Parse the platform, profile, post, and sentiment fields
3. Record the burn amount (output value) with the decoded metadata
4. Update aggregate scores per profile and per post

This index is a convenience layer — it accelerates queries but is not authoritative. The blockchain itself is the source of truth.

---

## Feed Ranking Layer

The raw on-chain score (`positive_burns - negative_burns`) is linear and transparent, but vulnerable to whale dominance and flash attacks. Lotusia applies five off-chain feed ranking algorithms on top of the on-chain data:

| Algorithm | Purpose |
|-----------|---------|
| **R62** — Logarithmic Dampening | Diminishing returns on spending via `log₂(1 + burns/BASE)` |
| **R63** — Z-Score Capping | No content scores more than 3σ above the mean |
| **R64** — Temporal Conviction | Exponential decay with 72-hour half-life rewards sustained engagement |
| **R66** — Velocity Dampening | Sigmoid penalty for abnormal burn-rate spikes |
| **R65** — Bidirectional Signal | Sentiment ratio, controversy detection, total engagement |

All five algorithms operate on aggregate burn totals only — they are Sybil-neutral by construction. Splitting the same total burn across any number of wallets produces the same feed score.

See the [ranking algorithm design](/blog/why-we-built-our-own-ranking-algorithm) for full mathematical specifications.

---

## RNKC: Ranked Comments

The RNKC extension adds on-chain comments with economic stake. Each comment transaction includes:

- **Output 0**: RNKC metadata with a minimum 1 XPI burn (serves as the initial positive vote)
- **Output 1**: Comment text (OP_RETURN)
- **Output 2**: Taproot-locked stake (refundable for legitimate content, penalizable for spam)

See [Taproot: Moderated Comments](./taproot-moderation) for the full Taproot script tree implementation.

---

## Engagement Points vs RANK

Lotusia deliberately separates two reputation dimensions:

| Dimension | Source | Purpose |
|-----------|--------|---------|
| **RANK score** | On-chain burn-weighted votes | Measures community-assessed quality |
| **Engagement Points** | Activity metrics (votes cast, referrals, streaks, account age) | Measures participation volume |

A user can have high Engagement Points (active participant) but a low RANK score (community judges their content poorly), or vice versa. Neither dimension conflates with the other.

This separation prevents the failure mode observed in [Steemit](https://en.wikipedia.org/wiki/Steemit), where a single metric (Steem Power) controlled voting influence, content rewards, and governance power simultaneously.

---

## Integration

### Reading Scores

```typescript
const response = await fetch(
  'https://lotusia.org/api/social/profile/twitter/username'
)
const profile = await response.json()

console.log('Positive burns:', profile.votesPositive)
console.log('Negative burns:', profile.votesNegative)
console.log('Net score:', profile.votesPositive - profile.votesNegative)
```

### Browsing Ranked Profiles

All indexed profiles with their on-chain reputation scores are browsable at [/social/profiles](/social/profiles). The leaderboard shows vote ratios, absolute scores, and links to individual profile activity pages.

---

## Related Documentation

- [Taproot Overview](./taproot) — P2TR consensus specification
- [Taproot: Moderated Comments](./taproot-moderation) — RNKC comment staking
- [Taproot: Time-Locked Voting](./taproot-timelock) — Time-locked vote commitments
- [Taproot: Multi-Signature Governance](./taproot-multisig) — Organizational voting

---

**Last Modified**: April 1, 2026
