const SERVER_BASE_URL = 'http://localhost:8000';
const SERVER_TIMEOUT_MS = 5000;

async function fetchWithTimeout(url, options = {}, timeoutMs = SERVER_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SERVER_FETCH') {
    (async () => {
      try {
        const { path, method = 'GET', body } = message;
        const url = `${SERVER_BASE_URL}${path}`;
        const resp = await fetchWithTimeout(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        const status = resp.status;
        let data = null;
        try {
          data = await resp.json();
        } catch (_err) {
          data = null;
        }
        sendResponse({ ok: resp.ok, status, data });
      } catch (err) {
        sendResponse({ ok: false, status: 0, error: String(err) });
      }
    })();
    return true; // keep the message channel open for async sendResponse
  }
});
