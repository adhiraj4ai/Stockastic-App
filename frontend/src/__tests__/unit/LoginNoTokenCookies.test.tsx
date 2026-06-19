import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const push = vi.fn();

vi.mock('@/lib/api', () => ({
    default: { post: vi.fn() },
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
}));

vi.mock('next-themes', () => ({
    useTheme: () => ({ resolvedTheme: 'light' }),
}));

vi.mock('js-cookie', () => ({
    default: { set: vi.fn(), get: vi.fn(), remove: vi.fn() },
}));

import api from '@/lib/api';
import Cookies from 'js-cookie';
import LoginPage from '@/app/login/page';

describe('Login does not write JWT cookies client-side', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('navigates to /portfolio on success without setting access/refresh cookies', async () => {
        // Backend now sets HttpOnly cookies itself and returns only session/user.
        vi.mocked(api.post).mockResolvedValue({
            data: { session_id: 1, user: { username: 'a', email: 'a@b.c' } },
        });

        const user = userEvent.setup();
        render(<LoginPage />);

        await user.type(screen.getByPlaceholderText('Enter your email...'), 'tester');
        await user.type(screen.getByPlaceholderText('••••••••'), 'secret');
        await user.click(screen.getByRole('button', { name: /sign in/i }));

        expect(api.post).toHaveBeenCalledWith('/api/account/login/', expect.any(Object));
        // The bug: writing access_token=undefined here shadows the valid HttpOnly cookie.
        expect(Cookies.set).not.toHaveBeenCalled();
        expect(push).toHaveBeenCalledWith('/portfolio');
    });
});
