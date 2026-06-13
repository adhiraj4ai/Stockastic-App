from __future__ import annotations
from typing import Protocol, runtime_checkable


@runtime_checkable
class ISignalGenerator(Protocol):
    source_key: str

    def generate(self) -> list[dict]:
        ...
