---
title: 'Taproot: Lightning Network Channels'
linkTitle: 'Lightning'
category: Script
weight: 4.6
modified: 2025-10-28
---

## Overview

Taproot enables efficient Lightning Network channels with improved privacy and smaller footprint. Cooperative closes look identical to regular payments, hiding the Lightning channel structure completely.

**Key Benefits**:

- 68% smaller cooperative closes vs force closes
- Complete privacy when closing cooperatively
- Flexible spending paths (cooperative, revocation, delayed claim)
- Compatible with existing Lightning Network protocols

---

## Script Tree Structure

```
Commitment
├── Left: Cooperative close (2-of-2 multisig)
└── Right:
    ├── Left: Revocation path (penalty key)
    └── Right: Delayed claim (timelock + local key)
```

---

## Transaction Formats

### Channel Open Transaction

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "funding_tx_1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
      "outputIndex": 0,
      "scriptSig": "483045022100...",
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "satoshis": 10000000,
      "script": "62512102abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678"
    },
    {
      "satoshis": 5000000,
      "script": "76a914change_address...88ac"
    }
  ],
  "lockTime": 0
}
```

**Channel Capacity**: 10,000,000 sats (10 XPI)

---

### Cooperative Close (Key Path)

Best case: Both parties agree to close channel

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "channel_tx_id_1234567890abcdef...",
      "outputIndex": 0,
      "scriptSig": "41a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "satoshis": 6000000,
      "script": "76a914partyA_address...88ac"
    },
    {
      "satoshis": 3990000,
      "script": "76a914partyB_address...88ac"
    }
  ],
  "lockTime": 0
}
```

**Input Script**: 65-byte MuSig2 signature (both parties cooperate)

**Size**: ~110 bytes

**Privacy**: Complete - looks like regular payment

---

### Force Close (Script Path)

When cooperation fails, reveal commitment transaction

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "channel_tx_id_1234567890abcdef...",
      "outputIndex": 0,
      "scriptSig": "473044022012345678...02201234abcdef...<commitment_script><control_block>",
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "satoshis": 6000000,
      "script": "6351210344a1b2c3...OP_CSV..."
    },
    {
      "satoshis": 3980000,
      "script": "6351210355b1c2d3...OP_CSV..."
    }
  ],
  "lockTime": 0
}
```

**Input Script Breakdown**:

- ECDSA signature
- Commitment transaction script
- Control block with merkle proof

**Output Scripts**: Timelocked (OP_CHECKSEQUENCEVERIFY) for dispute period

**Size**: ~350 bytes

**Privacy**: Reveals channel structure

---

## Size Comparison

| Close Type                | Size       | Privacy | Speed   |
| ------------------------- | ---------- | ------- | ------- |
| Cooperative (Key Path)    | ~110 bytes | High    | Instant |
| Force Close (Script Path) | ~350 bytes | Low     | Delayed |

**Savings**: 68% smaller when cooperating

---

## Implementation Overview

**Note**: Full Lightning implementation is complex. This shows the Taproot aspects only.

```typescript
import {
  PrivateKey,
  Script,
  Opcode,
  buildScriptPathTaproot,
  Transaction,
} from 'lotus-sdk'

// Channel participants
const alice = new PrivateKey()
const bob = new PrivateKey()

// Create aggregated key for cooperative close (MuSig2)
const aggregatedKey = createMuSig2Key([alice.publicKey, bob.publicKey])

// Build commitment scripts
const aliceRevocation = alice.publicKey // Penalty key if Alice cheats
const bobRevocation = bob.publicKey // Penalty key if Bob cheats

// Alice's commitment transaction output
const aliceCommitment = new Script()
  .add(144) // ~4.8 hours dispute period
  .add(Opcode.OP_CHECKSEQUENCEVERIFY)
  .add(Opcode.OP_DROP)
  .add(alice.publicKey.toBuffer())
  .add(Opcode.OP_CHECKSIG)

// Bob's commitment transaction output
const bobCommitment = new Script()
  .add(144) // ~4.8 hours dispute period
  .add(Opcode.OP_CHECKSEQUENCEVERIFY)
  .add(Opcode.OP_DROP)
  .add(bob.publicKey.toBuffer())
  .add(Opcode.OP_CHECKSIG)

// Build channel script tree
const channelTree = {
  left: {
    script: buildCooperativeClose(alice.publicKey, bob.publicKey),
  },
  right: {
    left: { script: aliceCommitment },
    right: { script: bobCommitment },
  },
}

const { script: channelScript } = buildScriptPathTaproot(
  aggregatedKey,
  channelTree,
)

console.log('Channel address:', channelScript.toAddress().toString())
```

---

## Lightning Network Flow

### 1. Channel Opening

```typescript
// Alice and Bob agree on channel parameters
const capacity = 10000000 // 10 million sats
const aliceBalance = 10000000
const bobBalance = 0

// Create funding transaction
const fundingTx = new Transaction()
fundingTx.addInput(/* Alice's UTXO */)
fundingTx.addOutput(new Output({ script: channelScript, satoshis: capacity }))
fundingTx.sign(alice)

// Broadcast funding transaction
const channelId = fundingTx.id
```

### 2. Making Payments (Off-Chain)

```typescript
// Update balances off-chain (no blockchain transactions)
let aliceBalance = 10000000
let bobBalance = 0

// Alice pays Bob 1 million sats
aliceBalance -= 1000000
bobBalance += 1000000

// Create new commitment transactions (not broadcast)
// Each party holds the other's signed commitment
```

### 3. Cooperative Close

```typescript
// Final balances: Alice=6M, Bob=4M
const closeTx = new Transaction()

closeTx.addInput(
  new TaprootInput({
    prevTxId: Buffer.from(channelId, 'hex'),
    outputIndex: 0,
    output: new Output({ script: channelScript, satoshis: capacity }),
    script: new Script(),
  }),
)

closeTx.addOutput(new Output({ script: aliceAddress, satoshis: 6000000 }))
closeTx.addOutput(new Output({ script: bobAddress, satoshis: 3990000 }))

// Both parties sign with MuSig2 (key path)
const muSig = createMuSig2Signature([alice, bob], closeTx)
closeTx.applySignature(muSig)

// Broadcast - looks like regular payment!
```

### 4. Force Close (If Needed)

```typescript
// Alice broadcasts her latest commitment transaction
const forceCloseTx = alice.latestCommitmentTx

// Outputs are timelocked - Bob has dispute period to respond
// If Bob detects old commitment, he can use revocation key

// After timeout, Alice can claim her funds
```

---

## Security Considerations

### Dispute Period

```typescript
// Lotus blocks: ~2 minutes each
const DISPUTE_BLOCKS = 144 // ~4.8 hours

// Too short: Not enough time to detect cheating
const tooShort = 72 // ~2.4 hours (risky)

// Too long: Funds locked unnecessarily after force close
const tooLong = 2160 // ~3 days (inconvenient)

// Recommended: 144 blocks (~4.8 hours)
```

### Revocation Keys

**Critical**: Never reuse old commitment transactions after revoking them!

```typescript
// When creating new commitment:
1. Generate new revocation key
2. Exchange revocation keys for previous commitment
3. Now old commitment is "revoked" (penalty if broadcast)
```

**Penalty**: If Alice broadcasts revoked commitment, Bob can take ALL channel funds.

### Backup Strategy

**DO**:

- ✅ Always keep latest commitment transaction
- ✅ Monitor blockchain for channel closes
- ✅ Respond to revoked commitments within dispute period
- ✅ Use watchtowers for 24/7 monitoring

**DON'T**:

- ❌ Lose latest commitment (can't force close)
- ❌ Broadcast old revoked commitment (lose all funds)
- ❌ Go offline for longer than dispute period
- ❌ Forget to revoke old commitments

---

## Advantages Over Traditional Channels

| Feature                | Traditional P2SH | Taproot    |
| ---------------------- | ---------------- | ---------- |
| Cooperative Close Size | ~300 bytes       | ~110 bytes |
| Privacy (Cooperative)  | Low              | High       |
| Privacy (Force Close)  | Low              | Medium     |
| Script Flexibility     | Limited          | High       |

**Key Advantage**: Cooperative closes are indistinguishable from regular payments

---

## Use Cases

### Micropayments

Pay for services with instant, low-fee transactions:

```typescript
// Open channel with service provider
const serviceChannel = openChannel(user, service, 1000000) // 1M sats = 1 XPI

// Make payments off-chain
await serviceChannel.pay(1000) // Pay 1000 sats
await serviceChannel.pay(5000) // Pay 5000 sats
await serviceChannel.pay(10000) // Pay 10000 sats

// Close cooperatively after use
await serviceChannel.cooperativeClose() // ~110 bytes on-chain
```

### Payment Routing

Route payments through multiple hops:

```
Alice -> Bob -> Carol -> Dave
  |      |       |       |
10M    10M     10M     10M
```

Alice can pay Dave without direct channel!

### Streaming Payments

Pay per second/minute for streaming content:

```typescript
// Open channel with streaming service
const streamChannel = openChannel(user, netflix, 10000000) // 10 XPI

// Pay 100 sats per hour of streaming (off-chain)
setInterval(() => {
  streamChannel.pay(100)
}, 3600000) // Every hour

// Close when done watching
streamChannel.cooperativeClose()
```

---

## Testing

### Regtest Example

```typescript
import { Networks } from 'lotus-sdk'

// Create test channel
const testAlice = new PrivateKey(undefined, Networks.regtest)
const testBob = new PrivateKey(undefined, Networks.regtest)

const testChannel = await openChannel(testAlice, testBob, 1000000, {
  network: Networks.regtest,
})

// Test payments
await testChannel.pay(100000) // Alice -> Bob
await testChannel.pay(-50000) // Bob -> Alice (negative = reverse)

// Test cooperative close
await testChannel.cooperativeClose()
```

---

## Summary

**Benefits**:

- ✅ 68% smaller cooperative closes
- ✅ Complete privacy when cooperating
- ✅ Instant off-chain payments
- ✅ Low fees (only 2 on-chain txs per channel)

**Trade-offs**:

- Requires both parties online for updates
- Need to monitor for cheating attempts
- Complex state management
- Dispute period delay on force close

**When to Use**:

- Frequent payments between parties
- Micropayments
- Streaming payments
- Privacy-sensitive transactions

**When NOT to Use**:

- One-time payments ([use single-key](./taproot-single-key))
- Parties can't stay online
- Don't want state management complexity

---

## Related Documentation

- [Taproot Overview](./taproot) - Technical fundamentals
- [Taproot Multisig](./taproot-multisig) - Multiple signatures
- [Lightning Network Specification (BOLT)](https://github.com/lightning/bolts)

---

**Last Modified**: October 28, 2025
