import pytest
from django.contrib.auth.models import User
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from stocks.models.portfolio import PortfolioItem


@pytest.mark.django_db
class TestPortfolioItemClassification:
    def _user(self):
        return User.objects.create_user(username='clsuser', password='pw')

    def test_new_holding_defaults_to_trading(self):
        user = self._user()
        item = PortfolioItem.objects.create(
            user=user, ticker='NABIL', quantity=10, buy_price=500
        )
        assert item.classification == 'trading'

    def test_classification_choices_are_keywords(self):
        assert PortfolioItem.Classification.INVESTMENT == 'investment'
        assert PortfolioItem.Classification.TRADING == 'trading'
        assert set(PortfolioItem.Classification.values) == {'investment', 'trading'}


@pytest.mark.django_db
class TestUpdateClassificationAction:
    def _client_and_item(self):
        user = User.objects.create_user(username='clsapi', password='pw')
        client = APIClient()
        client.force_authenticate(user=user)
        item = PortfolioItem.objects.create(
            user=user, ticker='NABIL', quantity=10, buy_price=500
        )
        return client, item

    def test_set_to_investment(self):
        client, item = self._client_and_item()
        url = reverse('portfolio-update-classification', args=[item.id])
        res = client.patch(url, {'classification': 'investment'}, format='json')
        assert res.status_code == status.HTTP_200_OK
        assert res.data['classification'] == 'investment'
        item.refresh_from_db()
        assert item.classification == 'investment'

    def test_invalid_value_rejected(self):
        client, item = self._client_and_item()
        url = reverse('portfolio-update-classification', args=[item.id])
        res = client.patch(url, {'classification': 'gambling'}, format='json')
        assert res.status_code == status.HTTP_400_BAD_REQUEST
        item.refresh_from_db()
        assert item.classification == 'trading'

    def test_serializer_exposes_classification(self):
        client, item = self._client_and_item()
        res = client.get(reverse('portfolio-list'))
        assert res.status_code == status.HTTP_200_OK
        assert 'classification' in res.data[0]
