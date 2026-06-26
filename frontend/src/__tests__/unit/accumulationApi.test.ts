import { describe, it, expect, vi, afterEach } from 'vitest';
import api, { accumulationApi } from '@/lib/api';

vi.mock('@/lib/api', async (orig) => {
    const mod = await (orig as () => Promise<typeof import('@/lib/api')>)();
    return { ...mod };
});

describe('accumulationApi', () => {
    afterEach(() => vi.restoreAllMocks());

    it('lists candidates with the account query param', () => {
        const spy = vi.spyOn(api, 'get').mockResolvedValue({ data: [] } as never);
        accumulationApi.listCandidates({ account: '3' });
        expect(spy).toHaveBeenCalledWith('/api/stocks/accumulation-candidates/?account=3');
    });
});
