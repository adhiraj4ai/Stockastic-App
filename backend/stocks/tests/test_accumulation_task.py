import pytest

from stocks import tasks


@pytest.mark.django_db
def test_scan_task_delegates_to_scanner(monkeypatch):
    monkeypatch.setattr(
        "stocks.services.accumulation.scanner.AccumulationScanner.scan_and_save_candidates",
        staticmethod(lambda as_of=None: 7))
    result = tasks.scan_accumulation_candidates_task.run()
    assert result == {"candidates_identified": 7}
