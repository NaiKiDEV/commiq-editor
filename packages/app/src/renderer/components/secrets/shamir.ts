import { gf256Add, gf256Mul, gf256Div } from './gf256';

export type Share = { x: number; data: Uint8Array };

/** Split a secret into `n` shares with threshold `k`. */
export function splitSecret(secret: Uint8Array, n: number, k: number): Share[] {
  if (k < 2 || k > n || n > 255) {
    throw new Error(`Invalid parameters: need 2 <= k(${k}) <= n(${n}) <= 255`);
  }

  const shares: Share[] = Array.from({ length: n }, (_, i) => ({
    x: i + 1,
    data: new Uint8Array(secret.length),
  }));

  const coeffs = new Uint8Array(k - 1);

  for (let byteIdx = 0; byteIdx < secret.length; byteIdx++) {
    // Random polynomial coefficients (degree 1..k-1), coefficient[0] is the secret byte
    crypto.getRandomValues(coeffs);

    for (let shareIdx = 0; shareIdx < n; shareIdx++) {
      const x = shareIdx + 1;
      let y = secret[byteIdx];
      let xPow = x;
      for (let c = 0; c < coeffs.length; c++) {
        y = gf256Add(y, gf256Mul(coeffs[c], xPow));
        xPow = gf256Mul(xPow, x);
      }
      shares[shareIdx].data[byteIdx] = y;
    }
  }

  return shares;
}

/** Reconstruct the secret from `k` or more shares using Lagrange interpolation at x=0. */
export function reconstructSecret(shares: Share[]): Uint8Array {
  if (shares.length < 2) throw new Error('Need at least 2 shares');

  const len = shares[0].data.length;
  const result = new Uint8Array(len);

  for (let byteIdx = 0; byteIdx < len; byteIdx++) {
    let secret = 0;
    for (let i = 0; i < shares.length; i++) {
      let basis = 1;
      for (let j = 0; j < shares.length; j++) {
        if (i === j) continue;
        // basis *= x_j / (x_j - x_i) evaluated at x=0, so: basis *= (0 - x_j) / (x_i - x_j)
        // In GF(256), subtraction is XOR (same as addition)
        const xj = shares[j].x;
        const xi = shares[i].x;
        basis = gf256Mul(basis, gf256Div(xj, gf256Add(xi, xj)));
      }
      secret = gf256Add(secret, gf256Mul(shares[i].data[byteIdx], basis));
    }
    result[byteIdx] = secret;
  }

  return result;
}

/** Encode a share as a hex string: first byte is x-coordinate, rest is data. */
export function encodeShare(share: Share): string {
  const bytes = new Uint8Array(1 + share.data.length);
  bytes[0] = share.x;
  bytes.set(share.data, 1);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Decode a hex string back into a Share. */
export function decodeShare(hex: string): Share {
  const clean = hex.replace(/\s/g, '').toLowerCase();
  if (clean.length < 4 || clean.length % 2 !== 0) {
    throw new Error('Invalid share format');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    if (isNaN(bytes[i])) throw new Error('Invalid hex character');
  }
  return { x: bytes[0], data: bytes.slice(1) };
}
