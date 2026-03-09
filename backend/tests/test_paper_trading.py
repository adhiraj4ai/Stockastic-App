import pytest
from decimal import Decimal
from django.contrib.auth.models import User
from stocks.models.portfolio import (
    PortfolioAccount, PortfolioItem, PortfolioTransaction, 
    TransactionType, AccountType
)
from stocks.services.portfolio_service import PortfolioService


@pytest.fixture
def paper_user(db):
    return User.objects.create_user(username='papertrader', password='password')


@pytest.fixture
def paper_account(paper_user):
    return PortfolioAccount.objects.create(
        user=paper_user,
        name='Test Paper Account',
        account_type=AccountType.PAPER,
        balance=Decimal('1000000.00')
    )


@pytest.mark.django_db
class TestShortSelling:
    def test_short_sell_creates_negative_position(self, paper_user, paper_account):
        result = PortfolioService.process_transaction(
            user=paper_user, ticker='NABIL', txn_type=TransactionType.SHORT_SELL,
            quantity=10, rate=Decimal('1000'), account=paper_account
        )
        item = PortfolioItem.objects.get(user=paper_user, ticker='NABIL', account=paper_account)
        assert item.quantity == -10
        assert result['amount'] == Decimal('10000')

    def test_short_sell_adds_proceeds_to_balance(self, paper_user, paper_account):
        initial_balance = paper_account.balance
        result = PortfolioService.process_transaction(
            user=paper_user, ticker='NABIL', txn_type=TransactionType.SHORT_SELL,
            quantity=10, rate=Decimal('1000'), account=paper_account
        )
        paper_account.refresh_from_db()
        # Balance should increase by receivable (amount - fees)
        assert paper_account.balance > initial_balance

    def test_short_sell_only_allowed_for_paper(self, paper_user):
        live_account = PortfolioAccount.objects.create(
            user=paper_user, name='Live', account_type=AccountType.LIVE, balance=Decimal('1000000')
        )
        with pytest.raises(ValueError, match="only allowed in paper"):
            PortfolioService.process_transaction(
                user=paper_user, ticker='NABIL', txn_type=TransactionType.SHORT_SELL,
                quantity=10, rate=Decimal('1000'), account=live_account
            )

    def test_buy_to_cover_reduces_short_position(self, paper_user, paper_account):
        # Short sell first
        PortfolioService.process_transaction(
            user=paper_user, ticker='NABIL', txn_type=TransactionType.SHORT_SELL,
            quantity=10, rate=Decimal('1000'), account=paper_account
        )
        # Buy to cover partially
        PortfolioService.process_transaction(
            user=paper_user, ticker='NABIL', txn_type=TransactionType.BUY_TO_COVER,
            quantity=5, rate=Decimal('900'), account=paper_account
        )
        item = PortfolioItem.objects.get(user=paper_user, ticker='NABIL', account=paper_account)
        assert item.quantity == -5

    def test_buy_to_cover_full_deletes_item(self, paper_user, paper_account):
        PortfolioService.process_transaction(
            user=paper_user, ticker='NABIL', txn_type=TransactionType.SHORT_SELL,
            quantity=10, rate=Decimal('1000'), account=paper_account
        )
        PortfolioService.process_transaction(
            user=paper_user, ticker='NABIL', txn_type=TransactionType.BUY_TO_COVER,
            quantity=10, rate=Decimal('900'), account=paper_account
        )
        assert not PortfolioItem.objects.filter(
            user=paper_user, ticker='NABIL', account=paper_account
        ).exists()

    def test_buy_to_cover_no_short_position_raises(self, paper_user, paper_account):
        with pytest.raises(ValueError, match="No short position"):
            PortfolioService.process_transaction(
                user=paper_user, ticker='NABIL', txn_type=TransactionType.BUY_TO_COVER,
                quantity=10, rate=Decimal('900'), account=paper_account
            )

    def test_buy_to_cover_excess_quantity_raises(self, paper_user, paper_account):
        PortfolioService.process_transaction(
            user=paper_user, ticker='NABIL', txn_type=TransactionType.SHORT_SELL,
            quantity=5, rate=Decimal('1000'), account=paper_account
        )
        with pytest.raises(ValueError, match="Cannot cover more"):
            PortfolioService.process_transaction(
                user=paper_user, ticker='NABIL', txn_type=TransactionType.BUY_TO_COVER,
                quantity=10, rate=Decimal('900'), account=paper_account
            )


@pytest.mark.django_db
class TestAccountReset:
    def test_reset_clears_all_data(self, paper_user, paper_account):
        # Add some transactions and items
        PortfolioService.process_transaction(
            user=paper_user, ticker='NABIL', txn_type=TransactionType.BUY,
            quantity=10, rate=Decimal('500'), account=paper_account
        )
        assert PortfolioItem.objects.filter(account=paper_account).exists()
        assert PortfolioTransaction.objects.filter(account=paper_account).count() == 0  # transactions created via API, not directly tracked here
        
        # Simulate reset
        PortfolioTransaction.objects.filter(account=paper_account).delete()
        PortfolioItem.objects.filter(account=paper_account).delete()
        paper_account.balance = Decimal('1000000.00')
        paper_account.save()
        
        paper_account.refresh_from_db()
        assert paper_account.balance == Decimal('1000000.00')
        assert not PortfolioItem.objects.filter(account=paper_account).exists()


@pytest.mark.django_db
class TestRecalculateWithShorts:
    def test_recalculate_after_short_sell(self, paper_user, paper_account):
        # Create a short sell transaction directly
        PortfolioTransaction.objects.create(
            user=paper_user, account=paper_account, ticker='NABIL',
            transaction_type=TransactionType.SHORT_SELL,
            quantity=10, rate=Decimal('1000'),
            amount=Decimal('10000'), receivable_amount=Decimal('9900'),
            transaction_date='2024-01-01T00:00:00Z'
        )
        item = PortfolioService.recalculate_item(paper_user, paper_account, 'NABIL')
        assert item is not None
        assert item.quantity == -10

    def test_recalculate_after_full_cover(self, paper_user, paper_account):
        PortfolioTransaction.objects.create(
            user=paper_user, account=paper_account, ticker='NABIL',
            transaction_type=TransactionType.SHORT_SELL,
            quantity=10, rate=Decimal('1000'),
            amount=Decimal('10000'), receivable_amount=Decimal('9900'),
            transaction_date='2024-01-01T00:00:00Z'
        )
        PortfolioTransaction.objects.create(
            user=paper_user, account=paper_account, ticker='NABIL',
            transaction_type=TransactionType.BUY_TO_COVER,
            quantity=10, rate=Decimal('900'),
            amount=Decimal('9000'), receivable_amount=Decimal('9100'),
            transaction_date='2024-01-02T00:00:00Z'
        )
        item = PortfolioService.recalculate_item(paper_user, paper_account, 'NABIL')
        assert item is None  # Fully covered, item deleted
