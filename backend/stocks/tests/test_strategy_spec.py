"""Tests for the declarative strategy spec (Layer 1): registry, compiler, codegen,
validation, and the serializer's spec→code integration."""

import numpy as np
import pandas as pd
import pytest
from backtesting import Backtest

from stocks.services.strategy_framework import (
    REGISTRY, registry_schema, validate_spec, compile_spec, spec_to_code, SpecError,
)


def _df(n=400, seed=3):
    rng = np.random.RandomState(seed)
    close = 100 * np.cumprod(1 + rng.normal(0.0015, 0.02, n))
    idx = pd.date_range("2020-01-01", periods=n, freq="D")
    high = close * (1 + np.abs(rng.normal(0, 0.006, n)))
    low = close * (1 - np.abs(rng.normal(0, 0.006, n)))
    open_ = close * (1 + rng.normal(0, 0.003, n))
    vol = rng.randint(1000, 50000, n).astype(float)
    return pd.DataFrame({"Open": open_, "High": high, "Low": low, "Close": close, "Volume": vol}, index=idx)


SPEC = {
    "version": 1,
    "alpha": {"type": "SmaCross", "params": {"fast": 20, "slow": 50}},
    "regime": {"type": "AboveEMA", "params": {"period": 100}},
    "stop": {"type": "AtrTrail", "params": {"multiplier": 3.0}},
    "name": "TestCompose",
}


# --------------------------------------------------------------------------- #
# Registry catalog
# --------------------------------------------------------------------------- #
def test_every_component_has_a_complete_schema():
    schema = registry_schema()
    assert set(schema) == {"alpha", "regime", "stop", "exit"}
    assert len(schema["alpha"]) > 20 and schema["regime"] and schema["stop"] and schema["exit"]
    for meta in REGISTRY.values():
        assert meta["kind"] in ("alpha", "regime", "stop", "exit")
        assert isinstance(meta["params"], list)
        for p in meta["params"]:
            assert {"name", "type", "default"} <= set(p)
            assert p["type"] in ("int", "float", "choice")


# --------------------------------------------------------------------------- #
# compile_spec
# --------------------------------------------------------------------------- #
def test_compile_spec_builds_a_trading_strategy():
    cls = compile_spec(SPEC, symbol="SYNTH")
    stats = Backtest(_df(), cls, cash=1_000_000, commission=.002, exclusive_orders=True).run()
    assert stats["# Trades"] > 0


def test_compile_spec_coerces_and_defaults_params():
    spec = {"alpha": {"type": "RsiOversold", "params": {"period": "14"}}}  # string coerced to int
    cls = compile_spec(spec, symbol="SYNTH")
    assert Backtest(_df(), cls, cash=1_000_000, commission=.002).run()["# Trades"] >= 0


# --------------------------------------------------------------------------- #
# spec_to_code equivalence
# --------------------------------------------------------------------------- #
def test_spec_to_code_execs_to_equivalent_strategy():
    code = spec_to_code(SPEC)
    assert "build_strategy(" in code and "alphas.SmaCross" in code
    scope = {}
    exec(code, scope)
    code_cls = scope["Strategy"]
    df = _df()
    a = Backtest(df, code_cls, cash=1_000_000, commission=.002, exclusive_orders=True).run()["# Trades"]
    b = Backtest(df, compile_spec(SPEC, symbol="SYNTH"), cash=1_000_000, commission=.002, exclusive_orders=True).run()["# Trades"]
    assert a == b  # generated code and the compiled spec are the same strategy


# --------------------------------------------------------------------------- #
# validation
# --------------------------------------------------------------------------- #
def test_validate_rejects_missing_alpha():
    with pytest.raises(SpecError):
        validate_spec({"version": 1, "regime": {"type": "AboveEMA"}})


def test_validate_rejects_unknown_type():
    with pytest.raises(SpecError):
        validate_spec({"alpha": {"type": "DoesNotExist"}})


def test_validate_rejects_wrong_kind():
    with pytest.raises(SpecError):
        validate_spec({"alpha": {"type": "AboveEMA"}})  # a regime used as an alpha


def test_validate_rejects_out_of_range_param():
    with pytest.raises(SpecError):
        validate_spec({"alpha": {"type": "SupertrendFlip", "params": {"period": 999}}})


def test_validate_rejects_unknown_param():
    with pytest.raises(SpecError):
        validate_spec({"alpha": {"type": "SupertrendFlip", "params": {"bogus": 1}}})


# --------------------------------------------------------------------------- #
# serializer integration (spec -> code), needs DB
# --------------------------------------------------------------------------- #
@pytest.mark.django_db
def test_serializer_renders_code_from_spec(create_user):
    from stocks.serializers.strategy import StrategySerializer
    user = create_user(username="specuser", password="p")
    s = StrategySerializer(data={"name": "Spec Strat", "description": "via spec", "spec": SPEC})
    assert s.is_valid(), s.errors
    obj = s.save(user=user)
    assert obj.spec == SPEC
    assert "build_strategy(" in obj.code and "alphas.SmaCross" in obj.code


@pytest.mark.django_db
def test_serializer_detaches_spec_when_raw_code_edited(create_user):
    from stocks.serializers.strategy import StrategySerializer
    user = create_user(username="specuser2", password="p")
    obj = StrategySerializer(data={"name": "S", "description": "d", "spec": SPEC})
    assert obj.is_valid(), obj.errors
    inst = obj.save(user=user)
    upd = StrategySerializer(inst, data={"code": "from backtesting import Strategy\nclass X(Strategy):\n  def init(self):pass\n  def next(self):pass"}, partial=True)
    assert upd.is_valid(), upd.errors
    inst = upd.save()
    assert inst.spec is None  # raw-code edit detaches the spec
