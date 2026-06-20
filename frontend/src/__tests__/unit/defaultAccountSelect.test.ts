import { describe, it, expect } from 'vitest';
import { defaultAccountId } from '@/lib/defaultAccount';

describe('defaultAccountId', () => {
    it('returns the id (as string) of the default account', () => {
        expect(defaultAccountId([{ id: 1, is_default: false }, { id: 5, is_default: true }] as never)).toBe('5');
    });
    it('returns null when no account is default', () => {
        expect(defaultAccountId([{ id: 1, is_default: false }] as never)).toBeNull();
        expect(defaultAccountId([] as never)).toBeNull();
    });
});
