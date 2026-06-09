"""Quick "does every strategy run?" smoke check against a single symbol.

Thin wrapper over the shared backtest harness
(``stocks.services.backtest_harness``) so this dev script can no longer drift
from how production runs strategy code. For full, basket-level, buy-and-hold
relative scoring use:  ``python manage.py backtest_basket --all``.

Usage:  python verify_all_strategies.py [SYMBOL]
"""

import os
import sys

import django

sys.path.append(os.path.join(os.getcwd(), "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "stockastic.settings")
django.setup()

from stocks.models import Strategy  # noqa: E402
from stocks.services.backtest_harness import run_backtest  # noqa: E402


def verify_strategies(symbol="NABIL"):
    print(f"Verifying all strategies against {symbol}...")
    print("-" * 70)

    strategies = Strategy.objects.all().order_by("id")
    passed, failed, failed_list = 0, 0, []

    for s in strategies:
        res = run_backtest(s, symbol)
        if res.ok:
            m = res.metrics
            print(f"SUCCESS {s.name:<34} (Ret: {m['return_pct']:.2f}%, "
                  f"DD: {m['max_drawdown_pct']:.2f}%, Trades: {m['num_trades']})")
            passed += 1
        else:
            print(f"FAILED  {s.name:<34}: {res.error}")
            failed += 1
            failed_list.append(f"{s.name}: {res.error}")

    print("\n" + "=" * 70)
    print(f"Total: {len(strategies)}   Passed: {passed}   Failed: {failed}")
    if failed_list:
        print("\nFailed Strategies:")
        for f in failed_list:
            print(f"- {f}")


if __name__ == "__main__":
    verify_strategies(sys.argv[1] if len(sys.argv) > 1 else "NABIL")
