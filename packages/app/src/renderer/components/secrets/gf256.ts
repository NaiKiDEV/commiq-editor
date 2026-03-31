// GF(256) finite field arithmetic using irreducible polynomial x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
// Note: 0x11b (AES polynomial) does NOT have 2 as a primitive element (order 51).
// 0x11d is the standard polynomial for Shamir's Secret Sharing with generator 2.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

// Build lookup tables
let x = 1;
for (let i = 0; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x = x << 1;
  if (x & 0x100) x ^= 0x11d;
}
// Extend EXP table for easy modular access
for (let i = 255; i < 512; i++) {
  EXP[i] = EXP[i - 255];
}

export function gf256Add(a: number, b: number): number {
  return a ^ b;
}

export function gf256Mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

export function gf256Div(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero in GF(256)");
  if (a === 0) return 0;
  return EXP[(LOG[a] + 255 - LOG[b]) % 255];
}
