import Link from 'next/link';

interface StockLinkProps {
    ticker: string;
    children?: React.ReactNode;
    className?: string;
}

export default function StockLink({ ticker, children, className }: StockLinkProps) {
    return (
        <Link
            href={`/ticker/${ticker}`}
            className={`hover:text-primary hover:underline cursor-pointer ${className || ''}`}
            onClick={(e) => e.stopPropagation()} // Prevent row click events if nested
        >
            {children || ticker}
        </Link>
    );
}
