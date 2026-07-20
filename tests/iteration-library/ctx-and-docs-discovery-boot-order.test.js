/**
 * Boot-order regression test for `ctx-and-docs-discovery.js`.
 *
 * The orchestrator extension loads via SillyTavern's extension activator
 * during boot, which means everything it transitively imports — including
 * `ctx-and-docs-discovery.js` — has to evaluate cleanly under a global
 * `Taverncraft` that may not yet be defined.
 *
 * Original bug (caught by Playwright dry-run): the module called
 * `Taverncraft.getContext()` at module top, throwing `ReferenceError: Taverncraft is
 * not defined` and bricking the entire app (symptom: stuck #preloader +
 * "Failed to initialize Taverncraft application" in console).
 *
 * Fix: defer every `Taverncraft.getContext()` lookup inside the exported async
 * helpers. This test re-loads the module with `globalThis.Taverncraft` deleted
 * so a future module-top `Taverncraft.*` call would resurface the bug.
 */

import { describe, test, expect, jest } from '@jest/globals';

describe('ctx-and-docs-discovery boot order', () => {
    test('module evaluates cleanly when global Taverncraft is missing at import time', async () => {
        const prior = globalThis.Taverncraft;
        // eslint-disable-next-line no-undef
        delete globalThis.Taverncraft;
        // Use jest.isolateModulesAsync to get a fresh module registry so
        // the import re-evaluates module-top code under the missing-Taverncraft
        // condition. Falls back to a direct dynamic import with a cache-
        // busting query when isolateModulesAsync is unavailable.
        let mod;
        try {
            await jest.isolateModulesAsync(async () => {
                mod = await import('../../public/scripts/iteration-library/tools/ctx-and-docs-discovery.js');
            });
        } catch (e) {
            // Restore before failing so other tests aren't affected.
            if (prior !== undefined) globalThis.Taverncraft = prior;
            throw new Error(`Module evaluation threw without Taverncraft present — this would brick app boot. Original error: ${e?.message || e}`);
        }
        // Restore for any subsequent tests.
        if (prior !== undefined) globalThis.Taverncraft = prior;
        expect(typeof mod.listCtxKeys).toBe('function');
        expect(typeof mod.describeCtxPath).toBe('function');
        expect(typeof mod.listLukerDocs).toBe('function');
        expect(typeof mod.readLukerDoc).toBe('function');
    });

    test('executors that need Taverncraft only call it when invoked (not at import)', async () => {
        // Re-import under a deleted-Taverncraft context and confirm that simply
        // having the module loaded does NOT trigger Taverncraft.getContext().
        // The actual call happens only inside the exported async helpers.
        const prior = globalThis.Taverncraft;
        // eslint-disable-next-line no-undef
        delete globalThis.Taverncraft;
        let mod;
        await jest.isolateModulesAsync(async () => {
            mod = await import('../../public/scripts/iteration-library/tools/ctx-and-docs-discovery.js');
        });
        // Now provide Taverncraft before calling the helper.
        globalThis.Taverncraft = {
            getContext: () => ({
                chat: [],
                getRequestHeaders: () => ({}),
            }),
        };
        const out = await mod.listCtxKeys({});
        expect(out.ok).toBe(true);
        // Cleanup.
        if (prior !== undefined) globalThis.Taverncraft = prior;
        else delete globalThis.Taverncraft;
    });
});
