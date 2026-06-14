# backend/stocks/tests/conftest.py
"""Test fixtures for the stocks app.

DailyStockPrice (and the other market.py models) are Meta.managed = False —
they map to externally-managed tables that Django's test runner never creates.
Tests that insert price rows need the table to exist, so we create it once per
session via the schema editor. Per-test DML is still rolled back by the normal
`db` transaction; only the table DDL persists for the session.
"""
import pytest
from rest_framework.test import APIClient
from django.contrib.auth.models import User


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    from django.db import connection
    from stocks.models.market import (
        Company,
        DailyStockPrice,
        DailyFloorsheet,
        DailyCumulativeAccumulation,
    )

    unmanaged_models = [Company, DailyStockPrice, DailyFloorsheet, DailyCumulativeAccumulation]
    with django_db_blocker.unblock():
        existing = connection.introspection.table_names()
        for model in unmanaged_models:
            if model._meta.db_table not in existing:
                with connection.schema_editor() as schema_editor:
                    schema_editor.create_model(model)
    yield


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def create_user(db):
    def make_user(**kwargs):
        return User.objects.create_user(**kwargs)
    return make_user


@pytest.fixture
def auth_client(api_client, create_user):
    user = create_user(username='testuser', password='password')
    api_client.force_authenticate(user=user)
    return api_client
