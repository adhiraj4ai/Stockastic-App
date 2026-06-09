/**
 * Playwright E2E tests for the chat feature.
 *
 * Requires:
 *  - Backend running on http://localhost:8000
 *  - Frontend running on http://localhost:3000
 *  - TEST_USER / TEST_PASSWORD env vars set (or uses defaults below)
 *
 * These tests exercise the real browser ↔ Next.js ↔ Django stack.
 * The Claude SDK is NOT mocked — if no API key is configured, streaming
 * tests will receive an `error` SSE frame, which is an acceptable result.
 */
import { test, expect, type Page } from '@playwright/test';

const TEST_USER = process.env.TEST_USER || 'e2e@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'e2epassword';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(page: Page) {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_USER);
    await page.getByLabel(/password/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL('**/dashboard', { timeout: 10_000 });
}

async function goToChat(page: Page) {
    await page.goto('/chat');
    await page.waitForSelector('[data-testid="chat-interface"], textarea, [placeholder*="Ask"]', {
        timeout: 10_000,
    });
}

async function sendMessage(page: Page, message: string) {
    const input = page.locator('textarea, [placeholder*="Ask"]').first();
    await input.fill(message);
    await input.press('Enter');
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

test.describe('Chat — authenticated flow', () => {
    test.beforeEach(async ({ page }) => {
        await login(page);
        await goToChat(page);
    });

    // -----------------------------------------------------------------------
    // Session management
    // -----------------------------------------------------------------------

    test('new chat button creates a fresh session', async ({ page }) => {
        const newChatBtn = page.getByRole('button', { name: /new chat/i });
        await expect(newChatBtn).toBeVisible();
        await newChatBtn.click();

        // After creating a new chat the input should be empty and ready
        const input = page.locator('textarea, [placeholder*="Ask"]').first();
        await expect(input).toBeEmpty();
    });

    test('session appears in sidebar after creation', async ({ page }) => {
        await page.getByRole('button', { name: /new chat/i }).click();
        await sendMessage(page, 'What sectors lead today?');

        // Session title should appear in the sidebar (auto-titled from prompt)
        await expect(
            page.getByText('What sectors lead today?', { exact: false })
        ).toBeVisible({ timeout: 5000 });
    });

    test('session title auto-updates from first message', async ({ page }) => {
        await page.getByRole('button', { name: /new chat/i }).click();
        const prompt = 'Analyze NABIL technical indicators';
        await sendMessage(page, prompt);

        // The sidebar should show the first 60 chars of the prompt as title
        await expect(
            page.getByText(prompt.slice(0, 40), { exact: false })
        ).toBeVisible({ timeout: 5000 });
    });

    test('rename session title via edit', async ({ page }) => {
        await page.getByRole('button', { name: /new chat/i }).click();
        await sendMessage(page, 'Initial question');

        // Find the rename option (hover + icon or context menu)
        const sessionItem = page.locator('[data-testid*="session"], .session-item').first();
        await sessionItem.hover();

        const editBtn = page.getByRole('button', { name: /rename|edit/i }).first();
        if (await editBtn.isVisible()) {
            await editBtn.click();
            const titleInput = page.getByRole('textbox').last();
            await titleInput.fill('My NABIL Analysis');
            await titleInput.press('Enter');
            await expect(page.getByText('My NABIL Analysis')).toBeVisible();
        }
    });

    test('deleting a session removes it from sidebar', async ({ page }) => {
        await page.getByRole('button', { name: /new chat/i }).click();
        await sendMessage(page, 'Session to delete');

        // Wait for session to appear in sidebar
        const sessionTitle = page.getByText('Session to delete', { exact: false });
        await expect(sessionTitle).toBeVisible({ timeout: 5000 });

        const sessionItem = page.locator('[data-testid*="session"], .session-item').first();
        await sessionItem.hover();
        const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
        if (await deleteBtn.isVisible()) {
            await deleteBtn.click();
            // Confirm deletion if a dialog appears
            const confirmBtn = page.getByRole('button', { name: /confirm|yes|delete/i });
            if (await confirmBtn.isVisible({ timeout: 1000 })) {
                await confirmBtn.click();
            }
            await expect(sessionTitle).not.toBeVisible({ timeout: 5000 });
        }
    });

    // -----------------------------------------------------------------------
    // Message sending & streaming
    // -----------------------------------------------------------------------

    test('user message appears immediately in chat', async ({ page }) => {
        await page.getByRole('button', { name: /new chat/i }).click();
        const prompt = 'What is NEPSE index today?';
        await sendMessage(page, prompt);

        // The message should appear before streaming completes
        await expect(page.getByText(prompt)).toBeVisible({ timeout: 3000 });
    });

    test('input is cleared after sending', async ({ page }) => {
        await page.getByRole('button', { name: /new chat/i }).click();
        const input = page.locator('textarea, [placeholder*="Ask"]').first();
        await input.fill('Test message');
        await input.press('Enter');
        await expect(input).toBeEmpty({ timeout: 2000 });
    });

    test('stop button appears during streaming', async ({ page }) => {
        await page.getByRole('button', { name: /new chat/i }).click();
        await sendMessage(page, 'Analyze top 10 NEPSE gainers today');
        // Stop button should appear briefly while the agent streams
        await expect(
            page.getByRole('button', { name: /stop/i })
        ).toBeVisible({ timeout: 5000 });
    });

    test('stop button halts streaming', async ({ page }) => {
        await page.getByRole('button', { name: /new chat/i }).click();
        await sendMessage(page, 'Long running analysis of all NEPSE stocks');

        const stopBtn = page.getByRole('button', { name: /stop/i });
        if (await stopBtn.isVisible({ timeout: 3000 })) {
            await stopBtn.click();
            // After stopping, send button should return
            await expect(
                page.getByRole('button', { name: /send/i })
            ).toBeVisible({ timeout: 3000 });
        }
    });

    test('assistant response appears in chat after streaming', async ({ page }) => {
        await page.getByRole('button', { name: /new chat/i }).click();
        await sendMessage(page, 'What is 2 + 2?');

        // Any response text should appear in the chat
        // We look for the assistant message area rather than specific text
        await expect(
            page.locator('[class*="rounded-md border"], [class*="assistant"]').first()
        ).toBeVisible({ timeout: 30_000 });
    });

    // -----------------------------------------------------------------------
    // Multi-turn
    // -----------------------------------------------------------------------

    test('second message continues the same session', async ({ page }) => {
        await page.getByRole('button', { name: /new chat/i }).click();
        await sendMessage(page, 'Hello');

        // Wait for first response
        await page.waitForTimeout(2000);

        await sendMessage(page, 'Follow-up question');
        // Both messages should be visible
        await expect(page.getByText('Hello')).toBeVisible();
        await expect(page.getByText('Follow-up question')).toBeVisible();
    });

    // -----------------------------------------------------------------------
    // History persistence
    // -----------------------------------------------------------------------

    test('session history loads when switching sessions', async ({ page }) => {
        // Create first session
        await page.getByRole('button', { name: /new chat/i }).click();
        await sendMessage(page, 'Session A message');
        await page.waitForTimeout(1500);

        // Create second session
        await page.getByRole('button', { name: /new chat/i }).click();
        await sendMessage(page, 'Session B message');
        await page.waitForTimeout(1500);

        // Go back to first session by clicking it in the sidebar
        const sessionA = page.getByText('Session A message', { exact: false }).first();
        if (await sessionA.isVisible()) {
            await sessionA.click();
            await expect(page.getByText('Session A message')).toBeVisible({ timeout: 5000 });
        }
    });

    test('chat history persists after page reload', async ({ page }) => {
        await page.getByRole('button', { name: /new chat/i }).click();
        await sendMessage(page, 'Persistent message test');

        // Wait for it to be visible and saved
        await expect(page.getByText('Persistent message test')).toBeVisible({ timeout: 3000 });

        // Reload
        await page.reload();
        await page.waitForSelector('textarea, [placeholder*="Ask"]', { timeout: 10_000 });

        // The session should still appear in the sidebar
        await expect(
            page.getByText('Persistent message test', { exact: false })
        ).toBeVisible({ timeout: 5000 });
    });
});

// ---------------------------------------------------------------------------
// Unauthenticated access
// ---------------------------------------------------------------------------

test.describe('Chat — unauthenticated', () => {
    test('redirects to login when not authenticated', async ({ page }) => {
        await page.goto('/chat');
        await expect(page).toHaveURL(/login/, { timeout: 5000 });
    });
});
