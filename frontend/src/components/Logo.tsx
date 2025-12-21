'use client';

interface LogoProps {
    className?: string;
    showText?: boolean;
    animate?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Logo({ className = "", showText = true, animate = true, size = 'md' }: LogoProps) {
    const sizeClasses = {
        sm: 'w-6 h-6',
        md: 'w-8 h-8',
        lg: 'w-12 h-12',
        xl: 'w-16 h-16'
    };
    const color = '#047857'; // Emerald 700

    return (
        <div className={`relative ${sizeClasses[size]} flex-none ${className}`}>
            <svg viewBox="0 0 400 400" className="w-full h-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="mainLogoGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style={{ stopColor: color, stopOpacity: 1 }} />
                        <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.2 }} />
                    </linearGradient>

                    <filter id="mainLogoGlow">
                        <feGaussianBlur stdDeviation="5" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Main chart */}
                <g transform="translate(65, 120) scale(1.15)">
                    {/* Chart fill */}
                    <path d="M 20 100 L 20 70 L 50 80 L 80 60 L 110 50 L 140 25 L 170 35 L 200 15 L 230 5 L 230 100 Z"
                        fill="url(#mainLogoGradient)"
                        opacity="0.4"
                    >
                        {animate && <animate attributeName="opacity" values="0.3; 0.6; 0.3" dur="4s" repeatCount="indefinite" />}
                    </path>

                    {/* Chart line */}
                    <path d="M 20 70 L 50 80 L 80 60 L 110 50 L 140 25 L 170 35 L 200 15 L 230 5"
                        fill="none"
                        stroke={color}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        filter="url(#mainLogoGlow)"
                    />

                    {/* Data points */}
                    {[
                        { cx: 20, cy: 70, b: "0.2s" },
                        { cx: 80, cy: 60, b: "0.6s" },
                        { cx: 140, cy: 25, b: "1.0s" },
                        { cx: 200, cy: 15, b: "1.4s" },
                        { cx: 230, cy: 5, b: "1.8s", main: true }
                    ].map((p, i) => (
                        <circle key={i} cx={p.cx} cy={p.cy} r={p.main ? 10 : 6} fill={color} filter="url(#mainLogoGlow)">
                            {animate && <animate attributeName="opacity" values="0.4; 1; 0.4" dur="3s" repeatCount="indefinite" begin={p.b} />}
                            {p.main && animate && <animate attributeName="r" values="10; 13; 10" dur="1.5s" repeatCount="indefinite" />}
                        </circle>
                    ))}
                </g>

                {/* Upward arrow */}
                <g transform="translate(320, 110)">
                    {animate && (
                        <animateTransform
                            attributeName="transform"
                            type="translate"
                            values="320,110; 320,95; 320,110"
                            dur="2.5s"
                            repeatCount="indefinite" />
                    )}
                    <path d="M 0 40 L 0 5 M 0 5 L -10 15 M 0 5 L 10 15"
                        stroke={color}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        fill="none"
                        filter="url(#mainLogoGlow)" />
                    <circle cx="0" cy="3" r="5" fill={color} filter="url(#mainLogoGlow)" />
                </g>
            </svg>
        </div>
    );
}
