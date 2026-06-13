import * as echarts from 'echarts/core';

// Vibrant Stockastic Modern Palette
const colorPalette = [
    '#14b8a6', // primary (teal)
    '#f59e0b', // secondary (amber)
    '#3b82f6', // info (blue)
    '#ec4899', // accent (pink)
    '#8b5cf6', // purple
    '#10b981', // emerald
    '#f43f5e', // rose
    '#06b6d4', // cyan
];

export const initEchartsThemes = () => {
    // Shared Axis Style
    const axisStyle = {
        axisLine: { lineStyle: { color: 'rgba(128, 128, 128, 0.2)' } },
        axisLabel: { color: 'rgba(128, 128, 128, 0.6)', fontSize: 10, fontWeight: 'bold' },
        splitLine: { lineStyle: { color: 'rgba(128, 128, 128, 0.1)', type: 'dashed' } }
    };

    // Shared Tooltip Style
    const tooltipStyle = {
        backgroundColor: 'rgba(20, 20, 20, 0.8)',
        backdropFilter: 'blur(12px)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        textStyle: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
        extraCssText: 'box-shadow: 0 10px 30px rgba(0,0,0,0.5); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1);'
    };

    // Light Theme (Vintage)
    echarts.registerTheme('stockastic-light', {
        color: colorPalette,
        backgroundColor: 'transparent',
        textStyle: { color: '#1e293b', fontFamily: 'Inter, system-ui, sans-serif' },
        title: {
            left: 'center',
            textStyle: { 
                color: '#111827',
                fontSize: 16,
                fontWeight: '900',
                fontStyle: 'italic',
                textTransform: 'uppercase'
            }
        },
        line: { 
            symbol: 'circle',
            symbolSize: 6,
            smooth: true,
            lineStyle: { width: 3 }
        },
        tooltip: {
            ...tooltipStyle,
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            textStyle: { color: '#111', fontSize: 12, fontWeight: 'bold' },
            extraCssText: 'box-shadow: 0 10px 30px rgba(0,0,0,0.1); backdrop-filter: blur(12px); border: 1px solid rgba(0,0,0,0.05);'
        },
        legend: {
            textStyle: { fontSize: 10, fontWeight: 'bold', color: '#64748b' }
        },
        categoryAxis: { ...axisStyle, splitLine: { show: false } },
        valueAxis: axisStyle,
        grid: { containLabel: true, top: 60, bottom: 40, left: 20, right: 20 }
    });

    // Dark Theme (Vintage Dark)
    echarts.registerTheme('stockastic-dark', {
        darkMode: true,
        color: colorPalette,
        backgroundColor: 'transparent',
        textStyle: { color: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' },
        title: {
            left: 'center',
            textStyle: { 
                color: '#fff',
                fontSize: 16,
                fontWeight: '900',
                fontStyle: 'italic',
                textTransform: 'uppercase'
            }
        },
        line: { 
            symbol: 'circle',
            symbolSize: 6,
            smooth: true,
            lineStyle: { width: 3 }
        },
        tooltip: tooltipStyle,
        legend: {
            textStyle: { fontSize: 10, fontWeight: 'bold', color: '#94a3b8' }
        },
        categoryAxis: { ...axisStyle, splitLine: { show: false } },
        valueAxis: axisStyle,
        grid: { containLabel: true, top: 60, bottom: 40, left: 20, right: 20 }
    });
};
