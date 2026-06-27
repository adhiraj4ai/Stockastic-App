import { describe, it, expect, vi, afterEach } from 'vitest';
import api, { signalsApi } from '@/lib/api';

describe('signalsApi', () => {
    afterEach(() => vi.restoreAllMocks());
    it('requests the board with filters', () => {
        const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: {} } as never);
        signalsApi.board({ direction: 'BUY', min_families: '2' });
        expect(spy).toHaveBeenCalledWith('/api/stocks/signals/board/?direction=BUY&min_families=2');
    });
    it('requests the glossary', () => {
        const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: {} } as never);
        signalsApi.glossary();
        expect(spy).toHaveBeenCalledWith('/api/stocks/signal-glossary/');
    });
});
