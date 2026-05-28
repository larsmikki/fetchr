import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// CIDR ranges that must NOT be reachable from server-initiated fetches (SSRF
// protection). Each entry is [network base, prefix length].
const PRIVATE_V4_CIDRS: Array<[string, number]> = [
  ['10.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['0.0.0.0', 8],
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null;
  // Use unsigned shift to keep result non-negative
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function v4InCidr(ip: string, cidr: [string, number]): boolean {
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(cidr[0]);
  if (ipInt == null || netInt == null) return false;
  const bits = cidr[1];
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

function isBlockedV4(ip: string): boolean {
  if (PRIVATE_V4_CIDRS.some(r => v4InCidr(ip, r))) return true;
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
