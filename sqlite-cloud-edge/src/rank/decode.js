function sentimentFromOpcode(opcodeHex) {
  const op = String(opcodeHex || '').toLowerCase();
  if (op === '51') return 'positive';
  if (op === '52') return 'negative';
  if (op === '53') return 'negative';
  return 'neutral';
}

function toAsciiFromHex(hex) {
  const clean = String(hex || '').replace(/[^0-9a-f]/gi, '');
  if (!clean || clean.length % 2 !== 0) return '';
  let out = '';
  for (let i = 0; i < clean.length; i += 2) {
    const b = Number.parseInt(clean.slice(i, i + 2), 16);
    out += b >= 32 && b <= 126 ? String.fromCharCode(b) : '\x00';
  }
  return out;
}

function extractProfileId(hex) {
  const text = toAsciiFromHex(hex);
  const matches = text.match(/[A-Za-z0-9_]{3,32}/g) || [];
  if (!matches.length) return '';
  matches.sort((a, b) => b.length - a.length);
  return matches[0];
}

function parsePostIdFromTail(hex) {
  const clean = String(hex || '').replace(/[^0-9a-f]/gi, '').toLowerCase();
  if (clean.length < 16) return '';
  const tail = clean.slice(-16);
  const bytes = tail.match(/../g) || [];
  if (bytes.length !== 8) return '';
  const bigEndian = bytes.join('');
  try {
    const asBig = BigInt('0x' + bigEndian);
    return asBig > 0n ? asBig.toString() : '';
  } catch (_) {
    return '';
  }
}

function isLikelyTwitterSnowflake(postId) {
  const text = String(postId || '');
  if (!/^[0-9]{15,20}$/.test(text)) return false;
  try {
    const n = BigInt(text);
    // Conservative bounds for modern IDs.
    return n >= 1000000000000000n && n <= 9999999999999999999n;
  } catch (_) {
    return false;
  }
}

export function decodeRankFromOpReturnHex(opReturnHex) {
  const hex = String(opReturnHex || '').toLowerCase();
  // RANK prefix in hex is 52414e4b
  const rankPos = hex.indexOf('52414e4b');
  if (!hex || rankPos < 0) return null;

  // Opcode right after "RANK" bytes, if present.
  const opcodePos = rankPos + 8;
  const opcodeHex = hex.slice(opcodePos, opcodePos + 2);
  const sentiment = sentimentFromOpcode(opcodeHex);

  const profileIdRaw = extractProfileId(hex);
  const profileId = /^[a-z0-9_]{3,32}$/i.test(profileIdRaw) ? profileIdRaw : '';
  const postIdRaw = parsePostIdFromTail(hex);
  const postId = isLikelyTwitterSnowflake(postIdRaw) ? postIdRaw : '';
  // Avoid bogus decodes like "RANK"/"RANKQ" and missing post ids.
  const reserved = new Set(['RANK', 'RANKQ', 'RANKQC', 'RNK', 'RNKC']);
  const valid = profileId && !reserved.has(profileId.toUpperCase()) && postId ? 1 : 0;

  return {
    protocolId: 'rank',
    protocolVersion: 'v1',
    valid,
    sentiment,
    platform: 'twitter',
    profileId,
    postId,
    entityType: 'vote',
    entityKey: profileId ? `${profileId}:${postId || ''}` : '',
    burnSats: 0,
    payloadHex: hex
  };
}

