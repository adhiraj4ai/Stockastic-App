import { cn } from '@/lib/utils';

// Bar configs: relative height (%) and animation delay
const BARS = [
  { h: '45%', delay: '0ms'   },
  { h: '80%', delay: '160ms' },
  { h: '55%', delay: '320ms' },
  { h: '100%', delay: '80ms' },
  { h: '65%', delay: '240ms' },
];

const SIZES = {
  sm: { w: 3,  H: 18 },
  md: { w: 4,  H: 28 },
  lg: { w: 5,  H: 40 },
};

interface StockLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
}

/** Core animated bar-chart loader */
export function StockLoader({ size = 'md', text, className }: StockLoaderProps) {
  const s = SIZES[size];
  return (
    <div className={cn('flex flex-col items-center gap-2.5', className)}>
      <div className="flex items-end" style={{ gap: s.w - 1, height: s.H }}>
        {BARS.map((bar, i) => (
          <div
            key={i}
            className="stock-bar rounded-sm bg-primary"
            style={{ width: s.w, height: bar.h, animationDelay: bar.delay }}
          />
        ))}
      </div>
      {text && (
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 tracking-wide">
          {text}
        </p>
      )}
    </div>
  );
}

/** Section-level loader — centered with padding, used inside cards/panels */
export function PageLoader({ text, className }: { text?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center p-20 gap-4', className)}>
      <StockLoader size="md" text={text} />
    </div>
  );
}

/** Full-screen loader — used in Suspense fallbacks */
export function FullPageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <StockLoader size="lg" />
    </div>
  );
}
