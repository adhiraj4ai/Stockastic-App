"""Chat-test fixtures.

Company (stocks.models.market) is Meta.managed = False — its table is never
created by the test runner. Tests here that validate tickers against Company
need the table, so we create it once per session via the schema editor.
"""
import pytest


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    from django.db import connection
    from stocks.models.market import Company

    with django_db_blocker.unblock():
        if Company._meta.db_table not in connection.introspection.table_names():
            with connection.schema_editor() as schema_editor:
                schema_editor.create_model(Company)
    yield
