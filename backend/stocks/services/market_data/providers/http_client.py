"""Thin HTTP wrapper used by HTTP-based providers.

Normalizes all transport failures (timeout, connection error, 4xx/5xx, rate
limit) into ProviderUnavailableError so callers never see raw requests errors.
"""
from __future__ import annotations

import time

import requests

from ..contracts import ProviderUnavailableError


class NepseHttpClient:
    def __init__(self, base_url: str, timeout: float = 30, retries: int = 2,
                 backoff: float = 1.5):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.retries = retries
        self.backoff = backoff
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": "Stockastic/1.0", "Accept": "application/json"}
        )

    def get_json(self, path: str, params: dict | None = None):
        url = f"{self.base_url}{path}"
        last_err: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)
                if resp.status_code == 429:
                    raise ProviderUnavailableError(f"rate-limited (429) for {url}")
                resp.raise_for_status()
                return resp.json()
            except ProviderUnavailableError:
                raise
            except (requests.RequestException, ValueError) as e:
                last_err = e
                if attempt < self.retries:
                    time.sleep(self.backoff ** attempt)
        raise ProviderUnavailableError(f"request failed for {url}: {last_err}")
