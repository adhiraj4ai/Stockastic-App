from __future__ import annotations

import json
import random
import re
import time
from urllib.parse import urlencode

from django.conf import settings

from .exceptions import TearsheetAuthError, TearsheetUnavailableError

_FSK_RE = re.compile(r"[?&]fsk=([^&]+)")
_STEALTH = "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
_FETCH_JS = """async (u) => {
    const r = await fetch(u, {headers:{'X-Requested-With':'XMLHttpRequest'},
                             credentials:'include'});
    const t = await r.text();
    return {ok: r.ok, status: r.status, body: t};
}"""


def extract_fsk(url: str) -> str | None:
    match = _FSK_RE.search(url)
    return match.group(1) if match else None


def build_endpoint(base_url: str, fragment: str, params: dict) -> str:
    return f"{base_url.rstrip('/')}{fragment}?{urlencode(params)}"


def _clear_challenge(page, timeout_ms: int = 40000) -> None:
    waited = 0
    while waited < timeout_ms and "just a moment" in (page.title() or "").lower():
        page.wait_for_timeout(2000)
        waited += 2000
    if "just a moment" in (page.title() or "").lower():
        raise TearsheetUnavailableError("Cloudflare challenge did not clear")


class TearsheetBrowser:
    """Headless real-Chrome session: logs in, captures fsk, fetches JSON.

    Use as a context manager. The only browser/network-bound component;
    everything downstream consumes the dict/list it returns.
    """

    def __init__(self, symbol: str):
        self.symbol = symbol.upper()
        self.base_url = settings.NEPSEALPHA_BASE_URL
        self._fsk: str | None = None
        self._requests_made = 0

    def __enter__(self) -> "TearsheetBrowser":
        from playwright.sync_api import sync_playwright
        self._pw = sync_playwright().start()
        self._browser = self._launch()
        # No user_agent override: real Chrome (channel="chrome") sends a genuine UA
        # that is self-consistent with its sec-ch-ua client hints, avoiding the
        # UA/version mismatch a hardcoded string would create.
        self._ctx = self._browser.new_context(
            viewport={"width": 1366, "height": 900}, locale="en-US")
        self._ctx.add_init_script(_STEALTH)
        self._page = self._ctx.new_page()
        self._page.on("response", self._sniff_fsk)
        self._login()
        self._open_tearsheet()
        return self

    def __exit__(self, *exc) -> None:
        try:
            self._browser.close()
        finally:
            self._pw.stop()

    def _launch(self):
        flags = ["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        try:
            return self._pw.chromium.launch(channel="chrome", headless=True, args=flags)
        except Exception:
            return self._pw.chromium.launch(headless=True, args=flags)

    def _sniff_fsk(self, response) -> None:
        if self._fsk is None:
            self._fsk = extract_fsk(response.url)

    def _login(self) -> None:
        page = self._page
        page.goto(f"{self.base_url}/login", wait_until="domcontentloaded", timeout=60000)
        _clear_challenge(page)
        page.fill("input[name='email']", settings.NEPSEALPHA_EMAIL)
        page.fill("input[name='password']", settings.NEPSEALPHA_PASSWORD)
        try:
            page.check("input[name='remember']")
        except Exception:
            pass
        page.click("button[type=submit]")
        page.wait_for_timeout(3000)
        _clear_challenge(page)

    def _open_tearsheet(self) -> None:
        url = f"{self.base_url}/sastoshare/tearsheet/{self.symbol}"
        self._page.goto(url, wait_until="domcontentloaded", timeout=60000)
        _clear_challenge(self._page)
        self._page.wait_for_timeout(3000)
        if self._page.query_selector("input[type='password']"):
            raise TearsheetAuthError("not authenticated after login")
        if self._fsk is None:
            raise TearsheetUnavailableError("fsk token not captured")

    def fetch(self, fragment: str, params: dict):
        if self._requests_made >= settings.NEPSEALPHA_MAX_REQUESTS:
            raise TearsheetUnavailableError("per-run request cap reached")
        time.sleep(settings.NEPSEALPHA_REQUEST_DELAY * (0.5 + random.random()))
        self._requests_made += 1
        url = build_endpoint(self.base_url, fragment, {**params, "fsk": self._fsk})
        result = self._page.evaluate(_FETCH_JS, url)
        if not result["ok"]:
            raise TearsheetUnavailableError(f"{fragment}: HTTP {result['status']}")
        return json.loads(result["body"])
