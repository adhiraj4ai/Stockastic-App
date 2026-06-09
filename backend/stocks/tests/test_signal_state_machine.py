# backend/stocks/tests/test_signal_state_machine.py
from datetime import date
from decimal import Decimal

from stocks.services.signal_episode.reading import SignalReading, BUY, SELL, HOLD, NEUTRAL
from stocks.services.signal_episode.state_machine import (
    decide, EpisodeSnapshot, OPEN, EXTEND, FLIP, SUPPRESS, NOOP,
)


def r(d, direction, close=100):
    return SignalReading(date=date(2026, 1, d), direction=direction, close=Decimal(close))


def test_first_directional_signal_opens():
    assert decide(open_ep=None, latest_ep=None, reading=r(1, BUY)).action == OPEN


def test_same_direction_while_open_extends():
    open_ep = EpisodeSnapshot(direction=BUY, exit_reason=None)
    assert decide(open_ep=open_ep, latest_ep=open_ep, reading=r(2, BUY)).action == EXTEND


def test_hold_while_open_is_noop():
    open_ep = EpisodeSnapshot(direction=BUY, exit_reason=None)
    assert decide(open_ep=open_ep, latest_ep=open_ep, reading=r(2, HOLD)).action == NOOP


def test_neutral_while_open_is_noop():
    open_ep = EpisodeSnapshot(direction=BUY, exit_reason=None)
    assert decide(open_ep=open_ep, latest_ep=open_ep, reading=r(2, NEUTRAL)).action == NOOP


def test_opposite_signal_flips():
    open_ep = EpisodeSnapshot(direction=BUY, exit_reason=None)
    d = decide(open_ep=open_ep, latest_ep=open_ep, reading=r(11, SELL))
    assert d.action == FLIP


def test_no_reentry_after_tp_while_same_direction_persists():
    # BUY run was closed by a TARGET hit; signal still BUY, no open episode.
    closed = EpisodeSnapshot(direction=BUY, exit_reason="TARGET")
    assert decide(open_ep=None, latest_ep=closed, reading=r(5, BUY)).action == SUPPRESS


def test_reentry_after_flip_direction():
    # Last episode was a TP-closed SELL; now BUY fires -> new run (rising edge).
    closed = EpisodeSnapshot(direction=SELL, exit_reason="TARGET")
    assert decide(open_ep=None, latest_ep=closed, reading=r(21, BUY)).action == OPEN


def test_hold_with_no_open_episode_is_noop():
    assert decide(open_ep=None, latest_ep=None, reading=r(1, HOLD)).action == NOOP
