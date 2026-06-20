import pytest
from django.contrib.auth.models import User
from stocks.models.portfolio import PortfolioAccount
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient


@pytest.mark.django_db
class TestAccountIsDefaultField:
    def test_new_account_is_not_default(self):
        user = User.objects.create_user(username='acctuser', password='pw')
        acct = PortfolioAccount.objects.create(user=user, name='Main')
        assert acct.is_default is False


@pytest.mark.django_db
class TestSetDefaultAction:
    def _setup(self):
        user = User.objects.create_user(username='setdef', password='pw')
        client = APIClient()
        client.force_authenticate(user=user)
        a = PortfolioAccount.objects.create(user=user, name='A')
        b = PortfolioAccount.objects.create(user=user, name='B')
        return client, a, b

    def test_set_default_marks_one_and_clears_others(self):
        client, a, b = self._setup()
        res = client.post(reverse('portfolio-accounts-set-default', args=[a.id]))
        assert res.status_code == status.HTTP_200_OK
        assert res.data['is_default'] is True
        a.refresh_from_db(); b.refresh_from_db()
        assert a.is_default is True and b.is_default is False

        client.post(reverse('portfolio-accounts-set-default', args=[b.id]))
        a.refresh_from_db(); b.refresh_from_db()
        assert b.is_default is True and a.is_default is False

    def test_set_default_does_not_touch_other_users_accounts(self):
        client, a, _ = self._setup()
        other = User.objects.create_user(username='other', password='pw')
        other_default = PortfolioAccount.objects.create(user=other, name='O', is_default=True)
        client.post(reverse('portfolio-accounts-set-default', args=[a.id]))
        other_default.refresh_from_db()
        assert other_default.is_default is True

    def test_serializer_exposes_is_default(self):
        client, a, _ = self._setup()
        res = client.get(reverse('portfolio-accounts-list'))
        assert res.status_code == status.HTTP_200_OK
        assert 'is_default' in res.data[0]
