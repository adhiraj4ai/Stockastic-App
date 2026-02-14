from typing import Dict, List
from .base import BaseTool
from .stock_tools import GetStockPriceTool, SearchStocksTool
from .portfolio_tools import GetPortfolioTool, GetWatchlistTool
from .strategy_tools import (
    GetStrategySignalsTool, ListStrategiesTool, GetBrokerAccumulationSignalsTool, 
    GetSmartCrossoverSignalsTool, GetIchimokuSignalsTool, GetStrategyBacktestTool,
    OptimizeStrategyParamsTool, CompareStrategiesTool
)
from .market_tools import (
    GetMarketSummaryTool, GetSectorPerformanceTool, WhaleWatchTool, 
    Near52WeekHighTool, Near52WeekLowTool, GetMarketActivityReportTool,
    GetBrokerDetailedAccumulationTool, GetMarketBreadthTool, GetSectorRotationTool,
    GetRecentLargeTradesTool
)
from .notification_tools import GetNotificationsTool
from .system_tools import GetSystemStatusTool


from .fundamental_tools import (
    GetCompanyFundamentalsTool, GetFinancialRatiosTool, GetStockDividendsTool,
    CompareStocksTool, GetCorporateActionsTool
)
from .technical_tools import GetTechnicalIndicatorsTool, GetFibonacciLevelsTool
from .prediction_tools import GetStockPredictionTool
from .accumulation_tools import GetStockAccumulationTool, GetSmartMoneyAccumulationTool
from .broker_tools import GetBrokerPortfolioTool, GetBrokerTopPicksTool, GetBrokerTrendsTool
from .analysis_tools import (
    AnalyzePortfolioRiskTool, GetPortfolioDiversificationTool, 
    GetPortfolioOptimizationTool, GetStockCorrelationTool
)
from .more_tools import (
    GetIndexListTool, GetMarketDepthTool, GetPriceAlertsTool,
    GetSymbolTechnicalSummaryTool, GetMarketHolidayTool, GetBrokerHoldingsTool,
    GetSectorPivotPointsTool, GetVolatilityIndexTool, GetTrendContinuityTool,
    GetMACrossTool, GetVolumeSpikeTool
)
from .python_tools import PythonDataAnalysisTool

class ToolRegistry:
    """Central registry for all available tools"""
    
    _tools: Dict[str, BaseTool] = {}
    _initialized: bool = False
    
    @classmethod
    def register(cls, tool: BaseTool):
        """Register a tool"""
        cls._tools[tool.name] = tool
    
    @classmethod
    def get_tool(cls, name: str) -> BaseTool:
        """Get a tool by name"""
        if not cls._initialized:
            cls.initialize()
        return cls._tools.get(name)
    
    @classmethod
    def get_all_tools(cls) -> List[BaseTool]:
        """Get all registered tools"""
        if not cls._initialized:
            cls.initialize()
        return list(cls._tools.values())
    
    @classmethod
    def get_tool_definitions(cls) -> List[Dict]:
        """Get all tool definitions for LLM"""
        if not cls._initialized:
            cls.initialize()
        return [tool.get_definition() for tool in cls._tools.values()]
    
    @classmethod
    def initialize(cls):
        """Initialize and register all tools"""
        if cls._initialized:
            return
        
        tools = [
            GetStockPriceTool(),
            SearchStocksTool(),
            GetPortfolioTool(),
            GetWatchlistTool(),
            GetStrategySignalsTool(),
            ListStrategiesTool(),
            GetMarketSummaryTool(),
            GetSectorPerformanceTool(),
            GetNotificationsTool(),
            # New Tools
            GetCompanyFundamentalsTool(),
            GetFinancialRatiosTool(),
            GetTechnicalIndicatorsTool(),
            GetStockPredictionTool(),
            # Accumulation Tools
            GetStockAccumulationTool(),
            GetSmartMoneyAccumulationTool(),
            # Broker Tools
            GetBrokerPortfolioTool(),
            GetBrokerTopPicksTool(),
            GetBrokerTrendsTool(),
            # Analysis Tools
            AnalyzePortfolioRiskTool(),
            GetPortfolioDiversificationTool(),
            # Phase 4 Advanced Tools
            GetFibonacciLevelsTool(),
            GetStockDividendsTool(),
            WhaleWatchTool(),
            Near52WeekHighTool(),
            Near52WeekLowTool(),
            GetBrokerAccumulationSignalsTool(),
            GetSmartCrossoverSignalsTool(),
            GetIchimokuSignalsTool(),
            # Phase 5 Advanced Capabilities
            GetPortfolioOptimizationTool(),
            GetStockCorrelationTool(),
            GetMarketActivityReportTool(),
            GetBrokerDetailedAccumulationTool(),
            # Phase 6 Deep Analysis & Scanners (Consolidated here for Phase 11 progress)
            GetStrategyBacktestTool(),
            OptimizeStrategyParamsTool(),
            CompareStrategiesTool(),
            GetMarketBreadthTool(),
            GetSectorRotationTool(),
            GetRecentLargeTradesTool(),
            CompareStocksTool(),
            GetCorporateActionsTool(),
            GetSystemStatusTool(),
            # Additional Tools to reach 50+
            GetIndexListTool(),
            GetMarketDepthTool(),
            GetPriceAlertsTool(),
            GetSymbolTechnicalSummaryTool(),
            GetMarketHolidayTool(),
            GetBrokerHoldingsTool(),
            GetSectorPivotPointsTool(),
            GetVolatilityIndexTool(),
            GetTrendContinuityTool(),
            GetMACrossTool(),
            GetVolumeSpikeTool(),
            PythonDataAnalysisTool(),
        ]
        
        for tool in tools:
            cls.register(tool)
        
        cls._initialized = True
        print(f"ToolRegistry initialized with {len(cls._tools)} tools")
