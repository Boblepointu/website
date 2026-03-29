---
title: 'Taproot: Time-Locked Voting'
linkTitle: 'Time-Lock'
category: Script
weight: 4.3
modified: 2025-10-28
---

## Overview

Lock funds for a specific period to prevent vote manipulation. The commitment includes a time-lock script that can be revealed if needed, while key path spending hides the time-lock condition completely.

**Key Benefits**:

- Proves funds locked for voting period
- Privacy via key path spending
- Refund mechanism after time-lock expires
- Prevents double-voting manipulation

**Lock Period**: 720 blocks (~24 hours at 2 min/block)

::alert{type="warning"}
**RANK Protocol Requirement**: RANK transactions MUST have output 0 with value ≥ 1,000,000 satoshis (1 XPI). The burned amount in output 0 determines the vote weight. See the [real transaction example](https://lotusia.org/api/explorer/tx/aae24fa85b927393fd23db45c0bb5a5b245ea626c64ee64bb05aa76f3162dad7).
::

---

## Script Tree Structure

```
Commitment
└── Time-lock script: <height> OP_CHECKLOCKTIMEVERIFY OP_DROP <pubkey> OP_CHECKSIG
```

---

## Implementation

```typescript
import { Bitcore } from 'xpi-ts'

// Generate voter's key
const voterKey = new Bitcore.PrivateKey()
const currentHeight = 1000000 // Example current block height
const unlockHeight = currentHeight + 720 // ~24 hours at 2 min/block

console.log('Voter public key:', voterKey.publicKey.toString())
console.log('Current height:', currentHeight)
console.log('Unlock height:', unlockHeight)

// Create time-lock script: <height> OP_CHECKLOCKTIMEVERIFY OP_DROP <pubkey> OP_CHECKSIG
const timelockScript = new Bitcore.Script()
  .add(Buffer.from(unlockHeight.toString(16).padStart(6, '0'), 'hex'))
  .add(Bitcore.Opcode.OP_CHECKLOCKTIMEVERIFY)
  .add(Bitcore.Opcode.OP_DROP)
  .add(voterKey.publicKey.toBuffer())
  .add(Bitcore.Opcode.OP_CHECKSIG)

console.log('Time-lock script:')
console.log('  Unlock height:', unlockHeight)
console.log('  Script:', timelockScript.toASM())
console.log('  Script hex:', timelockScript.toHex())

// Build Taproot with script tree
const scriptTree = {
  script: timelockScript,
}

const tapResult = Bitcore.buildScriptPathTaproot(voterKey.publicKey, scriptTree)

// Create Taproot address for the vote commitment
const taprootAddress = Bitcore.Address.fromTaprootCommitment(
  tapResult.commitment,
  'livenet',
)

console.log('Vote commitment address:', taprootAddress.toString())
console.log('XAddress:', taprootAddress.toXAddress())
console.log('Merkle root:', tapResult.merkleRoot.toString('hex'))
console.log('Number of leaves:', tapResult.leaves.length)
```

**Creating the Vote Transaction**:

```typescript
import { Transaction, Output, Script, UnspentOutput } from 'lotus-sdk'

// Create RANK output (minimum 1 XPI, recommended 10+ XPI for meaningful vote)
// Note: toScriptRANK would be imported from the RANK module
function toScriptRANK(
  sentiment: string,
  platform: string,
  profileId: string,
): Buffer {
  // Simplified RANK script for demonstration
  return Buffer.from(
    '6a0452414e4b5101011000766f746572757365726e616d6531081b858cf93dda30ab',
    'hex',
  )
}

const rankScript = toScriptRANK('positive', 'twitter', 'LotusProtocol')

// Create dummy funding UTXO
const dummyUtxo = {
  txId: 'a'.repeat(64),
  outputIndex: 0,
  script: Script.buildPublicKeyHashOut(voterKey.publicKey),
  satoshis: 50000,
  address: voterKey.toAddress(),
}

const voteTx = new Transaction()
  .from(new UnspentOutput(dummyUtxo))
  .addOutput(
    new Output({
      script: Script.fromBuffer(rankScript),
      satoshis: 0, // OP_RETURN output (RANK metadata)
    }),
  )
  .to(taprootAddress, 10000) // 0.01 XPI locked in Taproot
  .change(voterKey.toAddress())
  .sign(voterKey)

console.log('Vote transaction created!')
console.log('  TX ID:', voteTx.id)
console.log('  Inputs:', voteTx.inputs.length)
console.log('  Outputs:', voteTx.outputs.length)
console.log('    Output 0: OP_RETURN (RANK vote, 0 sats)')
console.log('    Output 1: Taproot commitment (', 10000, 'sats)')
console.log('    Output 2: Change (', voteTx.outputs[2]?.satoshis || 0, 'sats)')
console.log('  Fully signed:', voteTx.isFullySigned())
```

---

## Vote Transaction Format

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
      "outputIndex": 0,
      "scriptSig": "47304402...",
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "satoshis": 10000000,
      "script": "6a0452414e4b5101011000766f746572757365726e616d6531081b858cf93dda30ab"
    },
    {
      "satoshis": 100000,
      "script": "62512103f847d47cbfe409c2594e121521e0b2838e6d9cf9bac1af030b4dde277bd788f6"
    },
    {
      "satoshis": 79890000,
      "script": "76a914voter_address...88ac"
    }
  ],
  "lockTime": 0
}
```

**Output Breakdown**:

- Output 0: OP_RETURN with RANK vote (10,000,000 sats = 10 XPI burned)
  - `6a` = OP_RETURN
  - `04 52414e4b` = "RANK" LOKAD prefix
  - `51` = Sentiment (positive, 0x51 = OP_TRUE)
  - `01` = Platform (0x01 = Twitter/X)
  - `01 10 00766f746572...` = Profile ID "voterusername1" (16 bytes padded)
  - `08 1b858cf9...` = Post ID (8 bytes)
- Output 1: Taproot P2TR with time-lock commitment (100,000 sats = 0.1 XPI)
- Output 2: Change back to voter (79,890,000 sats = 79.89 XPI)

---

## Spending Options

### Option 1: Key Path (Anytime, Private)

Recommended for normal spending after voting:

```typescript
// Create transaction spending the vote escrow
const spendTx = new Transaction()

spendTx.addInput(
  new TaprootInput({
    prevTxId: Buffer.from(voteTxId, 'hex'),
    outputIndex: 1, // The Taproot output
    output: new Output({
      script: taprootScript,
      satoshis: 10000,
    }),
    script: new Script(),
  }),
)

spendTx.addOutput(
  new Output({
    script: Script.buildPublicKeyHashOut(voterAddress),
    satoshis: 95000, // 5,000 sat fee (0.005 XPI)
  }),
)

// Sign with key path (hides time-lock completely)
spendTx.sign(
  voterKey,
  Signature.SIGHASH_ALL | Signature.SIGHASH_LOTUS,
  'schnorr',
)

console.log('Key path spend size:', spendTx.serialize().length / 2, 'bytes')
// Result: ~110 bytes, no script revealed
```

### Option 2: Script Path (After Lock Expires, Reveals Time-Lock)

Only needed if key path fails or for demonstration:

```typescript
import { createControlBlock } from 'lotus-sdk'

// Wait until block height >= unlockHeight
const currentHeight = 1000720 // Assume time has passed
if (currentHeight < unlockHeight) {
  throw new Error(`Must wait until block ${unlockHeight}`)
}

console.log('Current height:', currentHeight)
console.log('Unlock height:', unlockHeight)
console.log('Time-lock expired:', currentHeight >= unlockHeight)

// Create control block for script path spending
const controlBlock = createControlBlock(voterKey.publicKey, 0, scriptTree)

console.log('Control block created:')
console.log('  Size:', controlBlock.length, 'bytes')
console.log('  Merkle proof nodes:', tapResult.leaves[0].merklePath.length)

// For script path spending, you would create a transaction with:
// 1. nLockTime set to unlockHeight or higher
// 2. Input script: <signature> <script> <control_block>
// 3. Sign the transaction with the revealed script

// Example of what the input script stack would look like:
// Stack: [<signature>] [<revealed_timelock_script>] [<control_block>]

// This is more complex - see full example in lotus-sdk/examples/taproot-example.ts
console.log('\nScript path spending would reveal:')
console.log('  - The time-lock script')
console.log('  - Control block with merkle proof')
console.log('  - Transaction size: ~220 bytes (larger than key path)')
```

---

## Transaction Sizes

| Spending Method | Size       | Privacy | Notes              |
| --------------- | ---------- | ------- | ------------------ |
| Key Path        | ~110 bytes | High    | Time-lock hidden   |
| Script Path     | ~220 bytes | Medium  | Time-lock revealed |

**Recommendation**: Always use key path when possible for privacy and efficiency.

---

## Use Case: RANK Voting

**Scenario**: Voter wants to vote on a RANK proposal and prove funds were locked during voting period.

**Process**:

1. Create time-locked Taproot address (720 blocks)
2. Send vote TX with 10 XPI burned in RANK output (output 0)
3. Lock additional 0.1 XPI in Taproot time-lock (output 1)
4. Vote weight = 10 XPI (from burned amount in output 0)
5. After 720 blocks, reclaim 0.1 XPI from Taproot via key path
6. Time-lock never revealed on-chain (if using key path)

**Why Time-Lock?**:

- Prevents vote manipulation (can't double-spend vote weight)
- Proves commitment to vote
- Funds returned after voting period
- Privacy maintained via key path

---

## Security Considerations

### Time-Lock Calculation

```typescript
// Lotus blocks: ~2 minutes each
const BLOCKS_PER_HOUR = 30
const BLOCKS_PER_DAY = 720
const BLOCKS_PER_WEEK = 5040

// Common lock periods
const oneDayLock = currentHeight + BLOCKS_PER_DAY
const oneWeekLock = currentHeight + BLOCKS_PER_WEEK
```

**Always verify**:

- Current block height is accurate
- Lock duration matches intended time
- Transaction nLockTime field set correctly (for script path)

### Key Management

- ✅ Keep private key secure (controls both spending paths)
- ✅ Record unlock height for script path fallback
- ✅ Monitor block height if time-sensitive
- ❌ Don't lose key (funds locked until height reached)

### Common Mistakes

```typescript
// ❌ WRONG: Using Bitcoin block times (10 min)
const wrongLock = currentHeight + 144 // Only ~4.8 hours on Lotus!

// ✅ CORRECT: Using Lotus block times (2 min)
const correctLock = currentHeight + 720 // ~24 hours on Lotus

// ❌ WRONG: Forgetting nLockTime for script path
tx.nLockTime = 0 // Script path will fail!

// ✅ CORRECT: Setting nLockTime for script path
tx.nLockTime = unlockHeight // Required for CHECKLOCKTIMEVERIFY
```

---

## Advanced: Multiple Time-Locks

Different unlock periods for different conditions:

```typescript
// Early unlock (1 day) with penalty
const earlyUnlockScript = new Script()
  .add(currentHeight + 720)
  .add(Opcode.OP_CHECKLOCKTIMEVERIFY)
  .add(Opcode.OP_DROP)
  .add(earlyKey.publicKey.toBuffer())
  .add(Opcode.OP_CHECKSIG)

// Full refund (1 week)
const fullRefundScript = new Script()
  .add(currentHeight + 5040)
  .add(Opcode.OP_CHECKLOCKTIMEVERIFY)
  .add(Opcode.OP_DROP)
  .add(voterKey.publicKey.toBuffer())
  .add(Opcode.OP_CHECKSIG)

// Build tree with both options
const tree = {
  left: { script: earlyUnlockScript },
  right: { script: fullRefundScript },
}

const { script } = buildScriptPathTaproot(voterKey.publicKey, tree)
```

---

## Related Documentation

- [Taproot Overview](../taproot) - Technical fundamentals
- [Taproot Single-Key](./taproot-single-key) - Simple payments
- [Taproot Moderation](./taproot-moderation) - Stakeable comments

---

**Last Modified**: October 28, 2025
