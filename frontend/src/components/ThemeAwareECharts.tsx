'use client';

import React, { useEffect, useState } from 'react';
import ReactECharts, { ReactEChartsProps } from 'echarts-for-react';
import { useTheme } from 'next-themes';
import { initEchartsThemes } from '@/lib/echarts-themes';

// Initialize themes globally once
let themesInitialized = false;

export const ThemeAwareECharts = (props: ReactEChartsProps) => {
    const { theme: nextTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        if (!themesInitialized) {
            initEchartsThemes();
            themesInitialized = true;
        }
        setMounted(true);
    }, []);

    if (!mounted) {
        // Return placeholder matching height to prevent layout shift during hydration
        return <div style={{ height: props.style?.height || 300, width: props.style?.width || '100%' }} />;
    }

    const isDark = nextTheme === 'dark' || resolvedTheme === 'dark';
    const chartTheme = isDark ? 'stockastic-dark' : 'stockastic-light';

    return <ReactECharts {...props} theme={props.theme || chartTheme} />;
};
