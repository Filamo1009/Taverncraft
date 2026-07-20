// #27 — A provider failure after a native world-state tool call must clear
// staged operations, emit GENERATION_STOPPED, and permit a real UI regenerate
// without duplicating the user floor or mutating authoritative state.

import { test, expect } from '@playwright/test';

import { startServer, tearDownServer } from '../_lib/server.js';
import { startMockLLM } from '../_lib/mockLLM.js';
import { appendConnectionProfile, bootstrapCustomBackend, markOnboarded } from '../_lib/fixtures.js';
import {
    awaitMainUI,
    getChatSnapshot,
    regenerateViaUI,
    selectCharacterByName,
    sendMessageAndAwaitReply,
} from '../_lib/page.js';

let server;
let mock;

test.beforeAll(async () => {
    mock = await startMockLLM({
        scriptedReplies: ['*Seraphina steadies the lantern.* "The failed signal changed nothing; we can continue safely."'],
    });
    server = await startServer({ batchKey: 'chat', scenarioId: 'provider-error-world-operation-cleanup' });
    markOnboarded({ dataRoot: server.dataRoot });
    bootstrapCustomBackend({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
    appendConnectionProfile({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
});

test.afterAll(async () => {
    await tearDownServer(server);
    await mock?.stop();
});

test.describe('#27 — provider error cleanup after native tool call', () => {
    test('clears the staged operation and regenerates the same user floor safely', async ({ page }) => {
        await awaitMainUI(page, server.baseURL);
        await selectCharacterByName(page, 'Seraphina');
        await page.waitForFunction(() => Boolean(window.Taverncraft?.worldEngine), undefined, { timeout: 15_000 });

        const before = await page.evaluate(async () => await window.Taverncraft.worldEngine.getState());
        await page.evaluate(expectedStateHash => {
            const ctx = window.Taverncraft.getContext();
            window.__providerErrorStageResult = null;
            const onStarted = async (type, params) => {
                if (Number(params?.depth || 0) !== 0) return;
                try { ctx.eventSource.removeListener(ctx.eventTypes.GENERATION_STARTED, onStarted); } catch { /* detached */ }
                window.__providerErrorStageResult = await window.Taverncraft.worldEngine.stageWorldOperations([{
                    version: 1,
                    operationId: 'provider-error-probe',
                    idempotencyKey: 'provider-error-probe-once',
                    expectedStateHash,
                    type: 'set_flag',
                    args: { key: 'mustNotCommit', value: true },
                    reason: 'Exercise provider failure cleanup.',
                }]);
            };
            ctx.eventSource.on(ctx.eventTypes.GENERATION_STARTED, onStarted);
        }, before.stateHash);

        let generationRequests = 0;
        await page.route('**/api/backends/chat-completions/generate', async route => {
            generationRequests += 1;
            if (generationRequests === 1) {
                await route.fulfill({
                    status: 502,
                    contentType: 'application/json',
                    body: JSON.stringify({ error: { message: 'deliberate transient provider failure' } }),
                });
                return;
            }
            await route.fallback();
        });

        const userText = '请使用世界状态工具记录本次容错探针，然后继续回答。';
        await expect(sendMessageAndAwaitReply(page, userText, { timeoutMs: 30_000 }))
            .rejects.toThrow(/generation stopped before a completed reply/iu);

        await page.waitForFunction(() => {
            const pending = window.Taverncraft.worldEngine.getPendingSummary();
            const stop = document.querySelector('#mes_stop');
            return Number(pending.worldOperations || 0) === 0
                && Number(pending.operations || 0) === 0
                && (!stop || getComputedStyle(stop).display === 'none');
        }, undefined, { timeout: 15_000 });
        const afterFailure = await page.evaluate(async () => {
            const state = await window.Taverncraft.worldEngine.getState();
            const lifecycle = window.Taverncraft.worldEngine.getPendingLifecycle();
            return {
                stateHash: state.stateHash,
                stageResult: window.__providerErrorStageResult,
                pending: window.Taverncraft.worldEngine.getPendingSummary(),
                stoppedCleanup: lifecycle.some(entry => entry?.event === 'clear' && entry?.reason === 'generation-stopped'),
            };
        });
        expect(afterFailure.stateHash).toBe(before.stateHash);
        expect(afterFailure.stageResult).toMatchObject({ ok: true, staged: 1 });
        expect(afterFailure.pending).toEqual({ worldOperations: 0, operations: 0 });
        expect(afterFailure.stoppedCleanup).toBe(true);

        await page.unroute('**/api/backends/chat-completions/generate');
        const recovered = await regenerateViaUI(page, { timeoutMs: 30_000 });
        expect(recovered.text).toContain('failed signal changed nothing');
        const afterRecovery = await page.evaluate(async () => await window.Taverncraft.worldEngine.getState());
        expect(afterRecovery.stateHash).toBe(before.stateHash);

        const chat = await getChatSnapshot(page);
        expect(chat.messages.filter(message => message?.is_user && message?.mes === userText)).toHaveLength(1);
    });
});
