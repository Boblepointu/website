---
title: 'Taproot'
description: 'Pay-to-Taproot (P2TR) consensus specification for Lotus — enabling efficient smart contracts, burn-to-vote reputation transactions, and privacy-preserving on-chain governance.'
linkTitle: 'Taproot'
category: Script
weight: 4.1
modified: 2025-11-10
---

# Taproot Consensus Specification

**Reference Implementation**: lotusd (Lotus Root)

Pay-to-Taproot (P2TR) enables efficient and private smart contracts on Lotus by combining Schnorr signatures with Merkle trees. This document specifies the consensus rules enforced by lotusd nodes.

::alert{type="info"}
**Document Scope**: This specification covers only the lotusd consensus implementation. For application-level integration, refer to wallet and SDK documentation separately.
::

### Key Features

- **Privacy**: Key path spending looks identical to regular single-signature transactions
- **Flexibility**: Support multiple spending conditions via Merkle script trees
- **Efficiency**: Schnorr signatures are ~10% smaller than ECDSA (64 bytes vs ~72)
- **Future-Proof**: Designed for Lightning Network, atomic swaps, vaults, and DeFi

---

## Consensus Rules Summary

**Reference**: `src/script/interpreter.cpp:2074-2156`, `src/script/taproot.cpp` in lotusd

The following rules are enforced by all lotusd nodes:

### Output Validation Rules

1. **Script Format**: Must be `OP_SCRIPTTYPE OP_1 0x21 <33-byte commitment>` (36 bytes) OR `OP_SCRIPTTYPE OP_1 0x21 <33-byte commitment> 0x20 <32-byte state>` (69 bytes)
2. **Commitment Size**: Exactly 33 bytes (compressed public key format)
3. **State Size**: If present, exactly 32 bytes
4. **First Byte**: Must be `OP_SCRIPTTYPE` (0x62)
5. **Second Byte**: Must be `OP_1` (0x51)

### Key Path Spending Rules

1. **Stack Size**: Exactly 1 element (the signature)
2. **Signature Format**: 64-byte Schnorr signature + 1-byte sighash type = 65 bytes total
3. **Signature Type**: MUST be Schnorr (ECDSA forbidden, error: `TAPROOT_KEY_SPEND_MUST_USE_SCHNORR_SIG`)
4. **Sighash Requirement**: MUST include `SIGHASH_LOTUS` (0x60) flag (error: `TAPROOT_KEY_SPEND_MUST_USE_LOTUS_SIGHASH`)
5. **Typical Sighash**: `SIGHASH_ALL | SIGHASH_LOTUS` = 0x61
6. **Verification**: Schnorr signature must verify against commitment pubkey and transaction sighash

### Script Path Spending Rules

1. **Stack Size**: At least 2 elements (script + control block + optional arguments)
2. **Control Block Size**: 33 + (32 × n) bytes, where 0 ≤ n ≤ 128
3. **Control Block Format**: `[(leaf_version & 0xfe) | parity] || internal_pubkey_x || merkle_proof_nodes`
4. **Leaf Version**: Must be 0xc0 (TAPROOT_LEAF_TAPSCRIPT)
5. **Merkle Proof**: Must verify commitment = internal_pubkey + tagged_hash("TapTweak", internal_pubkey || merkle_root) × G
6. **Script Execution**: Revealed script must execute successfully and leave truthy value on stack
7. **State Handling**: If output has state parameter, it's automatically pushed onto stack before script execution
8. **Annex**: Not supported (error: `TAPROOT_ANNEX_NOT_SUPPORTED` if present)

### Cryptographic Requirements

1. **Tagged Hashing**: `tagged_hash(tag, msg) = SHA256(SHA256(tag) || SHA256(tag) || msg)`
2. **Leaf Hash**: `tagged_hash("TapLeaf", 0xc0 || compact_size(script_len) || script_bytes)`
3. **Branch Hash**: `tagged_hash("TapBranch", min(left, right) || max(left, right))` (lexicographic ordering required)
4. **Tweak Hash**: `tagged_hash("TapTweak", internal_pubkey || merkle_root)`
5. **Public Key Format**: 33-byte compressed (0x02 or 0x03 prefix)
6. **Curve**: secp256k1

### Error Codes

- `TAPROOT_PHASEOUT`: Taproot disabled by flag
- `SCRIPTTYPE_MALFORMED_SCRIPT`: Invalid scriptPubKey format
- `INVALID_STACK_OPERATION`: Empty stack
- `TAPROOT_ANNEX_NOT_SUPPORTED`: Annex present
- `TAPROOT_KEY_SPEND_MUST_USE_SCHNORR_SIG`: ECDSA used for key path
- `TAPROOT_KEY_SPEND_MUST_USE_LOTUS_SIGHASH`: Missing SIGHASH_LOTUS
- `TAPROOT_VERIFY_SIGNATURE_FAILED`: Invalid signature
- `TAPROOT_WRONG_CONTROL_SIZE`: Invalid control block size
- `TAPROOT_LEAF_VERSION_NOT_SUPPORTED`: Leaf version not 0xc0
- `TAPROOT_VERIFY_COMMITMENT_FAILED`: Merkle proof failed
- `EVAL_FALSE`: Script returned false

---

## Output Format

**Reference**: `src/script/taproot.cpp:68-87` (IsPayToTaproot function)

Taproot outputs consist of a matched pattern:

```
OP_SCRIPTTYPE OP_1 0x21 <33-byte commitment> [0x20 <32-byte state>]
```

**Components**:

- `OP_SCRIPTTYPE` (0x62): Marks the script as Taproot
- `OP_1` (0x51): Version byte
- `0x21`: Push opcode indicating "push next 33 bytes" (decimal 33)
- **33-byte commitment**: Tweaked public key (compressed format with 0x02/0x03 prefix)
- `0x20`: Push opcode indicating "push next 32 bytes" (decimal 32, when state present)
- **32-byte state** (optional): When present, pushed onto stack before executing script path spend

**Note on Push Opcodes**: In Bitcoin Script, opcodes 0x01-0x4b directly encode the number of bytes to push. The value 0x21 (33 decimal) means "push the next 33 bytes", and 0x20 (32 decimal) means "push the next 32 bytes". These are not symbolic constants but literal byte counts.

**Size**:

- Without state: 36 bytes total (OP_SCRIPTTYPE + OP_1 + 0x21 + 33-byte commitment)
- With state: 69 bytes total (OP_SCRIPTTYPE + OP_1 + 0x21 + 33-byte commitment + 0x20 + 32-byte state)

### Lotus-Specific Features

Lotus Taproot differs from Bitcoin's implementation in critical ways:

1. **Commitment Format**:
   - Lotus: 33-byte compressed public key (0x02/0x03 prefix + 32-byte x-coordinate)
   - Bitcoin: 32-byte x-only public key (x-coordinate only)
2. **Control Block Parity Encoding**:
   - Lotus: Parity bit indicates **internal pubkey's** Y-coordinate (used to reconstruct 33-byte key)
   - Bitcoin: Parity bit indicates **commitment pubkey's** Y-coordinate
3. **Optional State Parameter**:
   - Lotus: Supports optional 32-byte state parameter for smart contracts
   - Bitcoin: No state parameter support

4. **Script Identifier**:
   - Lotus: Uses `OP_SCRIPTTYPE` (0x62) marker before version byte
   - Bitcoin: No marker opcode

5. **Signature Requirements**:
   - Lotus: SIGHASH_LOTUS (0x60) required for key path spending
   - Bitcoin: Default sighash types
6. **Address Format**:
   - Lotus: XAddress format with type byte 2 (e.g., `lotus_J...`)
   - Bitcoin: Bech32m format (e.g., `bc1p...`)

**Compatibility**: Lotus and Bitcoin Taproot implementations are **completely incompatible**. Do not attempt to use Bitcoin Taproot tools or addresses with Lotus.

---

### Address Format

**Reference**: `src/addresses/xaddress.cpp` (XAddress encoding implementation)

Taproot addresses use XAddress encoding with type byte `2`:

**Format**: `lotus_J<base58_payload>`

**Example**:

```
lotus_JHMEcuQ6SyDcJKsSJVd6cZRSVZ8NqWZNMwAX8RDirNEazCfEgFp
```

**Encoding**:

- Prefix: "lotus"
- Network character: `_` (mainnet), `T` (testnet), `R` (regtest)
- Type byte: `2`
- Payload: 33-byte commitment public key
- Checksum: 4-byte hash

---

### Spending Paths

Taproot outputs can be spent via two distinct paths: **key path** (cooperative spending) or **script path** (revealing a specific script). Understanding when to use each is crucial for building efficient and private applications.

### Choosing Between Key Path and Script Path

**Use Key Path When**:

- ✅ All parties agree on the transaction (cooperative case)
- ✅ Privacy is paramount (hides all alternative conditions)
- ✅ Minimizing transaction size and fees
- ✅ Simple single-signature or MuSig2 multi-signature spending
- ✅ No special conditions need to be proven on-chain

**Use Script Path When**:

- ✅ Parties cannot coordinate (non-cooperative case)
- ✅ Need to prove specific conditions were met (e.g., time-lock expired)
- ✅ Fallback mechanism when key path fails
- ✅ Complex smart contract logic that must be revealed
- ✅ Multiple independent spending conditions where only one needs execution

**Decision Tree**:

```
Can all parties cooperate?
├─ YES → Use Key Path (always preferred)
│   ├─ Single signer? → buildKeyPathTaproot()
│   └─ Multiple signers? → buildMuSigTaprootKey() + MuSig2 protocol
│
└─ NO → Must use Script Path
    ├─ Single condition? → Single leaf tree
    ├─ Multiple OR conditions? → Multi-leaf tree (one will be revealed)
    └─ Complex conditions? → Nested tree with multiple branches
```

**Size Comparison**:

| Scenario        | Key Path  | Script Path | Savings |
| --------------- | --------- | ----------- | ------- |
| Single-sig      | ~67 bytes | ~180 bytes  | 63%     |
| 2-of-2 MuSig2   | ~67 bytes | ~220 bytes  | 70%     |
| 3-of-5 multisig | ~67 bytes | ~350 bytes  | 81%     |

**Key Insight**: Always structure your Taproot output to enable key path spending as the "happy path" (when all parties cooperate), with script path as the fallback for exceptional cases.

---

## II. Spending Mechanisms

### Key Path Spending (Cooperative)

**Reference**: `src/script/interpreter.cpp:2097-2111` (Key path verification logic)

The most common and private way to spend Taproot outputs. When all parties can cooperate, they collectively create a single Schnorr signature that spends the output.

### How It Works

**Conceptual Model**:

```
Taproot Output (33-byte commitment)
         ↓
    Key Path Spend
         ↓
Single Schnorr Signature (65 bytes)
         ↓
    Verified & Accepted
```

The commitment is a tweaked version of an internal public key:

```
commitment = internal_pubkey + tagged_hash("TapTweak", internal_pubkey || merkle_root) × G
```

For key-only outputs (no scripts), the `merkle_root` is 32 zero bytes.

### Technical Requirements

**Signature Type**:

- **MUST** be 64-byte Schnorr signature (not ECDSA)
- **MUST** append sighash byte (typically 0x61 = SIGHASH_ALL | SIGHASH_LOTUS)
- Total: 65 bytes on stack

**Sighash Type**:

- **MUST** include `SIGHASH_LOTUS` flag (0x60)
- Typically combined: `SIGHASH_ALL | SIGHASH_LOTUS = 0x61`
- Cannot use SIGHASH_LOTUS alone (needs base type)

**lotusd Verification Process**:

1. **Stack Check**: Verify stack has exactly 1 element (the signature)
2. **Signature Length**: Verify signature is exactly 65 bytes total
3. **Signature Type**: First 64 bytes = Schnorr signature body
4. **Sighash Byte**: Last byte must include SIGHASH_LOTUS flag
5. **Extract Commitment**: Get 33-byte commitment from scriptPubKey
6. **Compute Sighash**: Calculate transaction hash based on sighash type
7. **Verify Signature**: Use `CPubKey::VerifySchnorr()` against commitment
8. **Accept**: If signature valid, transaction is accepted

**Error Conditions**:

- Stack empty or >1 element → `INVALID_STACK_OPERATION`
- Signature not 64 bytes → `TAPROOT_KEY_SPEND_MUST_USE_SCHNORR_SIG`
- Missing SIGHASH_LOTUS → `TAPROOT_KEY_SPEND_MUST_USE_LOTUS_SIGHASH`
- Invalid signature → `TAPROOT_VERIFY_SIGNATURE_FAILED`

### Signing Process

**For Single Signer**:

```
Algorithm: Sign Taproot Key Path Transaction

Input:
  - internal_privkey: Private key (32 bytes)
  - merkle_root: Merkle root of script tree (32 bytes, or 32 zero bytes for key-only)
  - transaction: Unsigned transaction
  - input_index: Index of input being signed

Steps:
  1. Calculate tweak:
     internal_pubkey = internal_privkey × G
     tweak = tagged_hash("TapTweak", internal_pubkey || merkle_root)

  2. Tweak private key:
     tweaked_privkey = (internal_privkey + tweak) mod n
     where n = secp256k1 curve order

  3. Calculate sighash:
     sighash = SignatureHash(transaction, input_index, SIGHASH_ALL | SIGHASH_LOTUS)

  4. Create Schnorr signature:
     signature = SchnorrSign(tweaked_privkey, sighash)  // 64 bytes

  5. Append sighash byte:
     final_signature = signature || 0x61  // 65 bytes total

  6. Place in scriptSig:
     scriptSig = <final_signature>

Output: Signed transaction with 65-byte signature in scriptSig
```

**For Multiple Signers (MuSig2)**:

```
Protocol: MuSig2 Multi-Signature for Taproot Key Path

Participants: n signers with private keys (privkey_1, ..., privkey_n)

Phase 1: Key Aggregation
  1. Each signer computes: pubkey_i = privkey_i × G
  2. Compute aggregated public key:
     agg_pubkey = KeyAgg(pubkey_1, ..., pubkey_n)
     (Uses MuSig2 key aggregation with coefficient system)
  3. Compute internal pubkey and tweak:
     internal_pubkey = agg_pubkey
     tweak = tagged_hash("TapTweak", internal_pubkey || merkle_root)
     commitment = internal_pubkey + tweak × G

Phase 2: Nonce Generation (Round 1)
  1. Each signer generates two random nonces:
     secnonce_i = (k_i,1, k_i,2)  // Secret nonces
     pubnonce_i = (k_i,1 × G, k_i,2 × G)  // Public nonces
  2. Broadcast pubnonce_i to all other signers
  3. Aggregate all public nonces:
     agg_nonce = NonceAgg(pubnonce_1, ..., pubnonce_n)

Phase 3: Partial Signature Generation (Round 2)
  1. Calculate sighash:
     sighash = SignatureHash(transaction, input_index, SIGHASH_ALL | SIGHASH_LOTUS)
  2. Each signer creates partial signature:
     partial_sig_i = PartialSign(secnonce_i, privkey_i, agg_pubkey, agg_nonce, sighash, tweak)
  3. Broadcast partial_sig_i to all other signers

Phase 4: Signature Aggregation
  1. Verify all partial signatures
  2. Aggregate into final signature:
     final_sig = PartialSigAgg(partial_sig_1, ..., partial_sig_n, agg_nonce)
  3. Append sighash byte:
     complete_sig = final_sig || 0x61  // 65 bytes total

Result: Single 65-byte Schnorr signature indistinguishable from single-signer case

Note: MuSig2 protocol details are defined in BIP327. The key insight is that the
final signature is a standard Schnorr signature over the tweaked aggregated key,
making multi-sig spending look identical to single-sig on-chain.
```

### Privacy Guarantees

**What Observers See**:

- A 33-byte compressed public key in scriptPubKey
- A 65-byte signature in scriptSig
- Standard transaction structure

**What Observers CANNOT Determine**:

- ❌ Number of signers (could be 1, 2, 100, or more)
- ❌ Identity of signers
- ❌ Whether alternative scripts exist
- ❌ What those alternative scripts contain
- ❌ Spending conditions (time-locks, multisig, etc.)

This is the **strongest privacy** available in Taproot: a 5-of-7 multisig with 10 alternative spending paths looks identical to a simple single-signature payment.

---

### Script Path Spending (Non-Cooperative)

**Reference**: `src/script/interpreter.cpp:2113-2155` (Script path verification logic)

When parties cannot cooperate or when specific conditions must be proven on-chain, script path spending reveals and executes one of the committed scripts.

### How It Works

**Conceptual Model**:

```
Taproot Output (commitment to script tree)
         ↓
    Script Path Spend
         ↓
Reveal: [script] + [control block with merkle proof]
         ↓
Verify: Prove script is in committed tree
         ↓
Execute: Run revealed script with stack elements
         ↓
    Script returns TRUE → Accepted
```

### The Script Tree Structure

Scripts are organized in a binary Merkle tree. Each leaf contains a script, and branches combine hashes:

**Example Tree**:

```
                Root Hash
               /          \
         Branch A      Branch B
         /     \        /     \
     Script1 Script2 Script3 Script4
```

To spend via Script2, you reveal:

- **Script2** itself
- **Merkle proof**: [Hash(Script1), Hash(Branch B)]
- **Control block**: Internal pubkey + parity + merkle proof

The verifier reconstructs the root and confirms it matches the commitment.

### How lotusd Knows Which Script to Execute

**The Control Block is the Key**: The control block contains a Merkle proof that identifies which specific script in the tree is being spent. The interpreter doesn't need to know the entire tree—it only needs to verify that the revealed script is a valid leaf.

**Step-by-Step Process**:

1. **Parse Input**: Extract `[stack_elements...] [script] [control_block]` from stack
   - Everything before the last 2 elements = arguments/data for the script
   - Second-to-last element = the script being executed
   - Last element = control block with proof

2. **Extract Control Block Components**:

   ```
   control_byte = control_block[0]
   leaf_version = control_byte & 0xfe    // Must be 0xc0
   parity = control_byte & 0x01          // Internal pubkey parity
   internal_pubkey_x = control_block[1:33]  // 32-byte x-coordinate
   merkle_proof = control_block[33:]     // 32-byte nodes
   ```

3. **Reconstruct Internal Pubkey**:

   ```
   prefix = (parity == 1) ? 0x03 : 0x02
   internal_pubkey = [prefix] || internal_pubkey_x  // 33 bytes
   ```

4. **Calculate Leaf Hash**:

   ```
   leaf_hash = tagged_hash("TapLeaf", leaf_version || compact_size(script) || script)
   ```

5. **Walk Merkle Tree**:

   ```
   current_hash = leaf_hash
   for each 32-byte node in merkle_proof:
       // Lexicographically order before hashing (smaller hash first)
       if current_hash < node:
           current_hash = tagged_hash("TapBranch", current_hash || node)
       else:
           current_hash = tagged_hash("TapBranch", node || current_hash)
   ```

6. **Verify Commitment**:

   ```
   tweak = tagged_hash("TapTweak", internal_pubkey || current_hash)
   expected_commitment = internal_pubkey + tweak × G
   actual_commitment = 33-byte pubkey from scriptPubKey

   if expected_commitment != actual_commitment:
       return ERROR_TAPROOT_VERIFY_COMMITMENT_FAILED
   ```

7. **Push State (if present)**:

   ```
   if scriptPubKey.length == 69:  // Has state
       state = scriptPubKey[37:69]  // Extract 32-byte state
       stack.push(state)            // Push onto execution stack
   ```

8. **Execute Script**:
   ```
   Execute the revealed script with the execution stack
   Script must complete and leave TRUE on stack top
   ```

### Input Script Format

The scriptSig for script path spending has this structure:

```
<stack_element_1> <stack_element_2> ... <stack_element_n> <script> <control_block>
```

Where stack elements are the arguments/data needed by the revealed script (e.g., signatures).

**Example - Time-Lock Script**:

```
<signature>                    // Stack element: Signature for pubkey check
<timelock_script>              // Script: <height> OP_CSV OP_DROP <pubkey> OP_CHECKSIG
<control_block>                // Proof: version|parity + internal_x + merkle_proof
```

**Example - 2-of-3 Multisig Script**:

```
<0>                           // Stack element: OP_CHECKMULTISIG bug workaround
<signature_1>                 // Stack element: First signature
<signature_2>                 // Stack element: Second signature
<multisig_script>            // Script: OP_2 <pk1> <pk2> <pk3> OP_3 OP_CHECKMULTISIG
<control_block>              // Proof: version|parity + internal_x + merkle_proof
```

### Control Block Encoding

**Reference**: See `src/script/taproot.cpp:44-54` in lotusd for parity encoding details.

The control block is carefully constructed to be compact and verifiable:

**Structure**:

```
Byte 0:     [(leaf_version & 0xfe) | parity_bit]
Bytes 1-32: internal_pubkey_x (32 bytes, no prefix)
Bytes 33+:  merkle_proof_nodes (32 bytes each)
```

**First Byte Bit-Level Breakdown**:

```
Byte 0 bit layout (8 bits total):
  Bit 7 (MSB): Leaf version bit 7
  Bit 6:       Leaf version bit 6
  Bit 5:       Leaf version bit 5
  Bit 4:       Leaf version bit 4
  Bit 3:       Leaf version bit 3
  Bit 2:       Leaf version bit 2
  Bit 1:       Leaf version bit 1 (always 0 for TAPROOT_LEAF_TAPSCRIPT)
  Bit 0 (LSB): Internal pubkey Y-coordinate parity

For TAPROOT_LEAF_TAPSCRIPT (0xc0 = 0b11000000):
  Bits 7-1: 0b1100000 (96 decimal, 0x60 hex)
  Bit 0:    0 = even Y-coordinate (use 0x02 prefix)
            1 = odd Y-coordinate (use 0x03 prefix)

Example values:
  0xc0 (192): Leaf version 0xc0, even Y (internal pubkey starts with 0x02)
  0xc1 (193): Leaf version 0xc0, odd Y (internal pubkey starts with 0x03)
```

**Extraction Algorithm** (from lotusd):

```
Given control_block[0]:
  1. Extract leaf version:
     leaf_version = control_block[0] & TAPROOT_LEAF_MASK  // 0xfe mask
     leaf_version = control_block[0] & 0b11111110
     // Result: 0xc0 for TAPROOT_LEAF_TAPSCRIPT

  2. Extract parity bit:
     parity = control_block[0] & 0x01
     // Result: 0 (even) or 1 (odd)

  3. Reconstruct internal pubkey prefix:
     prefix = (parity == 1) ? 0x03 : 0x02

  4. Build full 33-byte internal pubkey:
     internal_pubkey = prefix || control_block[1:33]
```

**Why X-Coordinate Only?**

The control block stores only the 32-byte x-coordinate of the internal pubkey (not the full 33-byte compressed key). The parity bit (bit 0 of the first byte) tells us whether to use prefix 0x02 (even Y) or 0x03 (odd Y). This saves 1 byte per control block.

**Lotus-Specific Detail**: The parity bit encodes the **internal pubkey's** Y-coordinate parity, NOT the commitment's parity. This differs from Bitcoin's BIP341, where the parity encodes the commitment's Y-coordinate.

**Example Control Block** (no merkle proof):

```
c0                    // 0xc0 = leaf version 0xc0, parity 0 (even Y)
a1b2c3d4e5f6...       // 32-byte internal pubkey x-coordinate
                      // (no merkle proof nodes - single leaf tree)
Total: 33 bytes
```

**Example Control Block** (with merkle proof):

```
c1                    // 0xc0 = leaf version 0xc0, parity 1 (odd Y)
a1b2c3d4e5f6...       // 32-byte internal pubkey x-coordinate
1234567890ab...       // First merkle proof node (32 bytes)
fedcba098765...       // Second merkle proof node (32 bytes)
Total: 97 bytes (33 + 64)
```

### Proof Size vs Tree Depth

The control block grows with tree depth:

| Tree Structure       | Leaves | Proof Nodes | Control Block Size |
| -------------------- | ------ | ----------- | ------------------ |
| Single leaf          | 1      | 0           | 33 bytes           |
| 2 leaves             | 2      | 1           | 65 bytes           |
| 4 leaves (balanced)  | 4      | 2           | 97 bytes           |
| 8 leaves (balanced)  | 8      | 3           | 129 bytes          |
| 16 leaves (balanced) | 16     | 4           | 161 bytes          |

**Optimal Tree Design**: Balance the tree to minimize proof sizes. A balanced binary tree with N leaves requires only log₂(N) proof nodes.

---

## Smart Contracts with Script Path Fallbacks

Script path spending enables sophisticated smart contracts with multiple spending conditions. The key insight: structure your tree so the most likely path (key path) is cooperative, with script paths as fallbacks.

### Pattern 1: Primary + Recovery

**Use Case**: Normal cooperative spending with a time-locked recovery

```
Structure:
  Key Path: All parties cooperate (MuSig2)
  Script Path (fallback): Single party recovers after time-lock

Example: Lightning channel
  Key Path: Both parties sign cooperative close
  Script Path: Either party can force-close after dispute period
```

**Script Structure**:

```
Recovery Script (Script Path Fallback):
  <dispute_period_blocks>     // e.g., 720 blocks (~24 hours)
  OP_CHECKSEQUENCEVERIFY      // Verify time-lock has passed
  OP_DROP                     // Remove time value from stack
  <alice_pubkey>              // 33-byte compressed public key
  OP_CHECKSIG                 // Verify signature

Taproot Construction:
  1. Create MuSig2 aggregated key from [alice_pubkey, bob_pubkey]
  2. Build script tree with single leaf (recovery script)
  3. Calculate merkle_root = tagged_hash("TapLeaf", 0xc0 || recovery_script)
  4. Tweak aggregated key:
     commitment = agg_pubkey + tagged_hash("TapTweak", agg_pubkey || merkle_root) × G
  5. Create P2TR output:
     scriptPubKey = OP_SCRIPTTYPE OP_1 0x21 <commitment>
```

**Spending**:

- **Happy path** (99% of cases): Alice and Bob cooperate → key path (67 bytes)
- **Dispute** (1% of cases): Alice waits and uses recovery → script path (180 bytes)

### Pattern 2: Multiple OR Conditions

**Use Case**: Different parties can spend under different conditions

```
Structure:
  Key Path: All parties cooperate
  Script Paths:
    ├─ Alice after 1 day
    ├─ Bob after 1 week
    └─ 2-of-3 multisig anytime

Example: Escrow with tiered recovery
```

**Script Definitions**:

```
Script 1 - Alice Recovery (after 1 day = 720 blocks):
  <720>                    // Time-lock: 1 day
  OP_CHECKLOCKTIMEVERIFY   // Verify absolute time-lock
  OP_DROP
  <alice_pubkey>
  OP_CHECKSIG

Script 2 - Bob Recovery (after 1 week = 5,040 blocks):
  <5040>                   // Time-lock: 1 week
  OP_CHECKLOCKTIMEVERIFY
  OP_DROP
  <bob_pubkey>
  OP_CHECKSIG

Script 3 - Emergency Multisig (2-of-3, anytime):
  OP_2
  <alice_pubkey>
  <bob_pubkey>
  <charlie_pubkey>
  OP_3
  OP_CHECKMULTISIG

Tree Construction (balanced for minimal proof sizes):
  1. Calculate leaf hashes:
     leaf_1 = tagged_hash("TapLeaf", 0xc0 || script_1)
     leaf_2 = tagged_hash("TapLeaf", 0xc0 || script_2)
     leaf_3 = tagged_hash("TapLeaf", 0xc0 || script_3)

  2. Build tree structure:
     branch_right = tagged_hash("TapBranch", min(leaf_2, leaf_3) || max(leaf_2, leaf_3))
     merkle_root = tagged_hash("TapBranch", min(leaf_1, branch_right) || max(leaf_1, branch_right))

  3. Create commitment:
     commitment = internal_pubkey + tagged_hash("TapTweak", internal_pubkey || merkle_root) × G
```

**Merkle Tree**:

```
           Root
          /    \
    Alice      Branch
   Recovery   /     \
            Bob    Emergency
          Recovery  Multisig
```

**Spending Scenarios**:

1. **Cooperative**: Key path (all parties agree)
2. **Alice timeout**: Reveal `aliceRecovery` + proof with 1 node (65 bytes)
3. **Bob timeout**: Reveal `bobRecovery` + proof with 2 nodes (97 bytes)
4. **Emergency**: Reveal `emergencyMultisig` + proof with 2 nodes (97 bytes)

### Pattern 3: State-Based Contracts

**Use Case**: Contract behavior depends on on-chain state

```
Structure:
  Key Path: Cooperative state transition
  Script Path: Enforce state transition rules using state parameter

Example: NFT with royalty enforcement
  State: Hash of (creator_address, royalty_percentage)
  Script: Verify outputs pay correct royalty
```

**Script Structure**:

```
Contract State Commitment:
  state_data = creator_address || royalty_percentage
  state_hash = SHA256(state_data)  // 32 bytes

Royalty Verification Script:
  // When executed, state_hash is already on stack (pushed by lotusd)
  // Stack: [state_hash]

  OP_DUP                    // Duplicate state hash
  <expected_state_hash>     // Push expected hash
  OP_EQUALVERIFY            // Verify state matches expected

  // Custom validation logic to verify outputs pay royalty
  // ... output verification opcodes ...

  <creator_pubkey>
  OP_CHECKSIG               // Final signature check

Taproot Output Construction:
  1. Build script tree with royalty script
  2. Calculate merkle_root from script tree
  3. Tweak internal key:
     commitment = internal_pubkey + tagged_hash("TapTweak", internal_pubkey || merkle_root) × G
  4. Create P2TR output WITH state:
     scriptPubKey = OP_SCRIPTTYPE OP_1 0x21 <commitment> 0x20 <state_hash>
     Total size: 69 bytes (36 + 33 for state parameter)
```

**How State Works**:

1. Output stores state in scriptPubKey (adds 33 bytes)
2. When spending via script path, lotusd automatically pushes state onto stack
3. Script can read and verify state matches expected values
4. Enables stateful smart contracts without external data sources

### Pattern 4: Hierarchical Permissions

**Use Case**: Different authorization levels for different actions

```
Structure:
  Key Path: Admin override (all admins agree)
  Script Paths:
    ├─ High value: 3-of-5 multisig
    ├─ Medium value: 2-of-5 multisig
    └─ Low value: 1-of-5 multisig

Example: DAO treasury with tiered spending limits
```

The tree structure creates spending efficiency: more common actions (low value) get shorter proofs.

### Design Principles

**1. Optimize for the Happy Path**

Always structure so cooperative case (key path) is the most likely:

- Key path: Smallest size, maximum privacy
- Script paths: Exceptional cases, fallbacks

**2. Balance the Tree**

Put frequently-used scripts near the top:

- Shorter merkle proofs
- Lower transaction fees
- Faster verification

**3. Minimize Revealed Information**

Only the executed script path is revealed:

- Unexecuted branches remain hidden
- Observers don't know how many total branches exist
- Privacy degrades gracefully (only reveal what's necessary)

**4. Consider Proof Sizes**

Tree depth affects transaction size:

```
Depth 1: 33 + 32×1 = 65 bytes
Depth 2: 33 + 32×2 = 97 bytes
Depth 3: 33 + 32×3 = 129 bytes
Depth 7: 33 + 32×7 = 257 bytes
```

Balance tree complexity vs transaction cost.

---

## III. Cryptographic Primitives

### Tagged Hashing

**Reference**: `src/hash.h` (TaggedHash function), `src/script/taproot.cpp:11-13` (Tag constants)

Lotus Taproot uses tagged hashing to prevent cross-protocol attacks and ensure domain separation:

```
tagged_hash(tag, msg) = SHA256(SHA256(tag) || SHA256(tag) || msg)
```

**Why Double Concatenation?**

The tag hash is concatenated twice for critical security reasons:

- **Domain Separation**: Creates unique hash domains for different contexts
- **Collision Resistance**: Makes cross-protocol attacks computationally infeasible
- **Prefix Ambiguity Prevention**: Prevents data from one context being misinterpreted in another

This algorithm is implemented in lotusd's `TaggedHash()` function (src/hash.h) and follows the same pattern as BIP340 for cryptographic consistency.

**Tags Used**:

- `TapTweak`: Tweaking the internal public key
- `TapLeaf`: Hashing individual scripts in the tree
- `TapBranch`: Hashing pairs of nodes when building Merkle tree

**Implementation**:

```typescript
import { Hash } from 'lotus-sdk'

function taggedHash(tag: string, data: Buffer): Buffer {
  const tagHash = Hash.sha256(Buffer.from(tag, 'utf8'))
  const combined = Buffer.concat([tagHash, tagHash, data]) // Double concat
  return Hash.sha256(combined)
}
```

---

### Key Tweaking

**Reference**: `src/script/taproot.cpp:55-65` (Commitment verification with tweaking), `src/pubkey.h` (AddScalar method)

**Public Key Tweaking**:

```
tweaked_pubkey = internal_pubkey + (tapTweak * G)
```

**Private Key Tweaking**:

```
tweaked_privkey = (internal_privkey + tapTweak) mod n
```

Where:

- `tapTweak = tagged_hash("TapTweak", internal_pubkey || merkle_root)`
- `G` = secp256k1 generator point
- `n` = secp256k1 curve order

**Key-Only Spending**: Use `merkle_root = Buffer(32 zeros)` for outputs without scripts.

**Example Calculation**:

```
Given:
  internal_privkey = <32-byte private key>
  internal_pubkey = internal_privkey × G  // 33-byte compressed pubkey
  merkle_root = 0x0000...0000  // 32 zero bytes for key-only output

Public Key Tweaking:
  tweak = tagged_hash("TapTweak", internal_pubkey || merkle_root)
  tweaked_pubkey = internal_pubkey + (tweak × G)
  // Result: 33-byte compressed public key (commitment)

Private Key Tweaking:
  tweak = tagged_hash("TapTweak", internal_pubkey || merkle_root)
  tweaked_privkey = (internal_privkey + tweak) mod n
  where n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
  // Result: 32-byte private key that corresponds to tweaked_pubkey

Verification:
  tweaked_privkey × G == tweaked_pubkey  // Must be true
```

---

### Script Trees

Scripts are organized in a Merkle tree for compact commitments.

### Leaf Node Hashing

**Reference**: See `src/script/taproot.cpp:23-26` in lotusd.

```
leaf_hash = tagged_hash("TapLeaf", leaf_version || compact_size(script_length) || script_bytes)
```

**Components**:

- `leaf_version = 0xc0` (192 decimal) - TAPROOT_LEAF_TAPSCRIPT constant
- `compact_size(script_length)` - Variable-length integer encoding of script length
- `script_bytes` - Raw script bytes

**Compact Size Encoding**:

Bitcoin's compact size format encodes integers as follows:

- `0x00-0xFC` (0-252): Single byte (value itself)
- `0xFD` + 2 bytes: Values 253-65535 (little-endian uint16)
- `0xFE` + 4 bytes: Values 65536-4294967295 (little-endian uint32)
- `0xFF` + 8 bytes: Values > 4294967295 (little-endian uint64)

**Example**:

```
Script: <pubkey> OP_CHECKSIG
  Raw bytes: 0x21 <33-byte pubkey> 0xac
  Length: 35 bytes

Leaf Hash Calculation:
  leaf_version = 0xc0
  compact_size(35) = 0x23  // Single byte (35 < 253)
  script_bytes = 0x21 <33-byte pubkey> 0xac

  Input to tagged_hash:
    0xc0 || 0x23 || 0x21 || <33-byte pubkey> || 0xac

  leaf_hash = tagged_hash("TapLeaf", above_bytes)
```

**Critical**: The compact size encoding is **required** for correct leaf hash calculation. Omitting it will produce an incorrect merkle root and cause commitment verification to fail.

### Branch Node Hashing

**Reference**: See `src/script/taproot.cpp:34-40` in lotusd.

```
branch_hash = tagged_hash("TapBranch", left_hash || right_hash)
```

**Lexicographic Ordering Requirement**:

Before hashing, the two child hashes MUST be sorted in lexicographic (bytewise) order:

```
if left_hash < right_hash (bytewise comparison):
    branch_hash = tagged_hash("TapBranch", left_hash || right_hash)
else:
    branch_hash = tagged_hash("TapBranch", right_hash || left_hash)
```

**Why This Matters**:

1. **Deterministic Tree Construction**: The same set of scripts always produces the same merkle root, regardless of the order they were added to the tree.

2. **Prevents Malleability**: Without ordering, an attacker could create different merkle roots for the same script set by reordering branches, potentially causing confusion or exploits.

3. **Simplified Verification**: Verifiers don't need to know the original tree structure—they only need the merkle proof, which is unambiguous due to deterministic ordering.

4. **Consensus Requirement**: lotusd enforces this ordering during verification. A control block with incorrectly ordered proof nodes will fail validation.

**Example**:

```
Given two leaf hashes:
  leaf_A = 0x1234...  (starts with 0x12)
  leaf_B = 0x5678...  (starts with 0x56)

Bytewise comparison: 0x12 < 0x56

Correct branch hash:
  branch = tagged_hash("TapBranch", leaf_A || leaf_B)

Incorrect (will fail verification):
  branch = tagged_hash("TapBranch", leaf_B || leaf_A)
```

### Tree Structure

**Simple Script** (1 script):

```
Root = leaf_hash(script)
```

**Multiple Scripts** (2+ scripts):

```
       Root
      /    \
   Hash1  Hash2
   /  \    /  \
  L1  L2  L3  L4
```

**Building a Tree**:

```
Example: Two-Script Tree

Script 1:
  <pubkey_1>
  OP_CHECKSIG

Script 2:
  <pubkey_2>
  OP_CHECKSIG

Tree Construction Algorithm:
  1. Calculate leaf hashes:
     leaf_1 = tagged_hash("TapLeaf", 0xc0 || compact_size(len(script_1)) || script_1)
     leaf_2 = tagged_hash("TapLeaf", 0xc0 || compact_size(len(script_2)) || script_2)

  2. Combine into branch (lexicographic ordering):
     if leaf_1 < leaf_2 (bytewise comparison):
       merkle_root = tagged_hash("TapBranch", leaf_1 || leaf_2)
     else:
       merkle_root = tagged_hash("TapBranch", leaf_2 || leaf_1)

  3. Create commitment:
     tweak = tagged_hash("TapTweak", internal_pubkey || merkle_root)
     commitment = internal_pubkey + tweak × G

  4. Build P2TR output:
     scriptPubKey = OP_SCRIPTTYPE OP_1 0x21 <commitment>

Result:
  - Merkle root: 32-byte hash
  - Number of leaves: 2
  - Tree depth: 1 (requires 1 proof node to spend either script)
```

---

## IV. Common Use Cases

Taproot enables various advanced use cases by combining privacy, efficiency, and flexibility.

### Single-Key Spending

**Purpose**: Simple payments with maximum privacy
**Structure**: Key-only Taproot (no script tree)
**Privacy**: Indistinguishable from multi-sig or complex scripts
**Size**: 36-byte output, 65-byte signature

### Time-Locked Recovery

**Purpose**: Funds locked with time-based fallback
**Structure**: Key path (cooperative) + script path (time-lock + signature)
**Use Case**: Lightning channels, escrow services
**Privacy**: Time-lock only revealed if used

### Multi-Signature Governance

**Purpose**: Organizations requiring multiple approvals
**Structure**: MuSig2 key path + explicit multisig script path fallback
**Privacy**: Cooperative spending looks like single-sig
**Efficiency**: 67 bytes (key path) vs 350+ bytes (explicit multisig)

### Atomic Swaps

**Purpose**: Trustless cross-chain exchanges
**Structure**: Hash-locked scripts with time-lock refunds
**Privacy**: Swap details only revealed on-chain if executed
**Security**: Both parties protected by time-locks

### Vaults

**Purpose**: Secure cold storage with delayed withdrawals
**Structure**: Multiple time-locked recovery paths
**Security**: Attacker cannot immediately steal funds
**Flexibility**: Different time-locks for different amounts

### Stateful Contracts

**Purpose**: Smart contracts requiring persistent state
**Structure**: Script path with 32-byte state parameter
**Use Cases**: NFTs with royalties, token covenants, channel state
**Trade-off**: +33 bytes output size for state inclusion

---

## V. Security Considerations

**Reference**: See `src/script/interpreter.cpp:2074-2156` in lotusd for complete verification logic.

### Signature Requirements

- **Key path spending**: MUST use Schnorr signatures with SIGHASH_LOTUS
- **Script path spending**: Schnorr recommended but ECDSA supported
- Never reuse nonces (critical for Schnorr signatures)

### Best Practices

1. **Key Generation**: Use cryptographically secure random number generation
2. **Merkle Root**: For key-only outputs, use 32 zero bytes (not random)
3. **Tree Balance**: Balance script trees for optimal proof sizes
4. **State Parameter**: Use only when necessary (increases output size)

### Common Pitfalls

- ❌ Using ECDSA for key path spending (explicitly forbidden - must use 64-byte Schnorr)
- ❌ Not using SIGHASH_LOTUS for key path spending (required by consensus)
- ❌ Using only SIGHASH_LOTUS without base type (must combine: SIGHASH_ALL | SIGHASH_LOTUS = 0x61)
- ❌ Forgetting to tweak private key before signing key path
- ❌ Using x-coordinate only for commitment (Lotus requires full 33-byte compressed pubkey in scriptPubKey)
- ❌ Including 33-byte compressed pubkey in control block (control block uses 32-byte x-coordinate only)
- ❌ Wrong parity bit interpretation (Lotus encodes **internal** pubkey parity, not commitment parity)
- ❌ Calculating time-locks for 10-minute blocks (Lotus uses ~2-minute blocks)
- ❌ Control block size not being 33 + (32 × n) bytes
- ❌ Using leaf version other than 0xc0 (only TAPROOT_LEAF_TAPSCRIPT supported)

---

## Signature Requirements

### Key Path Spending

Taproot key path spending has strict signature requirements enforced at the consensus level:

**Signature Type**:

- **MUST** be 64-byte Schnorr signature (without sighash byte)
- **MUST NOT** be ECDSA (explicitly forbidden)
- Total 65 bytes when sighash byte appended

**Sighash Type**:

- **MUST** include `SIGHASH_LOTUS` (0x60) flag
- Typically combined with base type: `SIGHASH_ALL | SIGHASH_LOTUS = 0x61`
- Cannot use `SIGHASH_LOTUS` alone (must have base type like `SIGHASH_ALL`)

**Verification**:

- Signature checked via `CPubKey::VerifySchnorr()` (64-byte signature)
- Automatically selected based on signature length (64 bytes = Schnorr, else ECDSA)
- Enforcement: `CheckTransactionSignatureEncoding()` validates signature type
- Error if ECDSA used: `TAPROOT_KEY_SPEND_MUST_USE_SCHNORR_SIG`
- Error if no SIGHASH_LOTUS: `TAPROOT_KEY_SPEND_MUST_USE_LOTUS_SIGHASH`

### Script Path Spending

Script path spending has more flexible signature requirements:

**Signature Type**:

- Can use Schnorr (64 bytes) or ECDSA (DER-encoded, typically 70-72 bytes)
- Script determines which type(s) to accept
- No consensus-level restriction on signature type

**Sighash Type**:

- SIGHASH_LOTUS recommended but not required
- Can use SIGHASH_FORKID without SIGHASH_LOTUS
- Must comply with SCRIPT_ENABLE_SIGHASH_FORKID flag

### SIGHASH_LOTUS Features

- **Value**: 0x60 (96 decimal)
- **Implicitly includes SIGHASH_FORKID**: 0x40 always set
- **Efficient validation**: Uses Merkle trees for batch validation
- **Output commitment**: Commits to all spent outputs via Merkle tree
- **Required for key path**: Consensus rule for Taproot key path spending

### Example

```typescript
import { Transaction, Signature, PrivateKey } from 'lotus-sdk'

const tx = new Transaction()
// ... add inputs and outputs ...

// Correct: Schnorr with SIGHASH_ALL | SIGHASH_LOTUS for key path
const sighashType = Signature.SIGHASH_ALL | Signature.SIGHASH_LOTUS // 0x61
tx.sign(privateKey, sighashType, 'schnorr')

// Incorrect examples:
// ❌ tx.sign(privateKey, Signature.SIGHASH_LOTUS, 'schnorr') // Missing base type
// ❌ tx.sign(privateKey, Signature.SIGHASH_ALL, 'schnorr') // Missing SIGHASH_LOTUS
// ❌ tx.sign(privateKey, sighashType, 'ecdsa') // Wrong signature type for key path
```

---

## VI. Advanced Features

### State Parameter

The optional 32-byte state parameter enables stateful smart contracts by including additional data that gets pushed onto the script stack before execution.

**Size Impact**: Adds 33 bytes to output (36 bytes → 69 bytes total)

**Visibility**: State is visible on-chain

**Use Cases**:

- **Token Commitments**: Commit to token metadata or balances
- **Channel State**: Lightning Network channel state tracking
- **Covenant Data**: Spending restrictions and conditions
- **Oracle Signatures**: Include oracle data in output
- **NFT Metadata**: Compact metadata commitments

**Trade-off**: Increased size vs enhanced functionality

**Example**:

```
Given:
  commitment = <33-byte tweaked public key>
  state = <32-byte state data>

Script Construction:
  scriptPubKey = OP_SCRIPTTYPE || OP_1 || 0x21 || commitment || 0x20 || state

  Breakdown:
    OP_SCRIPTTYPE: 0x62 (1 byte)
    OP_1:          0x51 (1 byte)
    0x21:          33 (1 byte) - push opcode for commitment
    commitment:    33 bytes
    0x20:          32 (1 byte) - push opcode for state
    state:         32 bytes

  Total size: 69 bytes

Without state:
  scriptPubKey = OP_SCRIPTTYPE || OP_1 || 0x21 || commitment
  Total size: 36 bytes
```

---

## VII. Implementation Status

### Consensus Status

**Reference**: See `src/script/taproot.h` and `src/script/taproot.cpp` in lotusd.

Taproot is **fully enabled** and operational in Lotus consensus as of the genesis block. All Taproot validation rules are enforced by lotusd nodes.

### Activation Status

- **Enabled**: Genesis block (June 21, 2021)
- **Flag**: `SCRIPT_DISABLE_TAPROOT_SIGHASH_LOTUS` (when set, disables Taproot)
- **Default**: Taproot enabled on mainnet, testnet, and regtest

### Implementation Requirements

Any software implementing Taproot spending must:

1. **Schnorr Signature Support**: Implement 64-byte Schnorr signatures per BIP340
2. **SIGHASH_LOTUS Support**: Implement Lotus-specific sighash algorithm (0x60)
3. **Tagged Hashing**: Implement `tagged_hash(tag, msg) = SHA256(SHA256(tag) || SHA256(tag) || msg)`
4. **33-byte Commitment Handling**: Support compressed public keys (not x-only)
5. **Control Block Encoding**: Correctly encode/decode internal pubkey parity
6. **Merkle Proof Verification**: Implement lexicographic ordering for branches
7. **State Parameter Support**: Handle optional 32-byte state in outputs

### Ecosystem Support

- **lotusd**: Full consensus validation (reference implementation)
- **chronik_nng**: Complete P2TR indexing and script type detection
- **Lotus wallets**: Support for creating and spending Taproot outputs
- **RANK/RNKC protocols**: Accept votes and comments from Taproot addresses

---

## VIII. Verification Algorithms

### Verification Process

### Overview

The lotusd implementation uses `VerifyTaprootSpend()` to handle both key path and script path spending. The verification logic automatically determines the spending type based on stack contents.

### Common Checks (Both Paths)

1. **Taproot Enabled**: Verify the `SCRIPT_DISABLE_TAPROOT_SIGHASH_LOTUS` flag is not set
2. **Valid P2TR Script**: Confirm scriptPubKey matches Pay-To-Taproot format
3. **Non-Empty Stack**: Stack must have at least one element
4. **No Annex**: If stack has 2+ elements, last element must not start with 0x50 (annex not supported)

### Key Path Verification (Stack Size = 1)

When stack contains exactly one element:

1. **Extract**: Signature from stack, commitment pubkey from scriptPubKey
2. **Validate Signature Encoding**:
   - Must be exactly 64 bytes (Schnorr signature body)
   - Plus 1 byte sighash type = 65 bytes total
   - ECDSA forbidden (error: `TAPROOT_KEY_SPEND_MUST_USE_SCHNORR_SIG`)
3. **Validate Sighash**:
   - Must include SIGHASH_LOTUS flag
   - Error if missing: `TAPROOT_KEY_SPEND_MUST_USE_LOTUS_SIGHASH`
4. **Verify Pubkey Encoding**: Commitment must be valid 33-byte compressed pubkey
5. **Verify Signature**: Use Schnorr verification algorithm against transaction sighash
6. **Success**: Return true if signature valid

### Script Path Verification (Stack Size ≥ 2)

When stack contains two or more elements:

1. **Extract Components**:
   - Control block: Last stack element (`stacktop(-1)`)
   - Script: Second-to-last element (`stacktop(-2)`)
   - Arguments: Remaining stack elements (for script execution)

2. **Validate Control Block Size**:
   - Minimum: 33 bytes (TAPROOT_CONTROL_BASE_SIZE)
   - Maximum: 4,129 bytes (TAPROOT_CONTROL_MAX_SIZE)
   - Must be: 33 + (32 × n) where n ≤ 128
   - Error if invalid: `TAPROOT_WRONG_CONTROL_SIZE`

3. **Validate Leaf Version**:
   - Extract: `leaf_version = control_block[0] & TAPROOT_LEAF_MASK` (0xfe)
   - Must equal: 0xc0 (TAPROOT_LEAF_TAPSCRIPT)
   - Error if not: `TAPROOT_LEAF_VERSION_NOT_SUPPORTED`

4. **Verify Commitment** (VerifyTaprootCommitment):
   - Extract parity: `parity = control_block[0] & 0x01`
   - Extract x-coordinate: `x_coord = control_block[1:33]`
   - Reconstruct internal pubkey: `prefix = (parity == 1) ? 0x03 : 0x02`
   - Calculate leaf hash: `tagged_hash("TapLeaf", leaf_version || script)`
   - Walk merkle proof:
     ```
     merkle_hash = leaf_hash
     for each node in merkle_proof:
         if merkle_hash < node (lexicographic):
             merkle_hash = tagged_hash("TapBranch", merkle_hash || node)
         else:
             merkle_hash = tagged_hash("TapBranch", node || merkle_hash)
     ```
   - Calculate tweak: `tweak = tagged_hash("TapTweak", internal_pubkey || merkle_hash)`
   - Compute expected: `expected_commitment = internal_pubkey + tweak × G`
   - Compare: `expected_commitment == commitment_from_scriptPubKey`
   - Error if mismatch: `TAPROOT_VERIFY_COMMITMENT_FAILED`

5. **Prepare Stack**:
   - Pop control block and script from stack
   - If scriptPubKey has state (size == 69 bytes):
     - Extract state: bytes [37:69]
     - Push state onto stack

6. **Execute Script**:
   - Run revealed script with prepared stack
   - Script must complete successfully
   - Top stack element must be truthy (cast to bool == true)
   - Error if false: `EVAL_FALSE`

7. **Post-Conditions**: Verify script postconditions are met

### Error Codes

- `TAPROOT_PHASEOUT`: Taproot disabled by SCRIPT_DISABLE_TAPROOT_SIGHASH_LOTUS flag
- `SCRIPTTYPE_MALFORMED_SCRIPT`: Invalid scriptPubKey format
- `INVALID_STACK_OPERATION`: Empty stack
- `TAPROOT_ANNEX_NOT_SUPPORTED`: Annex element present (starts with 0x50)
- `TAPROOT_KEY_SPEND_MUST_USE_SCHNORR_SIG`: ECDSA used for key path (must be Schnorr)
- `TAPROOT_KEY_SPEND_MUST_USE_LOTUS_SIGHASH`: Missing SIGHASH_LOTUS flag
- `TAPROOT_VERIFY_SIGNATURE_FAILED`: Invalid Schnorr signature
- `TAPROOT_WRONG_CONTROL_SIZE`: Control block size invalid
- `TAPROOT_LEAF_VERSION_NOT_SUPPORTED`: Leaf version not 0xc0
- `TAPROOT_VERIFY_COMMITMENT_FAILED`: Merkle proof verification failed
- `EVAL_FALSE`: Script executed but returned false

---

## IX. Technical Reference

### Constants

**Reference**: See `src/script/taproot.h` and `src/script/script.h` in lotusd.

- `TAPROOT_LEAF_TAPSCRIPT`: 0xc0 (192) - Only supported leaf version
- `TAPROOT_LEAF_MASK`: 0xfe (254) - Mask to extract leaf version from control byte
- `OP_SCRIPTTYPE`: 0x62 (98) - Script type marker opcode (first byte of P2TR output)
- `TAPROOT_SCRIPTTYPE`: OP_1 = 0x51 (81) - Taproot version byte (second byte of P2TR output)
- `ADDRESS_TYPE_BYTE`: 2 - XAddress type for Taproot addresses

**Naming Clarification**:

- `OP_SCRIPTTYPE` (0x62): The **marker opcode** that identifies this as a script-type output (not a standard P2PKH/P2SH). This is the **first byte** of the scriptPubKey.
- `TAPROOT_SCRIPTTYPE` (0x51 = OP_1): The **version byte** that specifies this is Taproot version 1. This is the **second byte** of the scriptPubKey.

These are two different constants serving different purposes:

```
scriptPubKey structure:
  [OP_SCRIPTTYPE] [TAPROOT_SCRIPTTYPE] [0x21] [33-byte commitment]
  [    0x62    ] [      0x51        ] [0x21] [33-byte commitment]
  [   marker   ] [     version      ] [push] [   commitment     ]
```

- `TAPROOT_INTRO_SIZE`: 3 bytes - Size of OP_SCRIPTTYPE + OP_1 + push opcode
- `TAPROOT_SIZE_WITHOUT_STATE`: 36 bytes - scriptPubKey size without state
- `TAPROOT_SIZE_WITH_STATE`: 69 bytes - scriptPubKey size with state
- `TAPROOT_CONTROL_BASE_SIZE`: 33 bytes - Control block base (1 byte + 32 byte x-coord)
- `TAPROOT_CONTROL_NODE_SIZE`: 32 bytes - Size per merkle proof node
- `TAPROOT_CONTROL_MAX_NODE_COUNT`: 128 - Maximum merkle proof nodes
- `TAPROOT_CONTROL_MAX_SIZE`: 4,129 bytes - Maximum control block size (33 + 128×32)
- `TAPROOT_ANNEX_TAG`: 0x50 (80) - Annex marker (not supported in Lotus)
- `TAPROOT_SIGHASH_TYPE`: 0x61 - SIGHASH_ALL | SIGHASH_LOTUS (typical combination)

### Maximum Sizes

- **Script size**: 10,000 bytes (consensus limit per script)
- **Tree depth**: Maximum 128 proof nodes (TAPROOT_CONTROL_MAX_NODE_COUNT)
- **Control block**:
  - Minimum: 33 bytes (leaf with no siblings)
  - Maximum: 4,129 bytes (33 + 128 × 32)
  - Formula: 33 + (32 × n) where n ≤ 128
- **State**: Exactly 32 bytes (optional, when present adds 33 bytes to output)
- **Schnorr signature**: 64 bytes (without sighash byte)
- **Full signature**: 65 bytes (64-byte Schnorr + 1-byte sighash type)

### Implementation References

**lotusd Consensus Implementation**:

- `src/script/taproot.h` - Constants and function declarations
- `src/script/taproot.cpp` - Core Taproot verification logic (`VerifyTaprootCommitment`, `IsPayToTaproot`)
- `src/script/interpreter.cpp` - Main verification entry point `VerifyTaprootSpend()` (lines 2074-2156)
- `src/script/sigencoding.cpp` - Signature encoding validation (`CheckTransactionSignatureEncoding`)
- `src/script/sighashtype.h` - SIGHASH_LOTUS definition (0x60)
- `src/hash.h` - Tagged hash implementation (`TaggedHash` function)
- `src/pubkey.h` - Public key constants (COMPRESSED_SIZE = 33)

**Bitcoin BIPs (Conceptual Reference Only)**:

- [BIP340: Schnorr Signatures](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki) - Schnorr signature algorithm
- [BIP341: Taproot](https://github.com/bitcoin/bips/blob/master/bip-0341.mediawiki) - Conceptual basis (Lotus implementation differs significantly)
- [BIP342: Tapscript](https://github.com/bitcoin/bips/blob/master/bip-0342.mediawiki) - Script execution semantics

::alert{type="warning"}
**Important**: While Lotus Taproot is inspired by Bitcoin's BIP341, there are significant differences (33-byte vs 32-byte commitments, parity encoding, SIGHASH_LOTUS requirement). Always refer to the lotusd implementation as the authoritative source for Lotus consensus rules.
::

---

**Last Modified**: March 5, 2026  
**Revision**: Comprehensive technical specification review - removed client-side library references, clarified push opcodes and constant naming, added explicit consensus rules summary, enhanced cryptographic primitive documentation with lotusd source references, reorganized document structure to separate consensus rules from implementation details
