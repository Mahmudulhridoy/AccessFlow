import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import env from "../config/env.js";
import { ScanError } from "../config/scanErrors.js";

export function isPublicIp(ip) {
  try {
    let addr = ipaddr.parse(ip);
    if (addr.kind() === "ipv6" && addr.isIPv4MappedAddress()) {
      addr = addr.toIPv4Address();
    }
    return addr.range() === "unicast";
  } catch {
    return false;
  }
}

export async function assertPublicHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "");

  let addresses;
  if (ipaddr.isValid(host)) {
    addresses = [host];
  } else {
    try {
      const results = await dns.lookup(host, { all: true });
      addresses = results.map((r) => r.address);
    } catch {
      throw new ScanError("DNS_FAILED");
    }
  }

  if (!env.allowPrivateTargets && addresses.some((a) => !isPublicIp(a))) {
    throw new ScanError("SSRF_BLOCKED");
  }
}

export async function assertSafeUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ScanError("INVALID_URL");
  }

  if (!["http:", "https:"].includes(url.protocol))
    throw new ScanError("INVALID_URL");
  if (url.username || url.password) throw new ScanError("INVALID_URL");
  if (url.port && !["80", "443"].includes(url.port))
    throw new ScanError("SSRF_BLOCKED");

  await assertPublicHost(url.hostname);
  return url;
}
