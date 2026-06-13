import os
import re

files_with_echarts = [
    "src/components/ChatInterface.tsx", "src/components/SectorTreemap.tsx", "src/components/SentimentGauge.tsx",
    "src/components/MarketHeatmap.tsx", "src/components/Sparkline.tsx", "src/components/StockChart.tsx",
    "src/components/MarketHealthRadar.tsx", "src/components/ticker/AdvancedCharting.tsx", "src/components/ticker/TickerLiquidity.tsx",
    "src/components/ticker/PriceActionTerminal.tsx", "src/components/ticker/TickerSmartMoney.tsx", "src/components/ticker/BrokerAnalysis.tsx",
    "src/components/ticker/TickerAccumulation.tsx", "src/components/ticker/FullFeaturedChart.tsx", "src/components/MarketBreadthTrend.tsx",
    "src/components/BrokerFlowChart.tsx", "src/components/forecasts/ForecastResultView.tsx", "src/components/MarketBubbleMap.tsx",
    "src/components/TopGainersChart.tsx", "src/app/(authenticated)/floorsheet/page.tsx", "src/app/(authenticated)/accumulation/price-study/page.tsx",
    "src/app/(authenticated)/accumulation/focus-ranking/page.tsx", "src/app/(authenticated)/accumulation/smart-money/page.tsx",
    "src/app/(authenticated)/accumulation/dashboard/page.tsx", "src/app/(authenticated)/accumulation/navigator/page.tsx",
    "src/app/(authenticated)/accumulation/share-transfer/page.tsx", "src/app/(authenticated)/ticker/[ticker]/page.tsx",
    "src/app/(authenticated)/market/volume-profile/page.tsx", "src/app/(authenticated)/market/rotation/SectorStudyComponents.tsx",
    "src/app/(authenticated)/forecasts/train/[jobId]/page.tsx"
]

for filepath in files_with_echarts:
    if not os.path.exists(filepath): continue
    
    with open(filepath, "r") as f:
        content = f.read()
        
    original = content
    
    # Replace import
    content = re.sub(r"import\s+ReactECharts\s+from\s+['\"]echarts-for-react['\"];?", "import { ThemeAwareECharts } from '@/components/ThemeAwareECharts';", content)
    
    # Replace Component
    content = content.replace("<ReactECharts", "<ThemeAwareECharts")
    content = content.replace("</ReactECharts>", "</ThemeAwareECharts>")
    
    # Optional: we can strip the 'backgroundColor: ...' hardcoded strings?
    # Actually, ECharts options map can be complex so let's just do it cleanly now.
    
    if content != original:
        with open(filepath, "w") as f:
            f.write(content)
        print(f"Updated {filepath}")
