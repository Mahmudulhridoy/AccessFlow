import { assertPublicHost } from './ssrf.js';

// Same SSRF rules as scanWorker.runScan(): every browser request (redirects, iframes, scripts, images)
// must resolve to a public host on port 80/443. Used by the dataset collector; scanWorker keeps its own
// inline copy so Module 1 is untouched (it can be refactored to use this later).
export async function newGuardedContext(browser) {
  const context = await browser.newContext({ acceptDownloads: false });
  const checked = new Map();
  let blocked = false;
  const isAllowed = (host) => {
    if (!checked.has(host)) checked.set(host, assertPublicHost(host).then(() => true, () => false));
    return checked.get(host);
  };

  await context.route('**/*', async (route) => {
    const request = route.request();
    let target;
    try { target = new URL(request.url()); } catch { return route.abort(); }
    if (target.protocol === 'data:' || target.protocol === 'blob:') return route.continue();
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return route.abort();
    const portOk = !target.port || target.port === '80' || target.port === '443';
    if (!portOk || !(await isAllowed(target.hostname))) {
      if (request.isNavigationRequest() && !request.frame().parentFrame()) blocked = true;
      return route.abort();
    }
    return route.continue();
  });
  return { context, wasBlocked: () => blocked };
}
