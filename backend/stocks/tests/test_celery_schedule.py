"""Beat schedule entries must point at real, importable tasks."""
import importlib

import pytest
from django.conf import settings


def _find_in_module(module_path: str, func_name: str) -> bool:
    """Return True if func_name exists as an attribute of module_path."""
    try:
        mod = importlib.import_module(module_path)
        return hasattr(mod, func_name)
    except ImportError:
        return False


def _find_in_tasks_module(module_path: str, func_name: str) -> bool:
    """Return True if func_name exists in the .tasks sub-module of module_path."""
    try:
        mod = importlib.import_module(module_path + ".tasks")
        return hasattr(mod, func_name)
    except ImportError:
        return False


def _find_by_registered_name(task_path: str) -> bool:
    """Return True if any shared_task in stocks.tasks has registered name == task_path."""
    try:
        tasks_mod = importlib.import_module("stocks.tasks")
        for attr in dir(tasks_mod):
            obj = getattr(tasks_mod, attr)
            if callable(obj) and getattr(obj, "name", None) == task_path:
                return True
    except ImportError:
        pass
    return False


def _task_is_findable(task_path: str) -> bool:
    """Return True if task_path resolves to a callable.

    Handles two conventions:
    1. Full module path:  "stocks.tasks.generate_all_signals_task"
    2. Custom registered name with shorter prefix: "stocks.check_notifications"
    """
    module_path, func_name = task_path.rsplit(".", 1)
    return (
        _find_in_module(module_path, func_name)
        or _find_in_tasks_module(module_path, func_name)
        or _find_by_registered_name(task_path)
    )


def test_beat_schedule_tasks_are_importable():
    schedule = getattr(settings, "CELERY_BEAT_SCHEDULE", {})
    assert schedule, "CELERY_BEAT_SCHEDULE must be defined"
    for entry_name, entry in schedule.items():
        task_path = entry["task"]
        assert _task_is_findable(task_path), (
            f"Beat entry '{entry_name}': task '{task_path}' not found"
        )


def test_evaluate_episodes_task_runs_synchronously(db):
    from stocks.tasks import evaluate_episodes_task
    res = evaluate_episodes_task.apply().result
    assert isinstance(res, dict) and "episodes_closed" in res
