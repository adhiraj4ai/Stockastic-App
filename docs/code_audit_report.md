# Stockastic Complete Project Code Quality Audit Report

This report presents a unified and comprehensive audit of all source files in the Stockastic workspace (both backend and frontend).

## Summary Metrics

*   **Total Files Audited**: 740
    *   **Python (Backend & Scripts)**: 430 files
    *   **JavaScript/TypeScript (Frontend)**: 310 files
*   **Files Missing Module-Level Comments**: 493 (66.6%)
*   **Files with Functions Exceeding 30 Lines**: 242 (32.7%)
*   **Huge Files (> 300 Lines)**: 123 (16.6%)

---

## 1. File-Level Purpose Comments / Docstrings

The coding standards require that **every file** has appropriate comments/docstrings near the top describing its purpose. Currently, **493 files** violate this standard.

### Sample Files Missing Docstrings:
#### Python Files:
- [test_streaming.py](file:////Users/jugalraj/Documents/Projects/Stockastic/test_streaming.py)
- [seed_permissions.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/seed_permissions.py)
- [__init__.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/fundamentals/migrations/__init__.py)
- [__init__.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/financials/migrations/__init__.py)
- [models.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/models.py)
- [serializers.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/serializers.py)
- [__init__.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/__init__.py)
- [apps.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/apps.py)
- [admin.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/admin.py)
- [urls.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/urls.py)
- [__init__.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/migrations/__init__.py)
- [__init__.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/tests/__init__.py)
- [test_saved_analyses.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/tests/test_saved_analyses.py)
- [test_streaming_helpers.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/tests/test_streaming_helpers.py)
- [__init__.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/services/__init__.py)
- ... and 204 more python files.

#### JavaScript/TypeScript Files:
- [playwright.config.ts](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/playwright.config.ts)
- [vitest.config.ts](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/vitest.config.ts)
- [vitest.setup.ts](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/vitest.setup.ts)
- [next.config.ts](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/next.config.ts)
- [accumulation.ts](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/types/accumulation.ts)
- [layout.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/layout.tsx)
- [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/auth/callback/[provider]/page.tsx)
- [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/signup/page.tsx)
- [layout.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/layout.tsx)
- [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/floorsheet/page.tsx)
- [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/settings/page.tsx)
- [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/broker/[id]/page.tsx)
- [ChatPageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/chat/ChatPageClient.tsx)
- [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/chat/page.tsx)
- [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/plan/page.tsx)
- ... and 259 more JS/TS files.

---

## 2. Functions/Methods Exceeding 30 Lines of Code

A strict limit of 30 lines of code per function/method is defined in the clean code standards. There are **{len(long_functions)} files** containing functions that violate this limit.

### Top Offenders (Functions/Methods with Largest Body Length):
| File | Language | Function/Method Name | Start Line | Lines of Code |
| :--- | :--- | :--- | :--- | :--- |
| [UsersManagementClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/admin/users/UsersManagementClient.tsx) | JavaScript/TypeScript | `UsersManagementClient` | 131 | 944 lines |
| [PipelinePageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/admin/pipeline/PipelinePageClient.tsx) | JavaScript/TypeScript | `PipelinePage` | 51 | 889 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx) | JavaScript/TypeScript | `StockDetailPage` | 113 | 837 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/dashboard/page.tsx) | JavaScript/TypeScript | `AccumulationDashboard` | 146 | 754 lines |
| [financialTemplates.ts](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/constants/financialTemplates.ts) | JavaScript/TypeScript | `export const FINANCIAL_TEMPLATES: Record<string, FinancialTe...` | 23 | 721 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/settings/page.tsx) | JavaScript/TypeScript | `SettingsPage` | 44 | 711 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/smart-money/page.tsx) | JavaScript/TypeScript | `SmartMoneyPage` | 104 | 678 lines |
| [RecommendationsPageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/recommendations/RecommendationsPageClient.tsx) | JavaScript/TypeScript | `RecommendationsPage` | 55 | 674 lines |
| [TrainPageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/forecasts/train/TrainPageClient.tsx) | JavaScript/TypeScript | `TrainModelPage` | 41 | 671 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/portfolio/watchlist/page.tsx) | JavaScript/TypeScript | `WatchlistPage` | 69 | 628 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/plan/page.tsx) | JavaScript/TypeScript | `PlanPage` | 129 | 627 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/compare/page.tsx) | JavaScript/TypeScript | `StrategyComparePage` | 56 | 624 lines |
| [SignalsPageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/signals/SignalsPageClient.tsx) | JavaScript/TypeScript | `SignalsPage` | 415 | 617 lines |
| [ForecastsPageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/forecasts/ForecastsPageClient.tsx) | JavaScript/TypeScript | `ForecastsPage` | 50 | 520 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/[id]/backtest/page.tsx) | JavaScript/TypeScript | `BacktestContent` | 62 | 510 lines |
| [DashboardLayout.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/DashboardLayout.tsx) | JavaScript/TypeScript | `})` | 59 | 482 lines |
| [TrackRecordClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/signals/track-record/TrackRecordClient.tsx) | JavaScript/TypeScript | `TrackRecordClient` | 417 | 452 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/broker/[id]/page.tsx) | JavaScript/TypeScript | `BrokerPage` | 66 | 446 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/[id]/optimize/page.tsx) | JavaScript/TypeScript | `OptimizePage` | 48 | 444 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/market/page.tsx) | JavaScript/TypeScript | `MarketTerminalPage` | 54 | 406 lines |
| [DailySignalStatus.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/signals/DailySignalStatus.tsx) | JavaScript/TypeScript | `` | 450 | 400 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/smart-money/page.tsx) | JavaScript/TypeScript | `` | 430 | 386 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/floorsheet/page.tsx) | JavaScript/TypeScript | `FloorsheetContent` | 44 | 366 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/focus-ranking/page.tsx) | JavaScript/TypeScript | `FocusRankingPage` | 60 | 363 lines |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/[id]/editor/page.tsx) | JavaScript/TypeScript | `EditStrategyPage` | 40 | 347 lines |

*(804 other functions/methods exceed the 30-line limit.)*

---

## 3. Huge Files (> 300 Lines)

The following **123 files** exceed the threshold of 300 lines, representing a significant risk of violating the Single Responsibility Principle:

| File | Language | Total Lines |
| :--- | :--- | :--- |
| [tools.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/tools.py) | Python | 3899 |
| [seed_strategies.py](file:////Users/jugalraj/Documents/Projects/Stockastic/seed_strategies.py) | Python | 2050 |
| [recommendations.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/views/recommendations.py) | Python | 1799 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/portfolio/page.tsx) | JavaScript/TypeScript | 1451 |
| [broker_research.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/services/broker_research.py) | Python | 1340 |
| [DailySignalStatus.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/signals/DailySignalStatus.tsx) | JavaScript/TypeScript | 1316 |
| [strategy.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/views/strategy.py) | Python | 1173 |
| [PipelinePageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/admin/pipeline/PipelinePageClient.tsx) | JavaScript/TypeScript | 1171 |
| [seed_strategies.py](file:////Users/jugalraj/Documents/Projects/Stockastic/scripts/seed_strategies.py) | Python | 1158 |
| [portfolio.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/views/portfolio.py) | Python | 1140 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/price-study/page.tsx) | JavaScript/TypeScript | 1119 |
| [UsersManagementClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/admin/users/UsersManagementClient.tsx) | JavaScript/TypeScript | 1118 |
| [IntelHubClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/signals/IntelHubClient.tsx) | JavaScript/TypeScript | 1103 |
| [SignalsPageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/signals/SignalsPageClient.tsx) | JavaScript/TypeScript | 1072 |
| [market.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/views/market.py) | Python | 1064 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx) | JavaScript/TypeScript | 1056 |
| [NotebookInterface.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/chat/NotebookInterface.tsx) | JavaScript/TypeScript | 999 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/dashboard/page.tsx) | JavaScript/TypeScript | 969 |
| [SettingsDialog.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/SettingsDialog.tsx) | JavaScript/TypeScript | 963 |
| [PriceActionTerminal.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/ticker/PriceActionTerminal.tsx) | JavaScript/TypeScript | 917 |
| [TrackRecordClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/signals/track-record/TrackRecordClient.tsx) | JavaScript/TypeScript | 901 |
| [library.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/services/strategy_framework/library.py) | Python | 868 |
| [FinancialReportEditor.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/FinancialReportEditor.tsx) | JavaScript/TypeScript | 866 |
| [ExperimentsTab.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/[id]/tabs/ExperimentsTab.tsx) | JavaScript/TypeScript | 846 |
| [TickerSignals.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/ticker/TickerSignals.tsx) | JavaScript/TypeScript | 836 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/smart-money/page.tsx) | JavaScript/TypeScript | 829 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/settings/page.tsx) | JavaScript/TypeScript | 808 |
| [TrainPageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/forecasts/train/TrainPageClient.tsx) | JavaScript/TypeScript | 805 |
| [views.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/users/views.py) | Python | 798 |
| [RecommendationsPageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/recommendations/RecommendationsPageClient.tsx) | JavaScript/TypeScript | 795 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/plan/page.tsx) | JavaScript/TypeScript | 788 |
| [financialTemplates.ts](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/constants/financialTemplates.ts) | JavaScript/TypeScript | 768 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/compare/page.tsx) | JavaScript/TypeScript | 740 |
| [test_broker_research_refactor.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/tests/test_broker_research_refactor.py) | Python | 734 |
| [ChatInterface.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/chat/ChatInterface.tsx) | JavaScript/TypeScript | 724 |
| [optimization_service.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/services/optimization_service.py) | Python | 720 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/portfolio/watchlist/page.tsx) | JavaScript/TypeScript | 720 |
| [NotebookDashboard.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/chat/NotebookDashboard.tsx) | JavaScript/TypeScript | 717 |
| [sector_rotation.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/views/sector_rotation.py) | Python | 704 |
| [FullFeaturedChart.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/ticker/FullFeaturedChart.tsx) | JavaScript/TypeScript | 672 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/market/movers/page.tsx) | JavaScript/TypeScript | 643 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/[id]/backtest/page.tsx) | JavaScript/TypeScript | 635 |
| [DashboardLayout.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/DashboardLayout.tsx) | JavaScript/TypeScript | 624 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/[id]/optimize/page.tsx) | JavaScript/TypeScript | 608 |
| [ForecastsPageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/forecasts/ForecastsPageClient.tsx) | JavaScript/TypeScript | 607 |
| [FibonacciRetracement.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/ticker/FibonacciRetracement.tsx) | JavaScript/TypeScript | 562 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/broker/[id]/page.tsx) | JavaScript/TypeScript | 560 |
| [TickerAccumulation.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/ticker/TickerAccumulation.tsx) | JavaScript/TypeScript | 555 |
| [price_forecast.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/views/price_forecast.py) | Python | 549 |
| [ExitStrategyDialog.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/ExitStrategyDialog.tsx) | JavaScript/TypeScript | 527 |
| [test_money_math.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/tests/test_money_math.py) | Python | 511 |
| [optimize_multi_period.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/optimize_multi_period.py) | Python | 510 |
| [BookmarkDetailModal.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/chat/BookmarkDetailModal.tsx) | JavaScript/TypeScript | 485 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/market/page.tsx) | JavaScript/TypeScript | 484 |
| [test_chat_stream.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/tests/integration/test_chat_stream.py) | Python | 461 |
| [seed_misc_financials.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/management/commands/seed_misc_financials.py) | Python | 456 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/page.tsx) | JavaScript/TypeScript | 456 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/floorsheet/page.tsx) | JavaScript/TypeScript | 454 |
| [MessageBubble.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/chat/MessageBubble.tsx) | JavaScript/TypeScript | 453 |
| [fetch_fundamentals.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/management/commands/fetch_fundamentals.py) | Python | 452 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/focus-ranking/page.tsx) | JavaScript/TypeScript | 451 |
| [test_saved_analyses.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/tests/test_saved_analyses.py) | Python | 448 |
| [portfolio_service.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/services/portfolio_service.py) | Python | 442 |
| [TransactionHistory.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/TransactionHistory.tsx) | JavaScript/TypeScript | 442 |
| [test_daily_plan.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/tests/test_daily_plan.py) | Python | 439 |
| [test_optimization_service_refactor.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/tests/test_optimization_service_refactor.py) | Python | 438 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/[id]/experiments/[expId]/page.tsx) | JavaScript/TypeScript | 438 |
| [0001_initial.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/migrations/0001_initial.py) | Python | 431 |
| [broker.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/views/broker.py) | Python | 413 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/[id]/editor/page.tsx) | JavaScript/TypeScript | 413 |
| [seed_adbl_quarterly.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/management/commands/seed_adbl_quarterly.py) | Python | 411 |
| [registry.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/services/strategy_framework/registry.py) | Python | 410 |
| [TickerSmartMoney.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/ticker/TickerSmartMoney.tsx) | JavaScript/TypeScript | 403 |
| [TransactionModal.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/TransactionModal.tsx) | JavaScript/TypeScript | 402 |
| [fundamental_calculator.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/services/fundamental_calculator.py) | Python | 401 |
| [ForecastResultView.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/forecasts/ForecastResultView.tsx) | JavaScript/TypeScript | 401 |
| [test_backtest_harness_refactor.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/tests/test_backtest_harness_refactor.py) | Python | 400 |
| [FinancialsPageClient.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/admin/financials/FinancialsPageClient.tsx) | JavaScript/TypeScript | 400 |
| [MarketSummary.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/MarketSummary.tsx) | JavaScript/TypeScript | 397 |
| [test_notifications_api.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/tests/test_notifications_api.py) | Python | 395 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/market/activity/page.tsx) | JavaScript/TypeScript | 394 |
| [pipeline.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/views/pipeline.py) | Python | 390 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/share-transfer/page.tsx) | JavaScript/TypeScript | 386 |
| [test_misc_services_refactor.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/tests/test_misc_services_refactor.py) | Python | 375 |
| [settings.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stockastic/settings.py) | Python | 375 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/trends/page.tsx) | JavaScript/TypeScript | 373 |
| [AdminFundamentals.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/AdminFundamentals.tsx) | JavaScript/TypeScript | 370 |
| [ChatInfiniteScrollTimeline.test.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/__tests__/integration/ChatInfiniteScrollTimeline.test.tsx) | JavaScript/TypeScript | 363 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/forecasts/train/[jobId]/page.tsx) | JavaScript/TypeScript | 361 |
| [test_portfolio_service_refactor.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/tests/test_portfolio_service_refactor.py) | Python | 358 |
| [AdminFinancials.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/AdminFinancials.tsx) | JavaScript/TypeScript | 358 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/market/volume-profile/page.tsx) | JavaScript/TypeScript | 350 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/market/rotation/page.tsx) | JavaScript/TypeScript | 350 |
| [PositionSizingCalculator.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/PositionSizingCalculator.tsx) | JavaScript/TypeScript | 350 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/[id]/page.tsx) | JavaScript/TypeScript | 349 |
| [test_fundamental_calculator.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/tests/test_fundamental_calculator.py) | Python | 348 |
| [PortfolioTable.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/PortfolioTable.tsx) | JavaScript/TypeScript | 341 |
| [accumulation_mixin.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/views/accumulation_mixin.py) | Python | 338 |
| [BookmarkCatalog.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/chat/BookmarkCatalog.tsx) | JavaScript/TypeScript | 337 |
| [test_opportunity_engine_refactor.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/tests/test_opportunity_engine_refactor.py) | Python | 336 |
| [SectorStudyComponents.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/market/rotation/SectorStudyComponents.tsx) | JavaScript/TypeScript | 328 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/portfolio/optimize/page.tsx) | JavaScript/TypeScript | 326 |
| [TickerLiquidity.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/ticker/TickerLiquidity.tsx) | JavaScript/TypeScript | 326 |
| [OptimizePortfolioDialog.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/OptimizePortfolioDialog.tsx) | JavaScript/TypeScript | 323 |
| [test_chat_e2e.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/tests/e2e/test_chat_e2e.py) | Python | 317 |
| [SimpleCards.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/chat/gen-ui/SimpleCards.tsx) | JavaScript/TypeScript | 316 |
| [ChatInterface.test.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/__tests__/integration/ChatInterface.test.tsx) | JavaScript/TypeScript | 316 |
| [PortfolioGoals.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/PortfolioGoals.tsx) | JavaScript/TypeScript | 313 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/market/bulk/page.tsx) | JavaScript/TypeScript | 312 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/below-cost/page.tsx) | JavaScript/TypeScript | 311 |
| [test_chat_plan_tools.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/tests/test_chat_plan_tools.py) | Python | 310 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/favorites/page.tsx) | JavaScript/TypeScript | 310 |
| [TopGainersChart.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/TopGainersChart.tsx) | JavaScript/TypeScript | 310 |
| [daily_plan.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/services/daily_plan.py) | Python | 308 |
| [strategy_scan.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/services/strategy_scan.py) | Python | 307 |
| [position_sizing.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/services/position_sizing.py) | Python | 306 |
| [BrokerAnalysis.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/components/ticker/BrokerAnalysis.tsx) | JavaScript/TypeScript | 306 |
| [dividend_service.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/services/dividend_service.py) | Python | 305 |
| [views.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/chat/views.py) | Python | 304 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/accumulation/history/page.tsx) | JavaScript/TypeScript | 304 |
| [floorsheet.py](file:////Users/jugalraj/Documents/Projects/Stockastic/backend/stocks/views/floorsheet.py) | Python | 303 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/strategies/[id]/builder/page.tsx) | JavaScript/TypeScript | 302 |
| [page.tsx](file:////Users/jugalraj/Documents/Projects/Stockastic/frontend/src/app/(authenticated)/market/matching/page.tsx) | JavaScript/TypeScript | 302 |
