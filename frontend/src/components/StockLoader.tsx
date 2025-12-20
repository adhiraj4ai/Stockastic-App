'use client';

interface StockLoaderProps {
    status?: string;
}

export function StockLoader({ status = "ANALYZING MARKET" }: StockLoaderProps) {
    return (
        <div className="flex flex-row items-center gap-3">
            {/* Animated SVG Chart - Compact Icon */}
            <div className="relative w-12 h-8 flex-none">
                <svg viewBox="0 0 100 60" className="w-full h-full overflow-visible">
                    {/* Defs for gradients */}
                    <defs>
                        <linearGradient id="bar-gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#e2e8f0" stopOpacity="0.8" />
                            <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.2" />
                        </linearGradient>
                    </defs>

                    {/* Background Bars (Volume) - Staggered Pulse Animation */}
                    <g className="bars">
                        <rect x="10" y="30" width="8" height="30" rx="2" fill="url(#bar-gradient)" className="animate-[pulse_1.5s_ease-in-out_infinite_0ms]" />
                        <rect x="25" y="40" width="8" height="20" rx="2" fill="url(#bar-gradient)" className="animate-[pulse_1.5s_ease-in-out_infinite_200ms]" />
                        <rect x="40" y="20" width="8" height="40" rx="2" fill="url(#bar-gradient)" className="animate-[pulse_1.5s_ease-in-out_infinite_400ms]" />
                        <rect x="55" y="35" width="8" height="25" rx="2" fill="url(#bar-gradient)" className="animate-[pulse_1.5s_ease-in-out_infinite_600ms]" />
                        <rect x="70" y="10" width="8" height="50" rx="2" fill="url(#bar-gradient)" className="animate-[pulse_1.5s_ease-in-out_infinite_800ms]" />
                        <rect x="85" y="25" width="8" height="35" rx="2" fill="url(#bar-gradient)" className="animate-[pulse_1.5s_ease-in-out_infinite_1000ms]" />
                    </g>

                    {/* Trend Line - Drawing Animation */}
                    <path
                        d="M 14 30 L 29 40 L 44 20 L 59 35 L 74 10 L 89 25"
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="stock-line"
                    />
                </svg>
            </div>

            {/* Loading Text - Side Aligned */}
            <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-gray-500 font-mono tracking-tight whitespace-nowrap">
                    {status.toUpperCase()}
                </span>
                <span className="flex space-x-1">
                    <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce"></span>
                </span>
            </div>

            <style jsx>{`
                .stock-line {
                    stroke-dasharray: 100;
                    stroke-dashoffset: 100;
                    animation: drawLine 2s ease-in-out infinite;
                    filter: drop-shadow(0px 4px 6px rgba(34, 197, 94, 0.2));
                }
                
                @keyframes drawLine {
                    0% {
                        stroke-dashoffset: 100;
                        opacity: 0.5;
                    }
                    40% {
                        stroke-dashoffset: 0;
                        opacity: 1;
                    }
                    80% {
                        stroke-dashoffset: 0;
                        opacity: 1;
                    }
                    100% {
                        stroke-dashoffset: -100;
                        opacity: 0;
                    }
                }
            `}</style>
        </div>
    );
}
