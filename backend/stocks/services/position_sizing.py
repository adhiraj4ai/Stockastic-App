"""
Position Sizing Service

Calculates optimal position sizes based on risk management principles.
Helps traders determine how many shares to buy based on account balance,
risk tolerance, and stop-loss levels.
"""

from decimal import Decimal
from typing import Dict, Optional
import math


class PositionSizingService:
    """Service for calculating position sizes based on risk parameters."""

    # Risk percentage limits
    MIN_RISK_PERCENTAGE = 0.1  # 0.1%
    MAX_RISK_PERCENTAGE = 10.0  # 10%
    RECOMMENDED_MAX_RISK = 5.0  # 5%
    POOR_RR_THRESHOLD = Decimal("1.5")

    @staticmethod
    def _compute_core(
        balance: Decimal, risk_pct: Decimal, entry: Decimal, stop_loss: Decimal
    ):
        """Return (risk_amount, risk_per_share, max_shares, total_investment, max_loss, pos_pct)."""
        risk_amount = balance * (risk_pct / Decimal("100"))
        risk_per_share = entry - stop_loss
        max_shares = int(risk_amount / risk_per_share)
        total_investment = Decimal(str(max_shares)) * entry
        max_loss = Decimal(str(max_shares)) * risk_per_share
        pos_pct = (total_investment / balance) * Decimal("100")
        return risk_amount, risk_per_share, max_shares, total_investment, max_loss, pos_pct

    @staticmethod
    def _build_result(
        balance: Decimal, risk_pct: Decimal, entry: Decimal, stop_loss: Decimal,
        risk_amount: Decimal, risk_per_share: Decimal, max_shares: int,
        total_investment: Decimal, max_loss: Decimal, pos_pct: Decimal,
        warnings: list,
    ) -> dict:
        """Assemble the base result dictionary from computed fields."""
        return {
            "max_shares": max_shares,
            "total_investment": float(total_investment),
            "risk_amount": float(risk_amount),
            "max_loss_if_stopped": float(max_loss),
            "risk_per_share": float(risk_per_share),
            "position_size_percentage": float(pos_pct),
            "warnings": warnings,
            "account_balance": float(balance),
            "risk_percentage": float(risk_pct),
            "entry_price": float(entry),
            "stop_loss_price": float(stop_loss),
        }

    @staticmethod
    def _append_rr_fields(
        result: dict,
        target_price: Decimal,
        entry: Decimal,
        risk_per_share: Decimal,
        max_shares: int,
        warnings: list,
    ) -> None:
        """Mutate result with reward/ratio/profit fields; append warning if ratio is poor."""
        reward_per_share = target_price - entry
        ratio = reward_per_share / risk_per_share
        result["reward_per_share"] = float(reward_per_share)
        result["risk_reward_ratio"] = float(ratio)
        result["potential_profit"] = float(reward_per_share * Decimal(str(max_shares)))
        if ratio < PositionSizingService.POOR_RR_THRESHOLD:
            warnings.append({
                "type": "POOR_RISK_REWARD",
                "severity": "MEDIUM",
                "message": f"Risk/reward ratio {float(ratio):.2f} is below recommended 1.5",
            })

    @staticmethod
    def calculate_position_size(
        account_balance: float,
        risk_percentage: float,
        entry_price: float,
        stop_loss_price: float,
        target_price: Optional[float] = None,
    ) -> Dict:
        """Calculate optimal position size based on risk parameters."""
        PositionSizingService._validate_inputs(
            account_balance, risk_percentage, entry_price, stop_loss_price
        )
        balance, risk_pct = Decimal(str(account_balance)), Decimal(str(risk_percentage))
        entry, stop_loss = Decimal(str(entry_price)), Decimal(str(stop_loss_price))
        risk_amount, risk_per_share, max_shares, total_investment, max_loss, pos_pct = (
            PositionSizingService._compute_core(balance, risk_pct, entry, stop_loss)
        )
        warnings = PositionSizingService._generate_warnings(
            risk_percentage, pos_pct, max_shares, total_investment, balance
        )
        result = PositionSizingService._build_result(
            balance, risk_pct, entry, stop_loss,
            risk_amount, risk_per_share, max_shares, total_investment, max_loss, pos_pct,
            warnings,
        )
        if target_price is not None:
            PositionSizingService._append_rr_fields(
                result, Decimal(str(target_price)), entry, risk_per_share, max_shares, warnings
            )
        return result
    
    @staticmethod
    def _validate_inputs(
        account_balance: float,
        risk_percentage: float,
        entry_price: float,
        stop_loss_price: float
    ) -> None:
        """Validate input parameters."""
        
        if account_balance <= 0:
            raise ValueError("Account balance must be greater than 0")
        
        if risk_percentage < PositionSizingService.MIN_RISK_PERCENTAGE:
            raise ValueError(f"Risk percentage must be at least {PositionSizingService.MIN_RISK_PERCENTAGE}%")
        
        if risk_percentage > PositionSizingService.MAX_RISK_PERCENTAGE:
            raise ValueError(f"Risk percentage cannot exceed {PositionSizingService.MAX_RISK_PERCENTAGE}%")
        
        if entry_price <= 0:
            raise ValueError("Entry price must be greater than 0")
        
        if stop_loss_price <= 0:
            raise ValueError("Stop-loss price must be greater than 0")
        
        if stop_loss_price >= entry_price:
            raise ValueError("Stop-loss price must be below entry price for long positions")
    
    @staticmethod
    def _risk_warning(risk_percentage: float) -> list:
        """Return a warning list for elevated or high risk percentages."""
        if risk_percentage >= PositionSizingService.RECOMMENDED_MAX_RISK:
            return [{'type': 'HIGH_RISK', 'severity': 'HIGH',
                     'message': f'Risk of {risk_percentage}% exceeds recommended maximum of '
                                f'{PositionSizingService.RECOMMENDED_MAX_RISK}%'}]
        if risk_percentage > 3.0:
            return [{'type': 'ELEVATED_RISK', 'severity': 'MEDIUM',
                     'message': f'Risk of {risk_percentage}% is above conservative threshold of 3%'}]
        return []

    @staticmethod
    def _position_warning(position_size_percentage) -> list:
        """Return a warning list for large or concentrated position sizes."""
        pct = Decimal(str(position_size_percentage))
        if pct > Decimal('50'):
            return [{'type': 'LARGE_POSITION', 'severity': 'HIGH',
                     'message': f'Position size of {pct:.1f}% exceeds 50% of account - consider diversification'}]
        if pct > Decimal('25'):
            return [{'type': 'CONCENTRATED_POSITION', 'severity': 'MEDIUM',
                     'message': f'Position size of {pct:.1f}% is concentrated - ensure proper diversification'}]
        return []

    @staticmethod
    def _shares_warning(max_shares: int) -> list:
        """Return a warning list for zero or very few shares."""
        if max_shares == 0:
            return [{'type': 'INSUFFICIENT_CAPITAL', 'severity': 'HIGH',
                     'message': 'Insufficient capital for even 1 share with current risk parameters'}]
        if max_shares < 10:
            return [{'type': 'LOW_SHARES', 'severity': 'LOW',
                     'message': f'Only {max_shares} shares recommended - consider wider stop-loss or higher risk tolerance'}]
        return []

    @staticmethod
    def _leverage_warning(total_investment: Decimal, account_balance: Decimal) -> list:
        """Return a warning list when total investment exceeds account balance."""
        if total_investment > account_balance:
            return [{'type': 'OVER_LEVERAGE', 'severity': 'CRITICAL',
                     'message': 'Calculated position exceeds account balance - this should not happen'}]
        return []

    @staticmethod
    def _generate_warnings(
        risk_percentage: float,
        position_size_percentage: Decimal,
        max_shares: int,
        total_investment: Decimal,
        account_balance: Decimal
    ) -> list:
        """Generate warning messages by delegating to focused helper methods."""
        return (
            PositionSizingService._risk_warning(risk_percentage)
            + PositionSizingService._position_warning(position_size_percentage)
            + PositionSizingService._shares_warning(max_shares)
            + PositionSizingService._leverage_warning(total_investment, account_balance)
        )
    
    @staticmethod
    def get_preset_risk_levels() -> Dict:
        """Return preset risk levels for quick selection."""
        return {
            'conservative': {
                'name': 'Conservative',
                'risk_percentage': 1.0,
                'description': 'Low risk - suitable for beginners or volatile markets',
                'max_position_size': 15.0
            },
            'moderate': {
                'name': 'Moderate',
                'risk_percentage': 2.0,
                'description': 'Balanced risk - recommended for most traders',
                'max_position_size': 25.0
            },
            'aggressive': {
                'name': 'Aggressive',
                'risk_percentage': 3.0,
                'description': 'Higher risk - for experienced traders with strong conviction',
                'max_position_size': 35.0
            },
            'very_aggressive': {
                'name': 'Very Aggressive',
                'risk_percentage': 5.0,
                'description': 'Very high risk - only for expert traders',
                'max_position_size': 50.0
            }
        }


# ---------------------------------------------------------------------------
# Module-level functional API (NEPSE whole-share risk sizing)
# ---------------------------------------------------------------------------

def size_position(balance, risk_pct, entry, stop):
    """Risk-budget sizing → dict or None when unsizeable.

    shares = floor(balance * risk_pct% / (entry - stop)); None if < 1 share,
    missing/inverted stop, or non-positive balance/risk.
    """
    if not balance or not risk_pct or entry is None or stop is None:
        return None
    balance, risk_pct, entry, stop = float(balance), float(risk_pct), float(entry), float(stop)
    if balance <= 0 or risk_pct <= 0 or entry <= 0:
        return None
    per_share_risk = entry - stop
    if per_share_risk <= 0:
        return None
    risk_amount = balance * risk_pct / 100.0
    shares = math.floor(risk_amount / per_share_risk)
    max_affordable = math.floor(balance / entry)
    capped = shares > max_affordable
    if capped:
        shares = max_affordable
    if shares < 1:
        return None
    return {
        "shares": shares,
        "risk_amount": round(risk_amount, 2),
        "position_value": round(shares * entry, 2),
        "risk_pct": risk_pct,
        "entry": entry,
        "stop": stop,
        "capped": capped,
    }


def default_account_for(user):
    """The user's sizing account: first LIVE account, else first account, else None."""
    from stocks.models import PortfolioAccount
    qs = PortfolioAccount.objects.filter(user=user).order_by("id")
    return qs.filter(account_type="LIVE").first() or qs.first()


def _sizing_entry(entry_block):
    """Spec: size at current close when IN_ZONE, else at the signal entry price."""
    if not entry_block:
        return None
    if entry_block.get("status") == "IN_ZONE":
        return entry_block.get("latest_close")
    return entry_block.get("price")


def sizing_block_for(account, entry_block, stop):
    """One pick/verdict sizing dict (adds account fields) or None."""
    if account is None:
        return None
    sized = size_position(account.balance, account.default_risk_percentage,
                          _sizing_entry(entry_block), stop)
    if sized is None:
        return None
    sized["account_id"] = account.id
    sized["account_name"] = account.name
    return sized


def sizing_map_for_user(user, picks):
    """{symbol: sizing block} for plan picks that are sizeable for this user."""
    account = default_account_for(user)
    if account is None:
        return {}
    out = {}
    for pick in picks:
        block = sizing_block_for(account, pick.get("entry"), (pick.get("targets") or {}).get("sl"))
        if block:
            symbol = pick.get("symbol")
            if symbol:
                out[symbol] = block
    return out
