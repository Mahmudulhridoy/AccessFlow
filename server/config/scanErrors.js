const messages = {
  INVALID_URL: "The URL is not valid. Check the address and try again.",
  SSRF_BLOCKED:
    "This address points to a private or restricted network, so it can't be scanned.",
  DNS_FAILED: "The website address could not be found.",
  TIMEOUT: "The page took too long to load.",
  TARGET_BLOCKED: "The website refused the scan or asked for a bot check.",
  NON_HTML:
    "This URL does not lead to a web page. It may be a file or an image.",
  HTTP_ERROR: "The website returned an error page.",
  RENDER_CRASH: "The browser crashed while loading the page.",
  AXE_FAILED: "The accessibility analysis could not finish.",
  INTERNAL: "Something went wrong on our side. Please try again.",
};

export const ERROR_CODES = Object.keys(messages);

export const friendlyMessage = (code) => messages[code] || messages.INTERNAL;

export class ScanError extends Error {
  constructor(code) {
    super(friendlyMessage(code));
    this.code = messages[code] ? code : "INTERNAL";
  }
}
