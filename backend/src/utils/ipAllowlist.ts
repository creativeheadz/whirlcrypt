import ipaddr, { IPv4, IPv6 } from 'ipaddr.js';

/** Most uploads need one office or home IP; ten entries is generous. */
export const MAX_ALLOWED_IPS = 10;

export type ParseAllowedIpsResult =
  | { ok: true; ips: string[] }
  | { ok: false; error: string };

/** Parse one entry (bare IP or CIDR) to canonical form, or null if invalid. */
function parseEntry(text: string): string | null {
  const value = text.trim();
  if (!value) {
    return null;
  }
  try {
    if (value.includes('/')) {
      const [network, prefix] = ipaddr.parseCIDR(value);
      const maxPrefix = network.kind() === 'ipv6' ? 128 : 32;
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
        return null;
      }
      return `${network.toString()}/${prefix}`;
    }
    return ipaddr.parse(value).toString();
  } catch {
    return null;
  }
}

/**
 * Validate raw uploader input (comma/newline-separated string or array of
 * strings) into canonical allowlist entries. Empty input is valid and means
 * unrestricted; anything malformed is a caller-facing 400 message.
 */
export function parseAllowedIps(raw: unknown): ParseAllowedIpsResult {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,\n]/)
      : null;
  if (items === null) {
    return { ok: false, error: 'allowedIps must be a comma-separated string' };
  }
  const ips: string[] = [];
  for (const item of items) {
    const text = String(item ?? '').trim();
    if (!text) {
      continue;
    }
    const parsed = parseEntry(text);
    if (!parsed) {
      return { ok: false, error: `Invalid IP address or CIDR range: "${text}"` };
    }
    if (!ips.includes(parsed)) {
      ips.push(parsed);
    }
  }
  if (ips.length > MAX_ALLOWED_IPS) {
    return { ok: false, error: `At most ${MAX_ALLOWED_IPS} IP addresses or ranges allowed` };
  }
  return { ok: true, ips };
}

type ParsedAddr = IPv4 | IPv6;

function normalize(addr: ParsedAddr): ParsedAddr {
  // Unwrap IPv4-mapped IPv6 so ::ffff:1.2.3.4 matches 1.2.3.4 rules.
  if (addr.kind() === 'ipv6' && (addr as IPv6).isIPv4MappedAddress()) {
    return (addr as IPv6).toIPv4Address();
  }
  return addr;
}

/**
 * True when clientIp is covered by the allowlist. An empty or missing list
 * means unrestricted. Anything unparseable fails closed (denied).
 */
export function isIpAllowed(clientIp: string, allowed: string[] | undefined | null): boolean {
  if (!allowed || allowed.length === 0) {
    return true;
  }
  let client: ParsedAddr;
  try {
    client = normalize(ipaddr.parse(clientIp));
  } catch {
    return false;
  }
  for (const entry of allowed) {
    try {
      if (entry.includes('/')) {
        const [network, prefix] = ipaddr.parseCIDR(entry);
        const normalized = normalize(network);
        if (normalized.kind() !== client.kind()) {
          continue;
        }
        if (client.match(normalized as IPv4 & IPv6, prefix)) {
          return true;
        }
      } else if (normalize(ipaddr.parse(entry)).toString() === client.toString()) {
        return true;
      }
    } catch {
      // Corrupt stored entry: skip it (fail closed overall below).
      continue;
    }
  }
  return false;
}
