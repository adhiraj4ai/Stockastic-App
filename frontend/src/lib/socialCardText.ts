import type { ActionItem } from '@/lib/homeDigest';

export type SocialTemplateId =
    | 'summary' | 'gainers' | 'losers' | 'turnover' | 'sectors'
    | 'signals' | 'smart-money' | 'fifty-two-week' | 'weekly';

export interface SocialCardData {
    summary?: any;
    weekly?: any;
    signals?: ActionItem[];
    accumulation?: { top: any[]; aggressive: any[] };
}

const HASHTAGS = '#NEPSE #Nepal #Stockastic';

const pct = (n: number) => `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;

export function formatCardText(id: SocialTemplateId, data: SocialCardData): string {
    switch (id) {
        case 'summary': {
            const ms = data.summary?.market_summary;
            if (!ms) return '';
            return `🇳🇵 #NEPSE Daily Update\n\n📌 Index: ${Number(ms.total_points).toFixed(2)} (${ms.points_change >= 0 ? '+' : ''}${Number(ms.points_change).toFixed(2)}, ${Number(ms.percent_change).toFixed(2)}%)\n💰 Turnover: Rs. ${(ms.total_turnover / 10000000).toFixed(2)} Cr\n📈 Advancers: ${ms.advancers} · 📉 Decliners: ${ms.decliners}\n\n${HASHTAGS}`;
        }
        case 'gainers': {
            const list = data.summary?.top_gainers;
            if (!list?.length) return '';
            return `🔥 Top Gainers Today\n\n${list.slice(0, 5).map((s: any, i: number) => `${i + 1}. ${s.ticker}: ${pct(s.percent_change)}`).join('\n')}\n\n${HASHTAGS}`;
        }
        case 'losers': {
            const list = data.summary?.top_losers;
            if (!list?.length) return '';
            return `📉 Top Losers Today\n\n${list.slice(0, 5).map((s: any, i: number) => `${i + 1}. ${s.ticker}: ${pct(s.percent_change)}`).join('\n')}\n\n${HASHTAGS}`;
        }
        case 'turnover': {
            const list = data.summary?.top_turnover;
            if (!list?.length) return '';
            return `💰 Most Traded Today\n\n${list.slice(0, 5).map((s: any, i: number) => `${i + 1}. ${s.ticker}: Rs. ${(s.turnover / 1000000).toFixed(1)}M`).join('\n')}\n\n${HASHTAGS}`;
        }
        case 'sectors': {
            const list = data.summary?.sector_summary;
            if (!list?.length) return '';
            return `🏗️ Sector Performance\n\n${list.slice(0, 6).map((s: any) => `${s.name}: ${pct(s.change)}`).join('\n')}\n\n${HASHTAGS}`;
        }
        case 'signals': {
            const items = data.signals;
            if (!items?.length) return '';
            return `⚡ Today's Top Signals\n\n${items.slice(0, 5).map(i => `${i.action === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${i.symbol} · ${i.source} (${Math.round(i.conviction)}/100)`).join('\n')}\n\nNot financial advice.\n${HASHTAGS}`;
        }
        case 'smart-money': {
            const top = data.accumulation?.top;
            if (!top?.length) return '';
            return `🐋 Smart Money Watch · 1W\n\n${top.slice(0, 5).map((r: any) => `📥 ${r.symbol}: +${Number(r.net_qty).toLocaleString()} net shares`).join('\n')}\n\n${HASHTAGS}`;
        }
        case 'fifty-two-week': {
            const highs = data.summary?.near_52_high;
            const lows = data.summary?.near_52_low;
            if (!highs?.length && !lows?.length) return '';
            const hi = (highs ?? []).slice(0, 4).map((s: any) => s.ticker).join(', ');
            const lo = (lows ?? []).slice(0, 4).map((s: any) => s.ticker).join(', ');
            return `🎯 52-Week Watch\n\n🚀 Near 52W High: ${hi || '—'}\n🧊 Near 52W Low: ${lo || '—'}\n\n${HASHTAGS}`;
        }
        case 'weekly': {
            const ms = data.weekly?.market_summary;
            if (!ms) return '';
            const leaders = (data.weekly?.top_gainers ?? []).slice(0, 3)
                .map((s: any) => `${s.ticker} ${pct(s.percent_change)}`).join(' · ');
            return `🗓️ #NEPSE Weekly Recap\n\n📌 Index: ${Number(ms.total_points).toFixed(2)} (${pct(ms.percent_change)})\n💰 Turnover: Rs. ${(ms.total_turnover / 10000000).toFixed(2)} Cr\n🔥 Week's leaders: ${leaders || '—'}\n\n${HASHTAGS}`;
        }
    }
    return '';
}
