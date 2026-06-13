"""Phase 1 helper: re-seed a subset of strategies from seed_strategies.py and score
each over the basket. Run INSIDE the backend container:

    docker cp seed_strategies.py stockastic-backend:/app/seed_strategies.py
    docker cp scripts/phase1_reseed_test.py stockastic-backend:/app/_p1.py
    docker exec stockastic-backend python /app/_p1.py "Name A" "Name B"   2>/dev/null

With no names, scores every strategy in the DB without re-seeding.
"""
import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "stockastic.settings")
django.setup()

import warnings
import logging
warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)

from django.contrib.auth.models import User
from stocks.models import Strategy
from stocks.services.backtest_harness import evaluate_over_basket, load_basket

names = sys.argv[1:]

if names:
    ns = {}
    exec(open("/app/seed_strategies.py").read(), ns)
    user = User.objects.first()
    by_name = {s["name"]: s for s in ns["strategies"]}
    for n in names:
        s = by_name[n]
        Strategy.objects.update_or_create(
            name=s["name"],
            defaults={"description": s["description"], "code": s["code"],
                      "user": user, "is_public": True},
        )
    targets = names
else:
    targets = list(Strategy.objects.values_list("name", flat=True))

basket, dropped = load_basket()
n_pass = 0
for name in targets:
    st = Strategy.objects.get(name=name)
    c = evaluate_over_basket(st, basket, strategy_name=name)
    a = c.aggregates
    tag = "PASS" if c.passed else "FAIL"
    if c.passed:
        n_pass += 1
    fails = "" if c.passed else "  fails: " + ",".join(k for k, v in c.verdicts.items() if not v)
    print(f"[{tag}] {name:<34} excess={a.get('median_excess_return_pct')}%  "
          f"sortino={a.get('median_strategy_sortino')}  "
          f"ret/dd={a.get('median_strategy_return_over_dd')} vs bh={a.get('median_buyhold_return_over_dd')}  "
          f"trades={a.get('median_trades')}{fails}")
print(f"\n{n_pass}/{len(targets)} passed.")
