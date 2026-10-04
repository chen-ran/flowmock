const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

// Time-ordered identifiers: 10 characters of millisecond timestamp in
// Crockford base32 followed by 12 random ones, so ids sort by creation time.
export const newId = (prefix: string, nowMs: number = Date.now()): string => {
  let time = '';
  let remaining = Math.floor(nowMs);
  for (let index = 0; index < 10; index++) {
    time = ALPHABET[remaining % 32] + time;
    remaining = Math.floor(remaining / 32);
  }
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}_${time}${[...bytes].map(byte => ALPHABET[byte % 32]).join('')}`;
};
