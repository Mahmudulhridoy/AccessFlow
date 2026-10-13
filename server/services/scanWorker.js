import PQueue from "p-queue";
import { chromium } from "playwright";
import env from "../config/env.js";
import { ScanError, friendlyMessage } from "../config/scanErrors.js";
import * as Scan from "../models/scan.model.js";
import { assertSafeUrl, assertPublicHost } from "./ssrf.js";

const NAVIGATION_LIMIT = 30 * 1000;
const TOTAL_LIMIT = 120 * 1000;
const SETTLE_DELAY = 1000;

const queue = new PQueue({ concurrency: 2 });
let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      args: env.isProd ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
    });
  }
  return browser;
}

function toErrorCode(err, { blocked, timedOut }) {
  if (err instanceof ScanError) return err.code;
  if (blocked) return "SSRF_BLOCKED";
  if (timedOut || err.name === "TimeoutError") return "TIMEOUT";

  const message = err.message || "";
  if (message.includes("ERR_NAME_NOT_RESOLVED")) return "DNS_FAILED";
  if (message.includes("Download is starting")) return "NON_HTML";
  if (/crash/i.test(message)) return "RENDER_CRASH";
  if (message.includes("net::ERR_")) return "HTTP_ERROR";
  return "INTERNAL";
}

async function runScan(scanId) {
  const scan = await Scan.findById(scanId);
  if (!scan) return;

  const durations = {};
  let lapStart = Date.now();
  const lap = (name) => {
    durations[name] = Date.now() - lapStart;
    lapStart = Date.now();
  };

  let context;
  let blocked = false;
  let timedOut = false;

  const hardStop = setTimeout(() => {
    timedOut = true;
    context?.close().catch(() => {});
  }, TOTAL_LIMIT);

  try {
    await Scan.setStatus(scanId, "VALIDATING");
    await assertSafeUrl(scan.scannedUrl);
    lap("validating");

    await Scan.setStatus(scanId, "RENDERING");
    context = await (await getBrowser()).newContext({ acceptDownloads: false });

    const checked = new Map();
    const isAllowed = (host) => {
      if (!checked.has(host)) {
        checked.set(
          host,
          assertPublicHost(host).then(
            () => true,
            () => false,
          ),
        );
      }
      return checked.get(host);
    };

    // Every request the browser makes (redirects, iframes, images, scripts) goes through here.
    await context.route("**/*", async (route) => {
      const request = route.request();

      let target;
      try {
        target = new URL(request.url());
      } catch {
        return route.abort();
      }

      if (target.protocol === "data:" || target.protocol === "blob:")
        return route.continue();
      if (target.protocol !== "http:" && target.protocol !== "https:")
        return route.abort();

      const portOk =
        !target.port || target.port === "80" || target.port === "443";
      if (!portOk || !(await isAllowed(target.hostname))) {
        if (request.isNavigationRequest() && !request.frame().parentFrame())
          blocked = true;
        return route.abort();
      }
      return route.continue();
    });

    const page = await context.newPage();
    const response = await page.goto(scan.scannedUrl, {
      waitUntil: "load",
      timeout: NAVIGATION_LIMIT,
    });
    await page.waitForTimeout(SETTLE_DELAY);

    if (!response) throw new ScanError("HTTP_ERROR");
    const status = response.status();
    if (status === 403 || status === 429) throw new ScanError("TARGET_BLOCKED");
    if (status >= 400) throw new ScanError("HTTP_ERROR");

    const type = response.headers()["content-type"] || "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type))
      throw new ScanError("NON_HTML");
    lap("rendering");

    // Module 2 plugs in here: axe-core analysis, ML priority, LLM explanations.

    await Scan.finish(scanId, {
      status: "COMPLETED",
      finalUrl: page.url(),
      stageDurations: durations,
    });
  } catch (err) {
    const code = toErrorCode(err, { blocked, timedOut });
    await Scan.finish(scanId, {
      status: "FAILED",
      errorCode: code,
      errorMessage: friendlyMessage(code),
      stageDurations: durations,
    });
  } finally {
    clearTimeout(hardStop);
    await context?.close().catch(() => {});
  }
}

export function enqueueScan(scanId) {
  queue
    .add(() => runScan(scanId))
    .catch((err) => console.error("Scan job failed", err));
}
