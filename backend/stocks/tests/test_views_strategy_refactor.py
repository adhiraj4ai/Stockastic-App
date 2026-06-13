"""
Smoke tests: verify every class in the strategy views package is importable
and non-None after the refactor into stocks/views/strategy/.
"""
import pytest


@pytest.mark.django_db
def test_strategy_viewset_importable():
    from stocks.views.strategy import StrategyViewSet
    assert StrategyViewSet is not None


@pytest.mark.django_db
def test_strategy_signal_viewset_importable():
    from stocks.views.strategy import StrategySignalViewSet
    assert StrategySignalViewSet is not None


@pytest.mark.django_db
def test_generated_signal_viewset_importable():
    from stocks.views.strategy import GeneratedSignalViewSet
    assert GeneratedSignalViewSet is not None


@pytest.mark.django_db
def test_experiment_logger_importable():
    from stocks.views.strategy import ExperimentLogger
    assert ExperimentLogger is not None


@pytest.mark.django_db
def test_experiment_logger_behavior():
    from stocks.views.strategy import ExperimentLogger
    logger = ExperimentLogger()
    logger.log_param('lr', 0.01)
    logger.log_metric('accuracy', 0.95)
    assert logger.params == {'lr': 0.01}
    assert logger.metrics == {'accuracy': 0.95}


@pytest.mark.django_db
def test_strategy_signal_pagination_importable():
    from stocks.views.strategy import StrategySignalPagination
    assert StrategySignalPagination is not None
    assert StrategySignalPagination.page_size == 100


@pytest.mark.django_db
def test_generated_signal_pagination_importable():
    from stocks.views.strategy import GeneratedSignalPagination
    assert GeneratedSignalPagination is not None
    assert GeneratedSignalPagination.page_size == 200


@pytest.mark.django_db
def test_package_all_exports():
    """Ensure __all__ contains every intended export."""
    import stocks.views.strategy as pkg
    expected = {
        'ExperimentLogger',
        'StrategyViewSet',
        'StrategySignalPagination',
        'StrategySignalViewSet',
        'GeneratedSignalPagination',
        'GeneratedSignalViewSet',
    }
    assert expected <= set(pkg.__all__)
