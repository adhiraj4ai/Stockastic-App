'use client';

interface StockLoaderProps {
    status?: string;
}

export function StockLoader({ status = "ANALYZING MARKET" }: StockLoaderProps) {
    return (
        <div className="flex flex-row items-center gap-3 py-4">
            {/* Animated SVG Chart - Compact Icon */}
            {/* Animated Custom Chart Logo - Thinking State */}
            <div className="relative w-14 h-14 flex-none scale-110 animate-pulse-subtle">
                <svg viewBox="0 0 400 400" className="w-full h-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" style={{ stopColor: '#047857', stopOpacity: 1 }} />
                            <stop offset="100%" style={{ stopColor: '#047857', stopOpacity: 0 }} />
                        </linearGradient>

                        <filter id="glow">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* Pulsing circles */}
                    <circle cx="200" cy="200" r="140" fill="none" stroke="#047857" strokeWidth="1.5" opacity="0.2">
                        <animate attributeName="r" from="120" to="160" dur="3s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.4" to="0" dur="3s" repeatCount="indefinite" />
                    </circle>

                    {/* Main chart - Scaled up for better visibility */}
                    <g transform="translate(65, 120) scale(1.15)">
                        {/* Chart fill (The 'Wave') - Increased visibility */}
                        <path d="M 20 100 L 20 70 L 50 80 L 80 60 L 110 50 L 140 25 L 170 35 L 200 15 L 230 5 L 230 100 Z"
                            fill="url(#chartGradient)">
                            <animate attributeName="opacity" values="0.3; 0.8; 0.5; 0.8; 0.3" dur="4s" repeatCount="indefinite" />
                        </path>

                        {/* Chart line (The 'Trend') - Thicker for prominence */}
                        <path d="M 20 70 L 50 80 L 80 60 L 110 50 L 140 25 L 170 35 L 200 15 L 230 5"
                            fill="none"
                            stroke="#047857"
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            filter="url(#glow)"
                            strokeDasharray="400"
                            strokeDashoffset="400">
                            <animate attributeName="stroke-dashoffset" values="400; 0; 0; -400" dur="4s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0; 1; 1; 0" dur="4s" repeatCount="indefinite" />
                        </path>

                        {/* Data points */}
                        <circle cx="20" cy="70" r="5" fill="#047857" filter="url(#glow)">
                            <animate attributeName="opacity" values="0; 1; 0" dur="4s" repeatCount="indefinite" begin="0.2s" />
                        </circle>
                        <circle cx="80" cy="60" r="5" fill="#047857" filter="url(#glow)">
                            <animate attributeName="opacity" values="0; 1; 0" dur="4s" repeatCount="indefinite" begin="0.6s" />
                        </circle>
                        <circle cx="140" cy="25" r="5" fill="#047857" filter="url(#glow)">
                            <animate attributeName="opacity" values="0; 1; 0" dur="4s" repeatCount="indefinite" begin="1.0s" />
                        </circle>
                        <circle cx="200" cy="15" r="5" fill="#047857" filter="url(#glow)">
                            <animate attributeName="opacity" values="0; 1; 0" dur="4s" repeatCount="indefinite" begin="1.4s" />
                        </circle>
                        <circle cx="230" cy="5" r="7" fill="#047857" filter="url(#glow)">
                            <animate attributeName="opacity" values="0; 1; 0" dur="4s" repeatCount="indefinite" begin="1.8s" />
                            <animate attributeName="r" values="7; 9; 7" dur="1s" repeatCount="indefinite" />
                        </circle>
                    </g>


                    {/* Text Identifier - Integrated into SVG for precise alignment */}
                    <text
                        x="200"
                        y="300"
                        textAnchor="middle"
                        fill="#4b5563"
                        style={{
                            fontSize: '42px',
                            fontWeight: 'bold',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                            letterSpacing: '-0.02em',
                        }}
                    >
                        Stockastic
                    </text>


                    {/* Upward arrow */}
                    <g transform="translate(320, 110)">
                        <animateTransform
                            attributeName="transform"
                            type="translate"
                            values="320,110; 320,100; 320,110"
                            dur="2s"
                            repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.3; 1; 0.3" dur="2s" repeatCount="indefinite" />

                        <path d="M 0 35 L 0 5 M 0 5 L -8 13 M 0 5 L 8 13"
                            stroke="#047857"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                            filter="url(#glow)" />
                        <circle cx="0" cy="3" r="4" fill="#047857" filter="url(#glow)" />
                    </g>

                    {/* Grid lines (subtle background) */}
                    <g opacity="0.1" stroke="#047857" strokeWidth="1">
                        <animate attributeName="opacity" values="0.1; 0.2; 0.1" dur="2s" repeatCount="indefinite" />
                        <line x1="100" y1="210" x2="310" y2="210" />
                        <line x1="100" y1="240" x2="310" y2="240" />
                    </g>

                    {/* Center accent circle */}
                    <circle cx="200" cy="200" r="4" fill="#047857" opacity="0.6">
                        <animate attributeName="opacity" values="0.6; 1; 0.6" dur="1.5s" repeatCount="indefinite" />
                    </circle>

                    {/* Corner accents */}
                    <circle cx="50" cy="50" r="3" fill="#047857" opacity="0.3">
                        <animate attributeName="opacity" values="0.3; 0.7; 0.3" dur="3s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="350" cy="50" r="3" fill="#047857" opacity="0.3">
                        <animate attributeName="opacity" values="0.3; 0.7; 0.3" dur="3s" begin="1s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="50" cy="350" r="3" fill="#047857" opacity="0.3">
                        <animate attributeName="opacity" values="0.3; 0.7; 0.3" dur="3s" begin="2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="350" cy="350" r="3" fill="#047857" opacity="0.3">
                        <animate attributeName="opacity" values="0.3; 0.7; 0.3" dur="3s" begin="1.5s" repeatCount="indefinite" />
                    </circle>
                </svg>
            </div>

            {/* Loading Text - Side Aligned */}
            <div className="flex items-center space-x-2">
                <span className="text-base font-medium text-gray-600 font-mono tracking-tight whitespace-nowrap">
                    {status}
                </span>
            </div>
        </div>
    );
}
