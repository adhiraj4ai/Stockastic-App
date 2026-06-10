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
    
    @staticmethod
    def calculate_position_size(
        account_balance: float,
        risk_percentage: float,
        entry_price: float,
        stop_loss_price: float,
        target_price: Optional[float] = None
    ) -> Dict:
        """
        Calculate optimal position size based on risk parameters.
        
        Args:
            account_balance: Total account balance in Rs.
            risk_percentage: Percentage of account to risk (e.g., 2.0 for 2%)
            entry_price: Intended entry price per share
            stop_loss_price: Stop-loss price per share
            target_price: Optional target price for R/R calculation
            
        Returns:
            Dictionary containing:
                - max_shares: Maximum number of shares to buy
                - total_investment: Total capital required
                - risk_amount: Total amount at risk
                - max_loss_if_stopped: Maximum loss if stop-loss is hit
                - risk_per_share: Risk per share (entry - stop_loss)
                - position_size_percentage: Position size as % of account
                - risk_reward_ratio: Risk/reward ratio (if target provided)
                - warnings: List of warning messages
                
        Raises:
            ValueError: If parameters are invalid
        """
        # Validate inputs
        PositionSizingService._validate_inputs(
            account_balance, risk_percentage, entry_price, stop_loss_price
        )
        
        # Convert to Decimal for precise calculations
        balance = Decimal(str(account_balance))
        risk_pct = Decimal(str(risk_percentage))
        entry = Decimal(str(entry_price))
        stop_loss = Decimal(str(stop_loss_price))
        
        # Calculate risk amount (how much we're willing to lose)
        risk_amount = balance * (risk_pct / Decimal('100'))
        
        # Calculate risk per share
        risk_per_share = entry - stop_loss
        
        # Calculate maximum shares we can buy
        max_shares = int(risk_amount / risk_per_share)
        
        # Calculate total investment required
        total_investment = max_shares * entry
        
        # Calculate actual max loss (should equal risk_amount, but recalc for precision)
        max_loss_if_stopped = max_shares * risk_per_share
        
        # Calculate position size as percentage of account
        position_size_percentage = (total_investment / balance * Decimal('100')) if balance > 0 else Decimal('0')
        
        # Generate warnings
        warnings = PositionSizingService._generate_warnings(
            risk_percentage, position_size_percentage, max_shares, total_investment, balance
        )
        
        # Build result dictionary
        result = {
            'max_shares': max_shares,
            'total_investment': float(total_investment),
            'risk_amount': float(risk_amount),
            'max_loss_if_stopped': float(max_loss_if_stopped),
            'risk_per_share': float(risk_per_share),
            'position_size_percentage': float(position_size_percentage),
            'warnings': warnings,
            'account_balance': float(balance),
            'risk_percentage': float(risk_pct),
            'entry_price': float(entry),
            'stop_loss_price': float(stop_loss)
        }
        
        # Calculate risk/reward ratio if target price provided
        if target_price is not None:
            target = Decimal(str(target_price))
            if target > entry:
                reward_per_share = target - entry
                risk_reward_ratio = reward_per_share / risk_per_share
                result['risk_reward_ratio'] = float(risk_reward_ratio)
                result['target_price'] = float(target)
                result['potential_profit'] = float(max_shares * reward_per_share)
                
                # Add R/R warning if ratio is poor
                if risk_reward_ratio < Decimal('1.5'):
                    warnings.append({
                        'type': 'POOR_RISK_REWARD',
                        'message': f'Risk/Reward ratio of 1:{risk_reward_ratio:.1f} is below recommended 1:1.5 minimum',
                        'severity': 'MEDIUM'
                    })
        
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
    def _generate_warnings(
        risk_percentage: float,
        position_size_percentage: Decimal,
        max_shares: int,
        total_investment: Decimal,
        account_balance: Decimal
    ) -> list:
        """Generate warning messages based on calculated values."""
        warnings = []
        
        # High risk warning
        if risk_percentage > PositionSizingService.RECOMMENDED_MAX_RISK:
            warnings.append({
                'type': 'HIGH_RISK',
                'message': f'Risk of {risk_percentage}% exceeds recommended maximum of {PositionSizingService.RECOMMENDED_MAX_RISK}%',
                'severity': 'HIGH'
            })
        elif risk_percentage > 3.0:
            warnings.append({
                'type': 'ELEVATED_RISK',
                'message': f'Risk of {risk_percentage}% is above conservative threshold of 3%',
                'severity': 'MEDIUM'
            })
        
        # Position size warning
        if position_size_percentage > Decimal('50'):
            warnings.append({
                'type': 'LARGE_POSITION',
                'message': f'Position size of {position_size_percentage:.1f}% exceeds 50% of account - consider diversification',
                'severity': 'HIGH'
            })
        elif position_size_percentage > Decimal('25'):
            warnings.append({
                'type': 'CONCENTRATED_POSITION',
                'message': f'Position size of {position_size_percentage:.1f}% is concentrated - ensure proper diversification',
                'severity': 'MEDIUM'
            })
        
        # Low shares warning
        if max_shares == 0:
            warnings.append({
                'type': 'INSUFFICIENT_CAPITAL',
                'message': 'Insufficient capital for even 1 share with current risk parameters',
                'severity': 'HIGH'
            })
        elif max_shares < 10:
            warnings.append({
                'type': 'LOW_SHARES',
                'message': f'Only {max_shares} shares recommended - consider wider stop-loss or higher risk tolerance',
                'severity': 'LOW'
            })
        
        # Over-leverage warning
        if total_investment > account_balance:
            warnings.append({
                'type': 'OVER_LEVERAGE',
                'message': 'Calculated position exceeds account balance - this should not happen',
                'severity': 'CRITICAL'
            })
        
        return warnings
    
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
    if balance <= 0 or risk_pct <= 0:
        return None
    per_share_risk = entry - stop
    if per_share_risk <= 0:
        return None
    risk_amount = balance * risk_pct / 100.0
    shares = math.floor(risk_amount / per_share_risk)
    if shares < 1:
        return None
    return {
        "shares": shares,
        "risk_amount": round(risk_amount, 2),
        "position_value": round(shares * entry, 2),
        "risk_pct": risk_pct,
        "entry": entry,
        "stop": stop,
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
            out[pick["symbol"]] = block
    return out
