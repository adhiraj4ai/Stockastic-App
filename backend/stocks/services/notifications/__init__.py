from .checkers.portfolio import PortfolioChecker
from .checkers.watchlist import WatchlistChecker
from .checkers.zone_entry import ZoneEntryChecker
from .checkers.active_signal import ActiveSignalChecker
from .checkers.signals import SignalsChecker
from .checkers.whale_watch import WhaleWatchChecker
from .checkers.accumulation_trend import AccumulationTrendChecker
from .checkers.technical import TechnicalChecker
from .checkers.broker_discovery import BrokerDiscoveryChecker
from .checkers.portfolio_management import PortfolioManagementChecker
from .orchestrator import NotificationOrchestrator

DEFAULT_CHECKERS = [
    PortfolioChecker(),
    WatchlistChecker(),
    ZoneEntryChecker(),
    ActiveSignalChecker(),
    SignalsChecker(),
    WhaleWatchChecker(),
    AccumulationTrendChecker(),
    TechnicalChecker(),
    BrokerDiscoveryChecker(),
    PortfolioManagementChecker(),
]

default_orchestrator = NotificationOrchestrator(checkers=DEFAULT_CHECKERS)
