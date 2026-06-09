'use client';
import { TradePlan } from '@/app/(authenticated)/portfolio/plans/page';
interface Props { plan: TradePlan; onClose: () => void; onUpdated: (plan: TradePlan) => void; }
export function TradePlanDrawer({ onClose }: Props) {
  return null;
}
