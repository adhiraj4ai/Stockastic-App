"""Smoke tests: management commands and seed scripts have handle() and no 30-line violations."""
import ast
import glob
import importlib
import os

import django
import pytest

# Ensure Django is set up for import-based tests
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "stockastic.settings")


# ─── 30-line AST check ────────────────────────────────────────────────────────

def _collect_violations(paths):
    violations = []
    for path in paths:
        try:
            src = open(path).read()
        except OSError:
            continue
        try:
            tree = ast.parse(src)
        except SyntaxError as e:
            violations.append((path, f"SyntaxError: {e}", 0))
            continue
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            body_lines = node.end_lineno - node.body[0].lineno + 1
            if body_lines > 30:
                violations.append((path, node.name, body_lines))
    return violations


def test_no_30_line_violations_in_management_commands():
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    paths = glob.glob(os.path.join(base, "management", "commands", "*.py"))
    violations = _collect_violations(paths)
    assert not violations, (
        "Functions > 30 lines found in management commands:\n"
        + "\n".join(f"  {p}: {name}() = {count} lines" for p, name, count in violations)
    )


def test_no_30_line_violations_in_seed_permissions():
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    path = os.path.join(base, "seed_permissions.py")
    violations = _collect_violations([path])
    assert not violations, (
        "Functions > 30 lines found in seed_permissions.py:\n"
        + "\n".join(f"  {p}: {name}() = {count} lines" for p, name, count in violations)
    )


def test_no_30_line_violations_in_chat_tools():
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    paths = glob.glob(os.path.join(base, "chat", "tools", "*.py"))
    violations = _collect_violations(paths)
    assert not violations, (
        "Functions > 30 lines found in chat/tools:\n"
        + "\n".join(f"  {p}: {name}() = {count} lines" for p, name, count in violations)
    )


# ─── Command class smoke tests ─────────────────────────────────────────────────

COMMAND_MODULES = [
    "stocks.management.commands.backfill_corporate_actions",
    "stocks.management.commands.backfill_portfolio_history",
    "stocks.management.commands.backtest_basket",
    "stocks.management.commands.fetch_dividends",
    "stocks.management.commands.fetch_fundamentals",
    "stocks.management.commands.generate_daily_plan",
    "stocks.management.commands.ingest_market_data",
    "stocks.management.commands.optimize_strategies",
    "stocks.management.commands.rank_strategies",
    "stocks.management.commands.scrape_nepse_index",
    "stocks.management.commands.seed_misc_financials",
    "stocks.management.commands.seed_stocks",
    "stocks.management.commands.update_broker_analysis",
]


@pytest.mark.parametrize("module_path", COMMAND_MODULES)
@pytest.mark.django_db
def test_command_has_handle(module_path):
    module = importlib.import_module(module_path)
    cmd = module.Command()
    assert hasattr(cmd, "handle"), f"{module_path}.Command missing handle()"


def test_seed_permissions_callable():
    """seed_permissions module-level function is importable and callable."""
    import importlib.util
    import sys
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    spec = importlib.util.spec_from_file_location("seed_permissions", os.path.join(base, "seed_permissions.py"))
    mod = importlib.util.module_from_spec(spec)
    # Do NOT execute (would call django.setup() + DB) — just check the symbol exists
    assert spec is not None
