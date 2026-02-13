'use client';

import React from 'react';
import { Info } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface IndicatorTooltipProps {
    name: string;
    description: string;
}

const indicatorDescriptions: Record<string, string> = {
    // Fundamental Indicators
    'P/E Ratio': 'Price-to-Earnings ratio measures stock price relative to earnings per share. Lower values may indicate undervaluation.',
    'P/B Ratio': 'Price-to-Book ratio compares market value to book value. Values below 1 may suggest undervaluation.',
    'ROE (%)': 'Return on Equity measures profitability relative to shareholder equity. Higher values indicate better returns.',
    'EPS': 'Earnings Per Share represents company profit allocated to each share. Higher is generally better.',
    'Dividend Yield': 'Annual dividend payment as a percentage of stock price. Higher yields may indicate good income potential.',
    'Book Value': 'Net asset value per share. Represents the theoretical value if the company were liquidated.',
    'Market Cap': 'Total market value of all outstanding shares. Indicates company size.',

    // Momentum Indicators
    'RSI': 'Relative Strength Index (0-100) measures momentum. Above 70 suggests overbought, below 30 suggests oversold.',
    'MACD': 'Moving Average Convergence Divergence shows trend direction and momentum. Positive values indicate bullish momentum.',
    'Stochastic': 'Oscillator comparing closing price to price range. Above 80 is overbought, below 20 is oversold.',
    'Williams %R': 'Momentum indicator similar to Stochastic. Values between -20 and 0 indicate overbought conditions.',
    'ROC': 'Rate of Change measures price momentum. Positive values indicate upward momentum.',
    'CCI': 'Commodity Channel Index measures deviation from average price. Above +100 is overbought, below -100 is oversold.',

    // Trend Indicators
    'SMA 20': 'Simple Moving Average over 20 periods. Price above SMA suggests uptrend.',
    'SMA 50': 'Simple Moving Average over 50 periods. Commonly used for medium-term trend identification.',
    'SMA 200': 'Simple Moving Average over 200 periods. Key long-term trend indicator.',
    'EMA 12': 'Exponential Moving Average giving more weight to recent prices. Faster than SMA.',
    'EMA 26': 'Exponential Moving Average used in MACD calculation.',
    'ADX': 'Average Directional Index measures trend strength. Above 25 indicates strong trend.',
    'Aroon': 'Identifies trend changes and strength. Values above 50 indicate uptrend.',

    // Volatility Indicators
    'ATR': 'Average True Range measures market volatility. Higher values indicate more volatility.',
    'Bollinger Bands': 'Volatility bands around moving average. Price touching upper band suggests overbought.',
    'Standard Deviation': 'Measures price dispersion from average. Higher values indicate more volatility.',
    'Keltner Channel': 'Volatility-based envelope around price. Similar to Bollinger Bands.',

    // Volume Indicators
    'OBV': 'On-Balance Volume relates volume to price changes. Rising OBV confirms uptrend.',
    'Volume SMA': 'Average volume over period. Helps identify unusual volume activity.',
    'MFI': 'Money Flow Index combines price and volume. Above 80 is overbought, below 20 is oversold.',
    'A/D Line': 'Accumulation/Distribution Line measures buying/selling pressure based on volume.',
    'VWAP': 'Volume Weighted Average Price. Price above VWAP suggests bullish sentiment.',
};

export default function IndicatorTooltip({ name, description }: IndicatorTooltipProps) {
    const tooltipText = indicatorDescriptions[name] || description || 'No description available';

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button className="inline-flex items-center ml-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        <Info size={12} />
                    </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs bg-slate-900 dark:bg-slate-800 text-white p-3 rounded-lg shadow-lg">
                    <p className="text-xs leading-relaxed">{tooltipText}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
