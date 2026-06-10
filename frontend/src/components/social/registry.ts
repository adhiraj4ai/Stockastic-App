import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    Share2, TrendingUp, TrendingDown, Zap, BarChart3,
    Brain, Target, CalendarRange, Activity,
} from 'lucide-react';
import type { SocialTemplateId } from '@/lib/socialCardText';
import type { TemplateProps } from './templates/shared';
import { DailyWrap } from './templates/DailyWrap';
import { Gainers, Losers, Turnover } from './templates/TopList';
import { Sectors } from './templates/Sectors';
import { Signals } from './templates/Signals';
import { SmartMoney } from './templates/SmartMoney';
import { FiftyTwoWeek } from './templates/FiftyTwoWeek';
import { WeeklyRecap } from './templates/WeeklyRecap';

export type DataNeed = 'summary' | 'weekly' | 'signals' | 'accumulation';

export interface SocialTemplate {
    id: SocialTemplateId;
    name: string;
    desc: string;
    icon: LucideIcon;
    needs: DataNeed;
    Component: ComponentType<TemplateProps>;
}

export const TEMPLATES: SocialTemplate[] = [
    { id: 'summary', name: 'Daily Market Wrap', desc: 'Index, turnover, and market breadth.', icon: Share2, needs: 'summary', Component: DailyWrap },
    { id: 'signals', name: "Today's Signals", desc: 'Top engine calls ranked by conviction.', icon: Zap, needs: 'signals', Component: Signals },
    { id: 'smart-money', name: 'Smart Money', desc: 'Institutional accumulation highlights.', icon: Brain, needs: 'accumulation', Component: SmartMoney },
    { id: 'gainers', name: 'Top Gainers', desc: 'Best performing stocks today.', icon: TrendingUp, needs: 'summary', Component: Gainers },
    { id: 'losers', name: 'Top Losers', desc: 'Biggest price corrections today.', icon: TrendingDown, needs: 'summary', Component: Losers },
    { id: 'turnover', name: 'Most Traded', desc: 'Highest trading activity today.', icon: Activity, needs: 'summary', Component: Turnover },
    { id: 'fifty-two-week', name: '52-Week Watch', desc: 'Stocks near yearly highs and lows.', icon: Target, needs: 'summary', Component: FiftyTwoWeek },
    { id: 'sectors', name: 'Sector Heatmap', desc: 'How each sector performed today.', icon: BarChart3, needs: 'summary', Component: Sectors },
    { id: 'weekly', name: 'Weekly Recap', desc: "The week's index move and leaders.", icon: CalendarRange, needs: 'weekly', Component: WeeklyRecap },
];
