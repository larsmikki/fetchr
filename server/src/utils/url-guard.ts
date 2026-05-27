import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const PRIVATE_V4_RANGES: Array<[number, number, number]> = [
  [10, 0, 8],
  [127, 0, 8],
  [169, 254, 16],
  [172, 16, 12],
  [192, 168, 16],
  [0, 0, 8],
];

function v4InRange(ip: string, prefix: [number, number, number]): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return false;
  const [a, b, bits] = prefix;
  if (bits >= 8 && parts[0] !== a) return false;
  if (bits >= 16 && parts[1] !== b) return false;
  return true;
}

function isBlockedV4(ip: string): boolean {
  if (PRIVATE_V4_RANGES.some(r => v4InRange(ip, r))) return true;
  const first = Number(ip.split('.')[0]);
  if (first >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d)
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice('::ffff:'.length);
    if (isIP(v4) === 4) return isBlockedV4(v4);
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isBlockedV4(ip);
  if (fam === 6) return isBlockedV6(ip);
  return true;
}

export interface UrlGuardResult {
  ok: boolean;
  reason?: string;
  url?: URL;
}

const BLOCKED_HOSTNAME_SUFFIXES = ['.local', '.internal', '.localhost'];
const BLOCKED_HOSTNAMES = new Set(['localhost', 'broadcasthost']);

export async function guardOutboundUrl(input: string): Promise<UrlGuardResult> {
  let url: URL;
  try { url = new URL(input); } catch { return { ok: false, reason: 'invalid url' }; }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'only http(s) allowed' };
  }

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return { ok: false, reason: 'blocked hostname' };
  if (BLOCKED_HOSTNAME_SUFFIXES.some(s => host.endsWith(s))) {
    return { ok: false, reason: 'blocked hostname suffix' };
  }

  if (isIP(host)) {
    if (isBlockedIp(host)) return { ok: false, reason: 'blocked ip literal' };
    return { ok: true, url };
  }

  try {
    const resolved = await lookup(host, { all: true });
    for (const r of resolved) {
      if (isBlockedIp(r.address)) return { ok: false, reason: `resolves to blocked ip ${r.address}` };
    }
  } catch (err) {
    return { ok: false, reason: `dns lookup failed: ${(err as Error).message}` };
  }

  return { ok: true, url };
}
