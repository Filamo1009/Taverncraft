// #29 — a real ST V3 PNG may already contain extensions.world even though
// its embedded character_book has not been materialized in this install.
// Accepting the legacy import popup must save all entries before runtime
// World Info scanning begins, and the binding must survive a restart.

import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startServer, tearDownServer } from '../_lib/server.js';
import { startMockLLM } from '../_lib/mockLLM.js';
import { appendConnectionProfile, bootstrapCustomBackend, markOnboarded } from '../_lib/fixtures.js';
import { clickCharacterCard, disableTagImportPopup, dismissAnyPopup, openCharacterEditPanel } from './_helpers.js';
import { awaitMainUI, reloadAndAwait, selectCharacterByName } from '../_lib/page.js';
import { importCharacterFile } from '../_lib/ui-character.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const FIXTURE_PATH = resolve(REPO_ROOT, '..', 'v4.0.png');
const CHARACTER_NAME = '苍玄界';
const WORLD_BOOK_NAME = '我的苍玄界，才不会这么跌宕起伏！';
const PROBE_COMMENTS = ['沈慕微', '剑临城', '谢忘生', '药芷若', '姜昭昭', '东海海域'];

function resetFixtureArtifacts(dataRoot) {
    for (const path of [
        resolve(dataRoot, 'default-user', 'characters', `${CHARACTER_NAME}.png`),
        resolve(dataRoot, 'default-user', 'worlds', `${WORLD_BOOK_NAME}.json`),
    ]) {
        if (existsSync(path)) rmSync(path, { force: true });
    }
}

function enableEmbeddedWorldPrompt(dataRoot) {
    const settingsPath = resolve(dataRoot, 'default-user', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    settings.power_user = settings.power_user || {};
    settings.power_user.world_import_dialog = true;
    settings.accountStorage = settings.accountStorage || {};
    delete settings.accountStorage[`AlertWI_${CHARACTER_NAME}.png`];
    writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
}

async function readWorldBookEvidence(page) {
    return page.evaluate(async ({ worldBookName, probeComments }) => {
        const worldInfo = await import('/scripts/world-info.js');
        const saved = await worldInfo.loadWorldInfo(worldBookName);
        const entries = Object.values(saved?.entries || {});
        const scan = await worldInfo.getWorldInfoPrompt([probeComments.join('、')], 65_536, true);
        const activated = Array.isArray(scan?.activatedEntries) ? scan.activatedEntries : [];
        const comments = [...new Set(activated.map(entry => String(entry?.comment || '')).filter(Boolean))];
        const ctx = window.Taverncraft.getContext();
        const character = ctx.characters[ctx.characterId];
        return {
            known: Array.isArray(worldInfo.world_names) && worldInfo.world_names.includes(worldBookName),
            boundWorld: String(character?.data?.extensions?.world || ''),
            entryCount: entries.length,
            enabledEntryCount: entries.filter(entry => !entry?.disable).length,
            constantEntryCount: entries.filter(entry => entry?.constant).length,
            activatedEntryCount: activated.length,
            matchedProbeComments: probeComments.filter(comment => comments.includes(comment)),
            probabilityCheckedCount: activated.filter(entry => entry?.useProbability).length,
            recursionGuardCount: activated.filter(entry => entry?.preventRecursion || entry?.excludeRecursion).length,
        };
    }, { worldBookName: WORLD_BOOK_NAME, probeComments: PROBE_COMMENTS });
}

async function acceptEmbeddedWorldBookPopup(page) {
    const popup = page.locator('dialog.popup[open]', {
        hasText: /embedded World|World\/Lorebook|世界书|世界信息|导入|匯入/i,
    }).last();
    if (!(await popup.isVisible({ timeout: 2_000 }).catch(() => false))) {
        await clickCharacterCard(page, CHARACTER_NAME);
        await openCharacterEditPanel(page);
    }
    await popup.waitFor({ state: 'visible', timeout: 10_000 });
    await popup.locator('.popup-button-ok').first().click();
    await popup.waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {});
    await page.waitForFunction(async (worldBookName) => {
        const worldInfo = await import('/scripts/world-info.js');
        return Array.isArray(worldInfo.world_names) && worldInfo.world_names.includes(worldBookName);
    }, WORLD_BOOK_NAME, { timeout: 60_000 });
}

test.describe('#29 — real v4 embedded world book import', () => {
    let mock;

    test.beforeAll(async () => {
        expect(existsSync(FIXTURE_PATH), 'v4.0.png acceptance fixture exists').toBe(true);
        mock = await startMockLLM({});
    });

    test.afterAll(async () => {
        await mock?.stop();
    });

    test('waits for all 174 entries, scans named lore, and survives restart', async ({ page }) => {
        const server = await startServer({ batchKey: 'character', scenarioId: '29-real-v4-worldbook' });
        try {
            await server.stop();
            resetFixtureArtifacts(server.dataRoot);
            markOnboarded({ dataRoot: server.dataRoot });
            disableTagImportPopup({ dataRoot: server.dataRoot });
            bootstrapCustomBackend({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
            appendConnectionProfile({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
            enableEmbeddedWorldPrompt(server.dataRoot);
            await server.restart();

            await awaitMainUI(page, server.baseURL);
            await importCharacterFile(page, { filePath: FIXTURE_PATH, expectedName: CHARACTER_NAME, timeoutMs: 60_000 });
            await acceptEmbeddedWorldBookPopup(page);
            await dismissAnyPopup(page);

            const imported = await readWorldBookEvidence(page);
            expect(imported).toMatchObject({
                known: true,
                boundWorld: WORLD_BOOK_NAME,
                entryCount: 174,
                enabledEntryCount: 173,
                constantEntryCount: 33,
            });
            expect(imported.matchedProbeComments).toEqual(expect.arrayContaining(['剑临城', '东海海域']));
            expect(imported.matchedProbeComments.length).toBeGreaterThanOrEqual(2);
            expect(imported.activatedEntryCount).toBeGreaterThanOrEqual(2);
            expect(imported.probabilityCheckedCount).toBeGreaterThanOrEqual(2);
            expect(imported.recursionGuardCount).toBeGreaterThanOrEqual(2);

            await server.restart();
            await reloadAndAwait(page, server.baseURL);
            await selectCharacterByName(page, CHARACTER_NAME);
            await dismissAnyPopup(page);

            const restored = await readWorldBookEvidence(page);
            expect(restored).toMatchObject({
                known: true,
                boundWorld: WORLD_BOOK_NAME,
                entryCount: 174,
                enabledEntryCount: 173,
                constantEntryCount: 33,
            });
            expect(restored.matchedProbeComments).toEqual(expect.arrayContaining(['剑临城', '东海海域']));
        } finally {
            await tearDownServer(server);
        }
    });
});
