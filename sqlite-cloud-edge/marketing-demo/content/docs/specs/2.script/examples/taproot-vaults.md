---
title: 'Taproot: Vaults and Cold Storage'
linkTitle: 'Vaults'
category: Script
weight: 4.8
modified: 2025-10-28
---

## Overview

Create spending restrictions and delayed withdrawal mechanisms for enhanced security. Vaults provide multi-tier access with hot wallets for daily spending and cold storage with time delays for large withdrawals.

**Key Benefits**:

- Hot wallet for convenient small withdrawals
- Cold storage with 30-day delay for security
- Emergency freeze to prevent theft
- Privacy via key path for hot wallet

**Withdrawal Delay**: 21,600 blocks (~30 days at 2 min/block)

---

## Script Tree Structure

```
Commitment
├── Left: Hot wallet (immediate)
└── Right:
    ├── Left: Delayed withdrawal (30 days + cold key)
    └── Right: Emergency freeze (burn key)
```

---

## Implementation

```typescript
import { Bitcore } from 'xpi-ts'

// Create keys
const hotWalletKey = new Bitcore.PrivateKey()
const coldStorageKey = new Bitcore.PrivateKey()
const emergencyKey = new Bitcore.PrivateKey()

const withdrawalDelay = 121600 // current + 21,600 (~30 days)

// Script 1: Hot wallet (immediate spending)
const hotWalletScript = new Bitcore.Script()
  .add(hotWalletKey.publicKey.toBuffer())
  .add(Bitcore.Opcode.OP_CHECKSIG)

// Script 2: Cold storage with time delay
const coldStorageScript = new Bitcore.Script()
  .add(withdrawalDelay)
  .add(Bitcore.Opcode.OP_CHECKLOCKTIMEVERIFY)
  .add(Bitcore.Opcode.OP_DROP)
  .add(coldStorageKey.publicKey.toBuffer())
  .add(Bitcore.Opcode.OP_CHECKSIG)

// Script 3: Emergency freeze (provably unspendable)
const freezeScript = new Bitcore.Script().add(Bitcore.Opcode.OP_RETURN)

const scriptTree = {
  left: { script: hotWalletScript },
  right: {
    left: { script: coldStorageScript },
    right: { script: freezeScript },
  },
}

const {
  script: vaultScript,
  merkleRoot,
  leaves,
} = Bitcore.buildScriptPathTaproot(hotWalletKey.publicKey, scriptTree)

console.log('Vault address:', vaultScript.toAddress().toString())
console.log('Merkle root:', merkleRoot.toString('hex'))
console.log('Number of leaves:', leaves.length)
```

---

## Transaction Formats

### Vault Deposit Transaction

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "funding_source_1234567890abcdef1234567890abcdef1234567890abcdef12345678",
      "outputIndex": 0,
      "scriptSig": "483045022100...",
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "satoshis": 50000000,
      "script": "62512102vault_commitment_1234567890abcdef1234567890abcdef1234567890ab"
    },
    {
      "satoshis": 1000000,
      "script": "76a914change_address...88ac"
    }
  ],
  "lockTime": 0
}
```

**Vault Balance**: 50,000,000 sats (50 XPI)

---

### Hot Wallet Withdrawal (Key Path)

Small, frequent withdrawals with maximum privacy:

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "vault_tx_id_1234567890abcdef...",
      "outputIndex": 0,
      "scriptSig": "41abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "satoshis": 100000,
      "script": "76a914recipient_address...88ac"
    },
    {
      "satoshis": 49890000,
      "script": "76a914vault_return...88ac"
    }
  ],
  "lockTime": 0
}
```

**Input Script**: 65-byte Schnorr signature (hot wallet key)

**Size**: ~110 bytes

**Privacy**: High - vault structure hidden

**Use Case**: Daily spending, small purchases

---

### Cold Storage Withdrawal (Script Path)

Large withdrawals with 30-day security delay:

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "vault_tx_id_1234567890abcdef...",
      "outputIndex": 0,
      "scriptSig": "473044022012345678...0220abcdef...<cold_storage_script><control_block>",
      "sequence": 4294967295
    }
  ],
  "outputs": [
    {
      "satoshis": 49800000,
      "script": "76a914cold_storage_destination...88ac"
    }
  ],
  "lockTime": 121600
}
```

**Input Script Breakdown**:

- ECDSA signature from cold key (~72 bytes)
- Cold storage script with timelock (~70 bytes)
- Control block (33 + merkle proof)

**Size**: ~230 bytes

**Privacy**: Medium - reveals timelock

**Use Case**: Large withdrawals, long-term savings

**Required**: Must wait until block height ≥ 121600

---

### Emergency Freeze (Burn Path)

Prevent theft by making funds unspendable:

**JSON**:

```json
{
  "version": 2,
  "inputs": [
    {
      "prevTxId": "vault_tx_id_1234567890abcdef...",
      "outputIndex": 0,
      "scriptSig": "01<freeze_script><control_block>",
      "sequence": 4294967295
    }
  ],
  "outputs": [],
  "lockTime": 0
}
```

**Input Script Breakdown**:

- Empty signature data
- OP_RETURN freeze script
- Control block proving script in tree

**Result**: Funds permanently unspendable (burned)

**Use Case**: Emergency response if keys compromised

**Warning**: This is irreversible! Funds are lost forever!

---

## Vault Strategies

### Conservative (Maximum Security)

```typescript
// Hot wallet: 0.1 XPI daily limit
// Cold storage: 60-day delay
// No emergency freeze (too risky)

const hotLimit = 100000 // 0.1 XPI
const coldDelay = 43200 // ~60 days
```

### Balanced (Recommended)

```typescript
// Hot wallet: 1 XPI weekly limit
// Cold storage: 30-day delay
// Emergency freeze available

const hotLimit = 1000000 // 1 XPI
const coldDelay = 21600 // ~30 days
```

### Aggressive (Convenience)

```typescript
// Hot wallet: 10 XPI limit
// Cold storage: 7-day delay
// Emergency freeze available

const hotLimit = 10000000 // 10 XPI
const coldDelay = 5040 // ~7 days
```

---

## Security Considerations

### Key Storage

**Hot Wallet Key**:

- Online/convenient access
- Lower security acceptable
- Only controls small amounts
- Can be phone/desktop wallet

**Cold Storage Key**:

- Offline hardware wallet
- Maximum security required
- Controls full vault
- Never connected to internet

**Emergency Key**:

- Secure but accessible
- For crisis situations only
- Consider multisig (require 2+ parties)

### Amount Limits

```typescript
// Note: Script can't enforce limits without OP_CHECKTEMPLATEVERIFY
// Must be enforced in application logic

function enforceHotWalletLimit(amount: number) {
  const HOT_WALLET_LIMIT = 1000000 // 1 XPI

  if (amount > HOT_WALLET_LIMIT) {
    throw new Error(
      `Amount ${amount} exceeds hot wallet limit ${HOT_WALLET_LIMIT}`,
    )
  }

  // Use hot wallet key path
  return signWithHotWallet(amount)
}

function largWithdrawal(amount: number) {
  // Always use cold storage for large amounts
  return signWithColdStorage(amount)
}
```

### Timelock Safety

```typescript
// Too short: Not enough time to detect/prevent unauthorized withdrawal
const tooShort = 720 // ~1 day (risky for large amounts)

// Too long: Inconvenient for legitimate large withdrawals
const tooLong = 52560 // ~73 days (very inconvenient)

// Recommended: 30 days
const recommended = 21600 // ~30 days (balanced)
```

**Considerations**:

- Larger amounts → longer delays
- Higher security needs → longer delays
- User convenience ↔ security trade-off

---

## Monitoring and Alerts

### Watch for Unauthorized Withdrawals

```typescript
// Monitor vault address for transactions
async function monitorVault(vaultAddress: string, alertCallback: Function) {
  const watcher = new AddressWatcher(vaultAddress)

  watcher.on('transaction', async tx => {
    // Check if it's a cold storage withdrawal
    if (isTimelockedWithdrawal(tx)) {
      const unlockHeight = extractUnlockHeight(tx)
      const blocksUntilUnlock = unlockHeight - currentHeight

      if (blocksUntilUnlock > 0) {
        // Alert: Someone initiated cold storage withdrawal!
        alertCallback({
          type: 'cold_storage_withdrawal',
          amount: tx.outputs[0].satoshis,
          unlockHeight,
          timeRemaining: blocksUntilUnlock * 2, // minutes
        })
      }
    }

    // Check for emergency freeze
    if (isFreezeTransaction(tx)) {
      alertCallback({
        type: 'emergency_freeze',
        message: 'Vault has been frozen!',
      })
    }
  })
}
```

### Emergency Response

```typescript
// If unauthorized cold storage withdrawal detected:
async function emergencyResponse(vaultUTXO) {
  // Option 1: Use hot wallet to move funds quickly
  const quickMoveTx = spendViaHotWallet(vaultUTXO, secureAddress)
  await broadcast(quickMoveTx)

  // Option 2: Freeze vault if compromise suspected
  const freezeTx = executeEmergencyFreeze(vaultUTXO, emergencyKey)
  await broadcast(freezeTx)

  // Funds now safe (either moved or frozen)
}
```

---

## Advanced: Dynamic Vaults

Vault that can adjust limits without creating new addresses:

```typescript
// Use state parameter to track spending limits
const stateBuffer = encodeVaultState({
  hotWalletLimit: 1000000,
  withdrawalDelay: 21600,
  lastWithdrawal: currentHeight,
})

// Create vault with state
const vaultWithState = buildPayToTaproot(commitment, stateBuffer)

// State is visible on-chain and updated with each spend
// Enables dynamic limits and rate limiting
```

---

## Use Cases

### Personal Savings

Long-term holdings with occasional access:

```typescript
// Most funds in cold storage
// Small amount in hot wallet for emergencies
const savingsVault = buildVault({
  hotWalletLimit: 500000, // 0.5 XPI
  coldDelay: 21600, // 30 days
})
```

### Business Treasury

Company funds with multiple access levels:

```typescript
// Daily operations: Hot wallet (CEO)
// Large payments: Cold storage with delay (CFO)
// Emergency: Freeze capability (Security team)

const treasuryVault = buildVault({
  hotWalletKey: ceo.publicKey,
  coldStorageKey: cfo.publicKey,
  emergencyKeys: [security1.publicKey, security2.publicKey], // 2-of-2
})
```

### Exchange Cold Storage

Cryptocurrency exchange secure storage:

```typescript
// Hot wallet: 2% of funds (customer withdrawals)
// Cold storage: 98% of funds (security)
// Multiple signers for cold storage

const exchangeVault = buildEnterpriseVault({
  hotWalletKeys: [operator1, operator2], // 2-of-3 multisig
  coldStorageKeys: [security1, security2, security3, auditor], // 3-of-4
  delay: 43200, // 60 days for large amounts
})
```

---

## Testing

### Regtest Example

```typescript
import { Networks } from 'lotus-sdk'

// Create test vault
const testHot = new PrivateKey(undefined, Networks.regtest)
const testCold = new PrivateKey(undefined, Networks.regtest)

const testVault = buildVault({
  hotWallet: testHot.publicKey,
  coldStorage: testCold.publicKey,
  delay: 100, // Short delay for testing
  network: Networks.regtest,
})

// Test hot wallet withdrawal
await testHotWithdrawal(testVault, testHot)

// Test cold storage (mine 100 blocks first)
await mineBlocks(100)
await testColdWithdrawal(testVault, testCold)
```

---

## Summary

**Benefits**:

- ✅ Multi-tier security (hot/cold separation)
- ✅ Privacy for daily spending (key path)
- ✅ 30-day security delay for large amounts
- ✅ Emergency freeze capability
- ✅ Flexible configuration

**Trade-offs**:

- Hot wallet has immediate access (security risk)
- Cold storage delay inconvenient for urgent needs
- Emergency freeze is irreversible
- More complex to implement

**When to Use**:

- Large holdings requiring security
- Mix of frequent and infrequent access
- Need emergency response capability
- Security priority over convenience

**When NOT to Use**:

- Small amounts (not worth complexity)
- Need frequent large withdrawals
- Can't manage multiple keys
- Risk of accidental freeze

---

## Related Documentation

- [Taproot Overview](./taproot) - Technical fundamentals
- [Taproot Timelock](./taproot-timelock) - Time-locked outputs
- [Taproot Multisig](./taproot-multisig) - Multiple signatures

---

**Last Modified**: October 28, 2025
