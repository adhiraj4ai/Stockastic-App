from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from django.conf import settings

_CACHE_DIR = Path(settings.BASE_DIR) / ".cache" / "tearsheet"


def _path(symbol: str, dataset: str) -> Path:
    return _CACHE_DIR / f"{symbol.upper()}_{dataset}_{date.today().isoformat()}.json"


def read(symbol: str, dataset: str):
    path = _path(symbol, dataset)
    if path.exists():
        return json.loads(path.read_text())
    return None


def write(symbol: str, dataset: str, payload) -> None:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    _path(symbol, dataset).write_text(json.dumps(payload))
