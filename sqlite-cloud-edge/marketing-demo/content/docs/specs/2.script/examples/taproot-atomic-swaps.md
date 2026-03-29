---
title: 'Taproot: Atomic Swaps'
linkTitle: 'Atomic Swaps'
category: Script
weight: 4.7
modified: 2025-10-28
---

## Overview

Cross-chain or same-chain atomic swaps using hash time-locked contracts (HTLCs) within Taproot scripts. Successful swaps via key path hide the HTLC mechanism completely, providing maximum privacy.

**Key Benefits**:

- Trustless exchange (no intermediaries)
- Privacy when swap succeeds (key path)
- Atomic: Either both parties get funds or both get refunds
- Works across different blockchains

---

## Script Tree Structure

```
Commitment
├── Left: Success path (hash preimage + signature)
└── Right: Refund path (timelock + refund key)
```

---

## Implementation

```typescript
import { Bitcore } from 'xpi-ts'

// Generate secret and hash
const secret = Buffer.from(
  'my_secret_preimage_12345678901234567890123456789012',
)
const secretHash = Bitcore.Hash.sha256(secret)

const senderKey = new Bitcore.PrivateKey()
const receiverKey = new Bitcore.PrivateKey()
const refundHeight = 102160 // current + 2,160 blocks (~3 days)

// Success path: receiver provides preimage
const successScript = new Bitcore.Script()
  .add(Bitcore.Opcode.OP_SHA256)
  .add(secretHash)
  .add(Bitcore.Opcode.OP_EQUALVERIFY)
  .add(receiverKey.publicKey.toBuffer())
  .add(Bitcore.Opcode.OP_CHECKSIG)

// Refund path: sender reclaims after timeout
const refundScript = new Bitcore.Script()
  .add(refundHeight)
  .add(Bitcore.Opcode.OP_CHECKLOCKTIMEVERIFY)
  .add(Bitcore.Opcode.OP_DROP)
  .add(senderKey.publicKey.toBuffer())
  .add(Bitcore.Opcode.OP_CHECKSIG)

const scriptTree = {
  left: { script: successScript },
  right: { script: refundScript },
}

const {
  script: htlcScript,
  merkleRoot,
  leaves,
} = Bitcore.buildScriptPathTaproot(senderKey.publicKey, scriptTree)

console.log('HTLC address:', htlcScript.toAddress().toString())
console.log('Secret hash:', secretHash.toString('hex'))
console.log('Refund height:', refundHeight)
console.log('Merkle root:', merkleRoot.toString('hex'))
console.log('Number of spending paths:', leaves.length)
```

---

## Transaction Formats

### Swap Funding Transaction

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "sender_utxo_1234567890abcdef1234567890abcdef1234567890abcdef12345678",
      "outputIndex": 0,
      "scriptSig": "483045022100...",
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "satoshis": 1000000,
      "script": "62512102def4567890abcdef1234567890abcdef1234567890abcdef1234567890ab"
    },
    {
      "satoshis": 500000,
      "script": "76a914sender_address...88ac"
    }
  ],
  "lockTime": 0
}
```

**Swap Amount**: 1,000,000 sats (1 XPI)

---

### Successful Swap (Key Path)

Both parties cooperate - best case scenario:

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "htlc_tx_id_1234567890abcdef...",
      "outputIndex": 0,
      "scriptSig": "41abc123def456789012345678901234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678",
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "satoshis": 999500,
      "script": "76a914receiver_address...88ac"
    }
  ],
  "lockTime": 0
}
```

**Input Script**: 65-byte MuSig2 signature (sender + receiver cooperate)

**Size**: ~110 bytes

**Privacy**: High - HTLC mechanism completely hidden

---

### Claim with Preimage (Script Path)

Receiver claims by revealing secret:

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "htlc_tx_id_1234567890abcdef...",
      "outputIndex": 0,
      "scriptSig": "47304402201234...0220abcd...<secret_32_bytes><success_script><control_block>",
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "satoshis": 999000,
      "script": "76a914receiver_address...88ac"
    }
  ],
  "lockTime": 0
}
```

**Input Script Breakdown**:

- ECDSA signature from receiver (~72 bytes)
- Secret preimage (32 bytes)
- Success script (~70 bytes)
- Control block (33 + merkle proof)

**Size**: ~220 bytes

**Privacy**: Medium - reveals HTLC but not refund terms

---

### Refund After Timeout (Script Path)

Sender reclaims funds after timelock expires:

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "htlc_tx_id_1234567890abcdef...",
      "outputIndex": 0,
      "scriptSig": "47304402201234...0220abcd...<refund_script><control_block>",
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "satoshis": 999000,
      "script": "76a914sender_address...88ac"
    }
  ],
  "lockTime": 102160
}
```

**Input Script Breakdown**:

- ECDSA signature from sender (~72 bytes)
- Refund script (~70 bytes)
- Control block (33 + merkle proof)

**Size**: ~210 bytes

**Privacy**: Medium - reveals timelock

**Required**: Transaction `nLockTime` must be >= refund height

---

## Atomic Swap Flow

### Cross-Chain Example (Lotus ↔ Bitcoin)

**Scenario**: Alice has 100 XPI (100,000,000 sats), Bob has 0.001 BTC. They want to swap.

**Step 1 - Setup**:

```typescript
import { Bitcore } from 'xpi-ts'

// Alice generates secret
const secret = crypto.randomBytes(32)
const secretHash = Bitcore.Hash.sha256(secret)

console.log('Secret hash:', secretHash.toString('hex'))
// Alice keeps secret, shares hash with Bob
```

**Step 2 - Alice Locks XPI**:

```typescript
import { Bitcore } from 'xpi-ts'

// Alice creates HTLC on Lotus
const aliceHTLC = buildHTLC({
  secretHash,
  receiverKey: bob.publicKey,
  senderKey: alice.publicKey,
  timeout: currentHeight + 2880, // ~4 days
})

// Alice funds HTLC
const aliceTx = fundHTLC(aliceHTLC, 100000000) // 100 XPI
```

**Step 3 - Bob Locks BTC**:

```typescript
// Bob creates matching HTLC on Bitcoin (with shorter timeout)
const bobHTLC = buildHTLC({
  secretHash, // Same hash!
  receiverKey: alice.btcPublicKey,
  senderKey: bob.btcPublicKey,
  timeout: btcHeight + 72, // ~12 hours (shorter than Alice's)
})

// Bob funds HTLC
const bobTx = fundHTLC(bobHTLC, 100000) // 0.001 BTC
```

**Step 4 - Alice Claims BTC** (reveals secret):

```typescript
// Alice claims Bob's BTC by revealing secret
const aliceClaimTx = claimHTLC(bobHTLC, secret, alice.btcKey)

// Secret is now public on Bitcoin blockchain!
```

**Step 5 - Bob Claims XPI** (using revealed secret):

```typescript
// Bob sees secret on Bitcoin blockchain
const secretFromBlockchain = extractSecretFrom(aliceClaimTx)

// Bob claims Alice's XPI
const bobClaimTx = claimHTLC(aliceHTLC, secretFromBlockchain, bob.key)

// Swap complete!
```

**Step 6 - Refund Safety**:

If anything goes wrong:

- Alice doesn't reveal secret → Both get refunds after timeouts
- Bob doesn't fund → Alice gets refund after timeout
- Bob's timeout is shorter → Alice must claim Bob's HTLC first

---

## Timing Configuration

```typescript
// Lotus blocks: ~2 minutes each
const BLOCKS_PER_HOUR = 30
const BLOCKS_PER_DAY = 720

// Cross-chain swap timing (Lotus side)
const swapLockPeriod = BLOCKS_PER_DAY * 3 // ~3 days
const safetyMargin = BLOCKS_PER_DAY // ~1 day extra
const totalLockPeriod = BLOCKS_PER_DAY * 4 // ~4 days

// Same-chain swap timing (both on Lotus)
const sameChainLock = BLOCKS_PER_DAY // ~1 day sufficient
```

**Critical**: Receiver's timelock must be shorter than sender's!

```typescript
// Cross-chain example:
const aliceLotusTimeout = 102880 // ~4 days
const bobBitcoinTimeout = btcHeight + 72 // ~12 hours

// Alice has 3+ days to claim after Bob's timeout
// This is the safety margin
```

---

## Security Considerations

### Secret Management

**DO**:

- ✅ Generate 32-byte random secret
- ✅ Keep secret private until claiming
- ✅ Use cryptographically secure randomness
- ✅ Verify hash matches before funding

**DON'T**:

- ❌ Reuse secrets across swaps
- ❌ Use predictable secrets
- ❌ Share secret before counterparty funds
- ❌ Use weak randomness

```typescript
// ❌ WRONG: Predictable secret
const badSecret = Buffer.from('password123')

// ✅ CORRECT: Cryptographically random
const goodSecret = crypto.randomBytes(32)
```

### Timeout Safety

**Rules**:

1. Receiver timeout < Sender timeout
2. Safety margin ≥ 2× expected claim time
3. Monitor both chains continuously
4. Claim as soon as counterparty funds

```typescript
// ❌ WRONG: Timeouts too close
const receiverTimeout = 1000
const senderTimeout = 1010 // Only 10 blocks! Dangerous!

// ✅ CORRECT: Adequate safety margin
const receiverTimeout = 1000
const senderTimeout = 1720 // 720 blocks (~24 hours) margin
```

### Monitoring

**Critical**: Must monitor both chains to:

- Detect when counterparty funds
- See when counterparty claims (reveals secret)
- Claim before your timeout expires
- Get refund if swap fails

```typescript
// Monitoring loop
async function monitorSwap(htlcAddress, secret, timeout) {
  while (currentHeight < timeout) {
    // Check if counterparty claimed
    const claimTx = await findClaimTransaction(htlcAddress)
    if (claimTx) {
      const revealedSecret = extractSecret(claimTx)
      if (revealedSecret) {
        // Claim on your chain!
        await claimHTLC(yourHTLC, revealedSecret, yourKey)
        return
      }
    }

    await sleep(60000) // Check every minute
  }

  // Timeout reached - get refund
  await refundHTLC(yourHTLC, yourKey)
}
```

---

## Advanced: Multi-Hop Swaps

Swap through intermediaries:

```
Alice (Lotus) → Bob (Lotus/BTC) → Carol (BTC)
```

**Same secret hash** used for all HTLCs:

```typescript
// Alice → Bob (Lotus)
const aliceBobHTLC = buildHTLC({
  secretHash,
  timeout: 104000,
})

// Bob → Carol (Bitcoin)
const bobCarolHTLC = buildHTLC({
  secretHash, // Same hash!
  timeout: btcHeight + 48, // Shorter
})

// Carol claims → Bob sees secret → Bob claims → Alice sees secret → All done!
```

---

## Use Cases

### Exchange Without Trust

Trade cryptocurrencies without centralized exchange:

```typescript
// Setup peer-to-peer swap
const swap = new AtomicSwap({
  sender: alice,
  receiver: bob,
  sendAmount: 100000000, // 100 XPI
  receiveAmount: 100000, // 0.001 BTC
  sendChain: 'lotus',
  receiveChain: 'bitcoin',
})

await swap.execute()
// Trustless! No exchange needed!
```

### OTC Trading

Over-the-counter trades with settlement assurance:

```typescript
// Large trade between institutions
const otcSwap = new AtomicSwap({
  amount: 100000000, // 100 XPI
  counterAmount: 1000000, // 0.01 BTC
  timeout: BLOCKS_PER_DAY * 7, // 1 week
})
```

### Cross-Chain DeFi

Enable DeFi applications across chains:

```typescript
// Borrow on one chain, collateral on another
const defiSwap = buildConditionalSwap({
  collateral: { chain: 'lotus', amount: 200000000 }, // 200 XPI
  loan: { chain: 'ethereum', amount: 1000 }, // 1000 USD worth
  terms: { duration: BLOCKS_PER_DAY * 30 },
})
```

---

## Testing

### Regtest Example

```typescript
import { Bitcore } from 'xpi-ts'

// Setup test swap
const testAlice = new Bitcore.PrivateKey(undefined, 'regtest')
const testBob = new Bitcore.PrivateKey(undefined, 'regtest')
const testSecret = crypto.randomBytes(32)

// Create test HTLC
const testHTLC = buildHTLC({
  secretHash: Bitcore.Hash.sha256(testSecret),
  receiverKey: testBob.publicKey,
  senderKey: testAlice.publicKey,
  timeout: 1000,
  network: 'regtest',
})

// Test claim
await testClaim(testHTLC, testSecret, testBob)

// Test refund
await testRefund(testHTLC, testAlice)
```

---

## Summary

**Benefits**:

- ✅ Trustless exchange (no intermediaries)
- ✅ Privacy via key path (~110 bytes)
- ✅ Atomic (both succeed or both fail)
- ✅ Works cross-chain
- ✅ No counterparty risk

**Trade-offs**:

- Requires both parties online
- Need to monitor blockchains
- Timelock periods (funds locked temporarily)
- More complex than simple payments

**When to Use**:

- Cross-chain exchanges
- P2P trading
- OTC settlements
- Trustless swaps

**When NOT to Use**:

- Trust counterparty (simpler to just send)
- Can't monitor blockchains
- Need instant settlement (no timelock)
- Single-chain transfers (use regular payments)

---

## Related Documentation

- [Taproot Overview](./taproot) - Technical fundamentals
- [Taproot Timelock](./taproot-timelock) - Time-locked outputs
- [Taproot Lightning](./taproot-lightning) - Payment channels

---

**Last Modified**: October 28, 2025
