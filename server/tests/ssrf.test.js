import { describe, it, expect } from "vitest";
import env from "../config/env.js";
import { assertSafeUrl, isPublicIp } from "../services/ssrf.js";

describe("private target flag", () => {
  it("is off outside development", () => {
    expect(env.allowPrivateTargets).toBe(false);
  });
});

describe("isPublicIp", () => {
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });
});

describe("assertSafeUrl", () => {
  it.each([
    "http://localhost",
    "http://127.0.0.1",
    "http://127.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://[fe80::1]",
    "http://[fc00::1]",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5",
    "http://192.168.1.1",
    "http://172.16.0.1",
    "http://100.64.0.1",
    "http://0.0.0.0",
    "http://example.com:8080",
  ])("blocks %s", async (url) => {
    await expect(assertSafeUrl(url)).rejects.toMatchObject({
      code: "SSRF_BLOCKED",
    });
  });

  it.each([
    "not a url",
    "ftp://example.com",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "http://user:pass@example.com",
  ])("rejects %s as invalid", async (url) => {
    await expect(assertSafeUrl(url)).rejects.toMatchObject({
      code: "INVALID_URL",
    });
  });

  it("reports a hostname that does not exist", async () => {
    await expect(
      assertSafeUrl("https://no-such-site-12345.invalid"),
    ).rejects.toMatchObject({
      code: "DNS_FAILED",
    });
  });

  it("accepts public addresses", async () => {
    await expect(assertSafeUrl("http://8.8.8.8")).resolves.toBeInstanceOf(URL);
    await expect(
      assertSafeUrl("https://[2606:4700:4700::1111]"),
    ).resolves.toBeInstanceOf(URL);
  });
});
