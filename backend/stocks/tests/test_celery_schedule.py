"""Beat schedule entries must point at real, importable tasks."""
import importlib

import pytest
from django.conf import settings


def _task_is_findable(task_path: str) -> bool:
    """
    Return True if task_path resolves to a callable.

    Handles two conventions:
    1. Full module path:  "stocks.tasks.generate_all_signals_task"
       -> importlib.import_module("stocks.tasks"), getattr(..., "generate_all_signals_task")
    2. Custom registered name with shorter prefix: "stocks.check_notifications"
       -> importlib.import_module("stocks") fails, fall back to "stocks.tasks" module.
    """
    module_path, func_name = task_path.rsplit(".", 1)
    try:
        mod = importlib.import_module(module_path)
        if hasattr(mod, func_name):
            return True
    except ImportError:
        pass

    # Fallback: try appending ".tasks" to the module segment
    try:
        mod = importlib.import_module(module_path + ".tasks")
        if hasattr(mod, func_name):
            return True
    except ImportError:
        pass

    # Also check the tasks module directly for registered-name aliases
    # (existing tasks use name='stocks.check_notifications' etc.)
    try:
        tasks_mod = importlib.import_module("stocks.tasks")
        # Walk all attributes looking for a shared_task whose registered name matches
        for attr in dir(tasks_mod):
            obj = getattr(tasks_mod, attr)
            if callable(obj) and getattr(obj, "name", None) == task_path:
                return True
    except ImportError:
        pass

    return False


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
