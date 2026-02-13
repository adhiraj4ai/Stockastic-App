"""
Unit tests for Position Sizing Service
"""

from django.test import TestCase
from decimal import Decimal
from stocks.services.position_sizing import PositionSizingService


class PositionSizingServiceTest(TestCase):
    """Test cases for position sizing calculations."""
    
    def test_basic_calculation(self):
        """Test basic position sizing calculation."""
        result = PositionSizingService.calculate_position_size(
            account_balance=100000,  # Rs. 1 lakh
            risk_percentage=2.0,      # 2% risk
            entry_price=500,
            stop_loss_price=450       # 10% stop loss (50 Rs risk per share)
        )
        
        # Expected calculations:
        # risk_amount = 100000 * 0.02 = 2000
        # risk_per_share = 500 - 450 = 50
        # max_shares = 2000 / 50 = 40 shares
        # total_investment = 40 * 500 = 20000
        
        self.assertEqual(result['max_shares'], 40)
        self.assertEqual(result['total_investment'], 20000.0)
        self.assertEqual(result['risk_amount'], 2000.0)
        self.assertEqual(result['max_loss_if_stopped'], 2000.0)
        self.assertEqual(result['risk_per_share'], 50.0)
    
    def test_conservative_risk(self):
        """Test with conservative 1% risk."""
        result = PositionSizingService.calculate_position_size(
            account_balance=500000,
            risk_percentage=1.0,
            entry_price=1000,
            stop_loss_price=950  # 5% stop loss
        )
        
        # risk_amount = 500000 * 0.01 = 5000
        # risk_per_share = 1000 - 950 = 50
        # max_shares = 5000 / 50 = 100
        
        self.assertEqual(result['max_shares'], 100)
        self.assertEqual(result['total_investment'], 100000.0)
    
    def test_aggressive_risk(self):
        """Test with aggressive 5% risk."""
        result = PositionSizingService.calculate_position_size(
            account_balance=200000,
            risk_percentage=5.0,
            entry_price=250,
            stop_loss_price=225  # 10% stop loss
        )
        
        # risk_amount = 200000 * 0.05 = 10000
        # risk_per_share = 250 - 225 = 25
        # max_shares = 10000 / 25 = 400
        
        self.assertEqual(result['max_shares'], 400)
        self.assertEqual(result['total_investment'], 100000.0)
        
        # Should have high risk warning
        warnings = result['warnings']
        self.assertTrue(any(w['type'] == 'HIGH_RISK' for w in warnings))
    
    def test_risk_reward_ratio(self):
        """Test risk/reward ratio calculation."""
        result = PositionSizingService.calculate_position_size(
            account_balance=100000,
            risk_percentage=2.0,
            entry_price=1000,
            stop_loss_price=950,  # 5% risk
            target_price=1150     # 15% reward
        )
        
        # risk_per_share = 50, reward_per_share = 150
        # R/R ratio = 150 / 50 = 3.0
        
        self.assertIn('risk_reward_ratio', result)
        self.assertAlmostEqual(result['risk_reward_ratio'], 3.0, places=1)
        self.assertIn('potential_profit', result)
    
    def test_poor_risk_reward_warning(self):
        """Test warning for poor risk/reward ratio."""
        result = PositionSizingService.calculate_position_size(
            account_balance=100000,
            risk_percentage=2.0,
            entry_price=1000,
            stop_loss_price=950,  # 5% risk
            target_price=1025     # 2.5% reward (poor R/R)
        )
        
        # R/R ratio = 25 / 50 = 0.5 (poor)
        warnings = result['warnings']
        self.assertTrue(any(w['type'] == 'POOR_RISK_REWARD' for w in warnings))
    
    def test_zero_risk_validation(self):
        """Test that stop-loss at or above entry price raises error."""
        with self.assertRaises(ValueError) as context:
            PositionSizingService.calculate_position_size(
                account_balance=100000,
                risk_percentage=2.0,
                entry_price=500,
                stop_loss_price=500  # Invalid: SL = Entry
            )
        
        self.assertIn('below entry price', str(context.exception))
    
    def test_stop_loss_above_entry_validation(self):
        """Test that stop-loss above entry price raises error."""
        with self.assertRaises(ValueError) as context:
            PositionSizingService.calculate_position_size(
                account_balance=100000,
                risk_percentage=2.0,
                entry_price=500,
                stop_loss_price=550  # Invalid: SL > Entry
            )
        
        self.assertIn('below entry price', str(context.exception))
    
    def test_negative_account_balance_validation(self):
        """Test that negative account balance raises error."""
        with self.assertRaises(ValueError) as context:
            PositionSizingService.calculate_position_size(
                account_balance=-1000,
                risk_percentage=2.0,
                entry_price=500,
                stop_loss_price=450
            )
        
        self.assertIn('greater than 0', str(context.exception))
    
    def test_excessive_risk_validation(self):
        """Test that risk percentage above 10% raises error."""
        with self.assertRaises(ValueError) as context:
            PositionSizingService.calculate_position_size(
                account_balance=100000,
                risk_percentage=15.0,  # Too high
                entry_price=500,
                stop_loss_price=450
            )
        
        self.assertIn('cannot exceed', str(context.exception))
    
    def test_low_risk_validation(self):
        """Test that risk percentage below 0.1% raises error."""
        with self.assertRaises(ValueError) as context:
            PositionSizingService.calculate_position_size(
                account_balance=100000,
                risk_percentage=0.05,  # Too low
                entry_price=500,
                stop_loss_price=450
            )
        
        self.assertIn('at least', str(context.exception))
    
    def test_small_account_high_price_stock(self):
        """Test edge case: small account, expensive stock."""
        result = PositionSizingService.calculate_position_size(
            account_balance=10000,
            risk_percentage=2.0,
            entry_price=5000,
            stop_loss_price=4750  # 5% stop loss
        )
        
        # risk_amount = 10000 * 0.02 = 200
        # risk_per_share = 5000 - 4750 = 250
        # max_shares = 200 / 250 = 0 (insufficient capital)
        
        self.assertEqual(result['max_shares'], 0)
        
        # Should have insufficient capital warning
        warnings = result['warnings']
        self.assertTrue(any(w['type'] == 'INSUFFICIENT_CAPITAL' for w in warnings))
    
    def test_tight_stop_loss(self):
        """Test with very tight stop-loss (1% risk per share)."""
        result = PositionSizingService.calculate_position_size(
            account_balance=100000,
            risk_percentage=2.0,
            entry_price=1000,
            stop_loss_price=990  # 1% stop loss
        )
        
        # risk_amount = 100000 * 0.02 = 2000
        # risk_per_share = 1000 - 990 = 10
        # max_shares = 2000 / 10 = 200
        
        self.assertEqual(result['max_shares'], 200)
        self.assertEqual(result['total_investment'], 200000.0)
        
        # Should have large position warning (200k / 100k = 200%)
        warnings = result['warnings']
        self.assertTrue(any(w['type'] == 'LARGE_POSITION' for w in warnings))
    
    def test_position_size_percentage(self):
        """Test position size percentage calculation."""
        result = PositionSizingService.calculate_position_size(
            account_balance=100000,
            risk_percentage=2.0,
            entry_price=500,
            stop_loss_price=450
        )
        
        # total_investment = 20000
        # position_size_percentage = 20000 / 100000 * 100 = 20%
        
        self.assertAlmostEqual(result['position_size_percentage'], 20.0, places=1)
    
    def test_preset_risk_levels(self):
        """Test preset risk level configurations."""
        presets = PositionSizingService.get_preset_risk_levels()
        
        self.assertIn('conservative', presets)
        self.assertIn('moderate', presets)
        self.assertIn('aggressive', presets)
        self.assertIn('very_aggressive', presets)
        
        # Verify conservative preset
        conservative = presets['conservative']
        self.assertEqual(conservative['risk_percentage'], 1.0)
        self.assertIn('name', conservative)
        self.assertIn('description', conservative)
        
        # Verify moderate preset (default)
        moderate = presets['moderate']
        self.assertEqual(moderate['risk_percentage'], 2.0)
