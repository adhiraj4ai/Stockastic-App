import React from 'react';
import dynamic from 'next/dynamic';

// Dynamic imports for Gen-UI components to keep the initial bundle small
const StockCard = dynamic(() => import('./StockCard'), {
    loading: () => <div className="h-32 w-full animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />,
});

const WhaleWatchCard = dynamic(() => import('./WhaleWatchCard'), {
    loading: () => <div className="h-48 w-full animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />,
});

const FibonacciCard = dynamic(() => import('./FibonacciCard'), {
    loading: () => <div className="h-40 w-full animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />,
});

const MarketSummary = dynamic(() => import('./MarketSummary'), {
    loading: () => <div className="h-64 w-full animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />,
});

export const GEN_UI_COMPONENTS: Record<string, React.ComponentType<any>> = {
    'StockCard': StockCard,
    'WhaleWatchCard': WhaleWatchCard,
    'FibonacciCard': FibonacciCard,
    'MarketSummary': MarketSummary,
};

interface GenUIContainerProps {
    component: string;
    data: any;
}

export const GenUIContainer: React.FC<GenUIContainerProps> = ({ component, data }) => {
    const Component = GEN_UI_COMPONENTS[component];

    if (!Component) {
        return (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                Unknown Gen-UI component: <strong>{component}</strong>
            </div>
        );
    }

    return (
        <div className="my-4">
            <Component {...data} />
        </div>
    );
};
