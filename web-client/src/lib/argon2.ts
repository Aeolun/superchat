/**
 * Local copy of @noble/hashes argon2id with the minimum salt length check removed.
 * Go's argon2.IDKey accepts any salt length, but noble enforces >= 8 bytes per RFC 9106.
 * Since we use the nickname as salt and nicknames can be < 8 chars, we need to skip that check.
 *
 * Source: @noble/hashes v2.x src/argon2.ts (MIT license)
 * Only change: removed `salt.length < 8` check in argon2Init.
 */
import { blake2b } from '@noble/hashes/blake2.js';
import { anumber, clean, kdfInputToBytes, u32, u8, type KDFInput } from '@noble/hashes/utils.js';

// Inlined from @noble/hashes/_u64 (not exported in package.json "exports" map)
const rotrSH = (h: number, l: number, s: number): number => (h >>> s) | (l << (32 - s));
const rotrSL = (h: number, l: number, s: number): number => (h << (32 - s)) | (l >>> s);
const rotrBH = (h: number, l: number, s: number): number => (h << (64 - s)) | (l >>> (s - 32));
const rotrBL = (h: number, l: number, s: number): number => (h >>> (s - 32)) | (l << (64 - s));
const rotr32H = (_h: number, l: number): number => l;
const rotr32L = (h: number, _l: number): number => h;
const add3L = (Al: number, Bl: number, Cl: number): number => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
const add3H = (low: number, Ah: number, Bh: number, Ch: number): number =>
  (Ah + Bh + Ch + ((low / 2 ** 32) | 0)) | 0;

const AT = { Argond2d: 0, Argon2i: 1, Argon2id: 2 } as const;
type Types = (typeof AT)[keyof typeof AT];

const ARGON2_SYNC_POINTS = 4;
const abytesOrZero = (buf?: KDFInput, errorTitle = '') => {
  if (buf === undefined) return Uint8Array.of();
  return kdfInputToBytes(buf, errorTitle);
};

function mul(a: number, b: number) {
  const aL = a & 0xffff;
  const aH = a >>> 16;
  const bL = b & 0xffff;
  const bH = b >>> 16;
  const ll = Math.imul(aL, bL);
  const hl = Math.imul(aH, bL);
  const lh = Math.imul(aL, bH);
  const hh = Math.imul(aH, bH);
  const carry = (ll >>> 16) + (hl & 0xffff) + lh;
  const high = (hh + (hl >>> 16) + (carry >>> 16)) | 0;
  const low = (carry << 16) | (ll & 0xffff);
  return { h: high, l: low };
}

function mul2(a: number, b: number) {
  const { h, l } = mul(a, b);
  return { h: ((h << 1) | (l >>> 31)) & 0xffff_ffff, l: (l << 1) & 0xffff_ffff };
}

function blamka(Ah: number, Al: number, Bh: number, Bl: number) {
  const { h: Ch, l: Cl } = mul2(Al, Bl);
  const Rll = add3L(Al, Bl, Cl);
  return { h: add3H(Rll, Ah, Bh, Ch), l: Rll | 0 };
}

const A2_BUF = new Uint32Array(256);

function G(a: number, b: number, c: number, d: number) {
  let Al = A2_BUF[2*a], Ah = A2_BUF[2*a + 1];
  let Bl = A2_BUF[2*b], Bh = A2_BUF[2*b + 1];
  let Cl = A2_BUF[2*c], Ch = A2_BUF[2*c + 1];
  let Dl = A2_BUF[2*d], Dh = A2_BUF[2*d + 1];

  ({ h: Ah, l: Al } = blamka(Ah, Al, Bh, Bl));
  ({ Dh, Dl } = { Dh: Dh ^ Ah, Dl: Dl ^ Al });
  ({ Dh, Dl } = { Dh: rotr32H(Dh, Dl), Dl: rotr32L(Dh, Dl) });

  ({ h: Ch, l: Cl } = blamka(Ch, Cl, Dh, Dl));
  ({ Bh, Bl } = { Bh: Bh ^ Ch, Bl: Bl ^ Cl });
  ({ Bh, Bl } = { Bh: rotrSH(Bh, Bl, 24), Bl: rotrSL(Bh, Bl, 24) });

  ({ h: Ah, l: Al } = blamka(Ah, Al, Bh, Bl));
  ({ Dh, Dl } = { Dh: Dh ^ Ah, Dl: Dl ^ Al });
  ({ Dh, Dl } = { Dh: rotrSH(Dh, Dl, 16), Dl: rotrSL(Dh, Dl, 16) });

  ({ h: Ch, l: Cl } = blamka(Ch, Cl, Dh, Dl));
  ({ Bh, Bl } = { Bh: Bh ^ Ch, Bl: Bl ^ Cl });
  ({ Bh, Bl } = { Bh: rotrBH(Bh, Bl, 63), Bl: rotrBL(Bh, Bl, 63) });

  ((A2_BUF[2 * a] = Al), (A2_BUF[2 * a + 1] = Ah));
  ((A2_BUF[2 * b] = Bl), (A2_BUF[2 * b + 1] = Bh));
  ((A2_BUF[2 * c] = Cl), (A2_BUF[2 * c + 1] = Ch));
  ((A2_BUF[2 * d] = Dl), (A2_BUF[2 * d + 1] = Dh));
}

function P(
  v00: number, v01: number, v02: number, v03: number, v04: number, v05: number, v06: number, v07: number,
  v08: number, v09: number, v10: number, v11: number, v12: number, v13: number, v14: number, v15: number,
) {
  G(v00, v04, v08, v12);
  G(v01, v05, v09, v13);
  G(v02, v06, v10, v14);
  G(v03, v07, v11, v15);
  G(v00, v05, v10, v15);
  G(v01, v06, v11, v12);
  G(v02, v07, v08, v13);
  G(v03, v04, v09, v14);
}

function block(x: Uint32Array, xPos: number, yPos: number, outPos: number, needXor: boolean) {
  for (let i = 0; i < 256; i++) A2_BUF[i] = x[xPos + i] ^ x[yPos + i];
  for (let i = 0; i < 128; i += 16) {
    P(i, i+1, i+2, i+3, i+4, i+5, i+6, i+7, i+8, i+9, i+10, i+11, i+12, i+13, i+14, i+15);
  }
  for (let i = 0; i < 16; i += 2) {
    P(i, i+1, i+16, i+17, i+32, i+33, i+48, i+49, i+64, i+65, i+80, i+81, i+96, i+97, i+112, i+113);
  }
  if (needXor) for (let i = 0; i < 256; i++) x[outPos + i] ^= A2_BUF[i] ^ x[xPos + i] ^ x[yPos + i];
  else for (let i = 0; i < 256; i++) x[outPos + i] = A2_BUF[i] ^ x[xPos + i] ^ x[yPos + i];
  clean(A2_BUF);
}

function Hp(A: Uint32Array, dkLen: number) {
  const A8 = u8(A);
  const T = new Uint32Array(1);
  const T8 = u8(T);
  T[0] = dkLen;
  if (dkLen <= 64) return blake2b.create({ dkLen }).update(T8).update(A8).digest();
  const out = new Uint8Array(dkLen);
  let V = blake2b.create({}).update(T8).update(A8).digest();
  let pos = 0;
  out.set(V.subarray(0, 32));
  pos += 32;
  for (; dkLen - pos > 64; pos += 32) {
    const Vh = blake2b.create({}).update(V);
    Vh.digestInto(V);
    Vh.destroy();
    out.set(V.subarray(0, 32), pos);
  }
  out.set(blake2b(V, { dkLen: dkLen - pos }), pos);
  clean(V, T);
  return u32(out);
}

function indexAlpha(
  r: number, s: number, laneLen: number, segmentLen: number,
  index: number, randL: number, sameLane: boolean = false
) {
  let area: number;
  if (r === 0) {
    if (s === 0) area = index - 1;
    else if (sameLane) area = s * segmentLen + index - 1;
    else area = s * segmentLen + (index == 0 ? -1 : 0);
  } else if (sameLane) area = laneLen - segmentLen + index - 1;
  else area = laneLen - segmentLen + (index == 0 ? -1 : 0);
  const startPos = r !== 0 && s !== ARGON2_SYNC_POINTS - 1 ? (s + 1) * segmentLen : 0;
  const rel = area - 1 - mul(area, mul(randL, randL).h).h;
  return (startPos + rel) % laneLen;
}

type ArgonOpts = {
  t: number;
  m: number;
  p: number;
  version?: number;
  key?: KDFInput;
  personalization?: KDFInput;
  dkLen?: number;
  maxmem?: number;
};

const maxUint32 = Math.pow(2, 32);
function isU32(num: number) {
  return Number.isSafeInteger(num) && num >= 0 && num < maxUint32;
}

function argon2Opts(opts: ArgonOpts) {
  const merged: any = { version: 0x13, dkLen: 32, maxmem: maxUint32 - 1 };
  for (const [k, v] of Object.entries(opts)) if (v !== undefined) merged[k] = v;
  const { dkLen, p, m, t, version } = merged;
  if (!isU32(dkLen) || dkLen < 4) throw new Error('"dkLen" must be 4..');
  if (!isU32(p) || p < 1 || p >= Math.pow(2, 24)) throw new Error('"p" must be 1..2^24');
  if (!isU32(m)) throw new Error('"m" must be 0..2^32');
  if (!isU32(t) || t < 1) throw new Error('"t" (iterations) must be 1..2^32');
  anumber(merged.asyncTick ?? 10, 'asyncTick');
  if (!isU32(m) || m < 8 * p) throw new Error('"m" (memory) must be at least 8*p bytes');
  if (version !== 0x10 && version !== 0x13) throw new Error('"version" must be 0x10 or 0x13');
  return merged;
}

function argon2Init(password: KDFInput, salt: KDFInput, type: Types, opts: ArgonOpts) {
  password = kdfInputToBytes(password, 'password');
  salt = kdfInputToBytes(salt, 'salt');
  if (!isU32(password.length)) throw new Error('"password" must be of length 1..4Gb');
  // NOTE: salt length >= 8 check intentionally removed (Go accepts any length)
  if (!isU32(salt.length) || salt.length < 1) throw new Error('"salt" must be of length 1..4Gb');
  if (!Object.values(AT).includes(type)) throw new Error('"type" was invalid');
  let { p, dkLen, m, t, version, key, personalization, maxmem } = argon2Opts(opts);
  key = abytesOrZero(key, 'key');
  personalization = abytesOrZero(personalization, 'personalization');

  const h = blake2b.create();
  const BUF = new Uint32Array(1);
  const BUF8 = u8(BUF);
  for (const item of [p, dkLen, m, t, version, type]) {
    BUF[0] = item;
    h.update(BUF8);
  }
  for (const i of [password, salt, key, personalization]) {
    BUF[0] = i.length;
    h.update(BUF8).update(i);
  }
  const H0 = new Uint32Array(18);
  const H0_8 = u8(H0);
  h.digestInto(H0_8);

  const mP = 4 * p * Math.floor(m / (ARGON2_SYNC_POINTS * p));
  const laneLen = Math.floor(mP / p);
  const segmentLen = Math.floor(laneLen / ARGON2_SYNC_POINTS);
  const memUsed = mP * 256;
  if (!isU32(maxmem) || memUsed > maxmem)
    throw new Error('"maxmem" expected <2**32, got: maxmem=' + maxmem + ', memused=' + memUsed);
  const B = new Uint32Array(memUsed);
  for (let l = 0; l < p; l++) {
    const i = 256 * laneLen * l;
    H0[17] = l;
    H0[16] = 0;
    B.set(Hp(H0, 1024), i);
    H0[16] = 1;
    B.set(Hp(H0, 1024), i + 256);
  }
  clean(BUF, H0);
  return { type, mP, p, t, version, B, laneLen, lanes: p, segmentLen, dkLen };
}

function argon2Output(B: Uint32Array, p: number, laneLen: number, dkLen: number) {
  const B_final = new Uint32Array(256);
  for (let l = 0; l < p; l++)
    for (let j = 0; j < 256; j++) B_final[j] ^= B[256 * (laneLen * l + laneLen - 1) + j];
  const res = u8(Hp(B_final, dkLen));
  clean(B_final);
  return res;
}

function processBlock(
  B: Uint32Array, address: Uint32Array, l: number, r: number, s: number,
  index: number, laneLen: number, segmentLen: number, lanes: number,
  offset: number, prev: number, dataIndependent: boolean, needXor: boolean
) {
  if (offset % laneLen) prev = offset - 1;
  let randL, randH;
  if (dataIndependent) {
    const i128 = index % 128;
    if (i128 === 0) {
      address[256 + 12]++;
      block(address, 256, 2 * 256, 0, false);
      block(address, 0, 2 * 256, 0, false);
    }
    randL = address[2 * i128];
    randH = address[2 * i128 + 1];
  } else {
    const T = 256 * prev;
    randL = B[T];
    randH = B[T + 1];
  }
  const refLane = r === 0 && s === 0 ? l : randH % lanes;
  const refPos = indexAlpha(r, s, laneLen, segmentLen, index, randL, refLane == l);
  const refBlock = laneLen * refLane + refPos;
  block(B, 256 * prev, 256 * refBlock, offset * 256, needXor);
}

/** argon2id without minimum salt length enforcement (compatible with Go's argon2.IDKey) */
export function argon2id(password: KDFInput, salt: KDFInput, opts: ArgonOpts): Uint8Array {
  const { mP, p, t, version, B, laneLen, lanes, segmentLen, dkLen } = argon2Init(
    password, salt, AT.Argon2id, opts
  );
  const address = new Uint32Array(3 * 256);
  address[256 + 6] = mP;
  address[256 + 8] = t;
  address[256 + 10] = AT.Argon2id;
  for (let r = 0; r < t; r++) {
    const needXor = r !== 0 && version === 0x13;
    address[256 + 0] = r;
    for (let s = 0; s < ARGON2_SYNC_POINTS; s++) {
      address[256 + 4] = s;
      const dataIndependent = AT.Argon2id === AT.Argon2i || (AT.Argon2id === AT.Argon2id && r === 0 && s < 2);
      for (let l = 0; l < p; l++) {
        address[256 + 2] = l;
        address[256 + 12] = 0;
        let startPos = 0;
        if (r === 0 && s === 0) {
          startPos = 2;
          if (dataIndependent) {
            address[256 + 12]++;
            block(address, 256, 2 * 256, 0, false);
            block(address, 0, 2 * 256, 0, false);
          }
        }
        let offset = l * laneLen + s * segmentLen + startPos;
        let prev = offset % laneLen ? offset - 1 : offset + laneLen - 1;
        for (let index = startPos; index < segmentLen; index++, offset++, prev++) {
          processBlock(B, address, l, r, s, index, laneLen, segmentLen, lanes, offset, prev, dataIndependent, needXor);
        }
      }
    }
  }
  clean(address);
  return argon2Output(B, p, laneLen, dkLen);
}
