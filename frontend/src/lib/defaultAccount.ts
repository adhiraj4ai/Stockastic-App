import type { PortfolioAccount } from '@/components/TransactionModal';

export function defaultAccountId(accounts: PortfolioAccount[]): string | null {
    const found = accounts.find(a => a.is_default);
    return found ? found.id.toString() : null;
}
