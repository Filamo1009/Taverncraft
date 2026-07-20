// #26 — World Engine state is edited through the visible UI, exported as a
// credential-free hashed backup, refuses a tampered backup, restores the valid
// backup, and survives a real server restart.

import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { startServer, tearDownServer } from '../_lib/server.js';
import { markOnboarded } from '../_lib/fixtures.js';
import {
    awaitMainUI,
    openExtensionsDrawer,
    openInlineDrawer,
    reloadAndAwait,
    selectCharacterByName,
} from '../_lib/page.js';

let server;

test.beforeAll(async () => {
    server = await startServer({ batchKey: 'chat', scenarioId: 'world-engine-state-backup' });
    markOnboarded({ dataRoot: server.dataRoot });
});

test.afterAll(async () => {
    await tearDownServer(server);
});

async function openWorldEngine(page) {
    await selectCharacterByName(page, 'Seraphina');
    await openExtensionsDrawer(page);
    await openInlineDrawer(page, 'world_engine_settings');
    await page.locator('#world_engine_state_json').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForFunction(() => {
        const value = document.querySelector('#world_engine_state_json')?.value || '';
        return value.includes('"schemaVersion"');
    }, { timeout: 15_000 });
}

async function readEditorState(page) {
    return JSON.parse(await page.locator('#world_engine_state_json').inputValue());
}

async function saveEditorState(page, state) {
    await page.locator('#world_engine_state_json').fill(JSON.stringify(state, null, 2));
    await page.locator('#world_engine_save_state').click();
    await expect(page.locator('#world_engine_state_summary')).toContainText(`Turn ${state.clock.turn}`);
}

test.describe('#26 — World Engine state backup and restart', () => {
    test('validates backup integrity and preserves restored state across restart', async ({ page }) => {
        await awaitMainUI(page, server.baseURL);
        await openWorldEngine(page);

        const original = await readEditorState(page);
        const accepted = {
            ...original,
            clock: { ...original.clock, turn: 37, label: '验收时刻' },
            location: {
                ...original.location,
                current: '验收庭院',
                known: [...new Set([...(original.location?.known || []), '验收庭院'])],
            },
            player: { ...original.player, location: '验收庭院' },
            npc: { ...original.npc, name: '验收 NPC', location: '验收庭院' },
            flags: { ...original.flags, phase1BackupMarker: 'restorable' },
        };
        await saveEditorState(page, accepted);

        const beforeExport = await page.evaluate(async () => {
            const result = await window.Taverncraft.worldEngine.getState();
            return { state: result.state, stateHash: result.stateHash };
        });
        expect(beforeExport.state.flags.phase1BackupMarker).toBe('restorable');
        expect(beforeExport.stateHash).toMatch(/^[a-f0-9]{64}$/);

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.locator('#world_engine_export_state').click(),
        ]);
        expect(download.suggestedFilename()).toBe('world-engine-state-backup.json');
        const backupPath = await download.path();
        expect(backupPath).toBeTruthy();
        const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
        expect(backup).toMatchObject({
            schema: 'world-engine-state-backup-v1',
            version: 1,
            stateHash: beforeExport.stateHash,
        });
        const serializedBackup = JSON.stringify(backup);
        expect(serializedBackup).not.toMatch(/api[_-]?key|authorization|cookie|connectionManager/i);

        const changed = {
            ...beforeExport.state,
            clock: { ...beforeExport.state.clock, turn: 99, label: '不应保留' },
            flags: { ...beforeExport.state.flags, phase1BackupMarker: 'changed' },
        };
        await saveEditorState(page, changed);

        const tamperedPath = resolve(server.dataRoot, 'tampered-world-engine-state.json');
        const tampered = structuredClone(backup);
        tampered.state.clock.turn = 1234;
        writeFileSync(tamperedPath, JSON.stringify(tampered), 'utf8');
        await page.locator('#world_engine_import_state_file').setInputFiles(tamperedPath);
        await expect.poll(async () => (await page.evaluate(async () => (
            await window.Taverncraft.worldEngine.getState()
        ).state.clock.turn))).toBe(99);

        await page.locator('#world_engine_import_state_file').setInputFiles(backupPath);
        await expect(page.locator('#world_engine_state_summary')).toContainText('Turn 37');
        const restored = await page.evaluate(async () => await window.Taverncraft.worldEngine.getState());
        expect(restored.state.flags.phase1BackupMarker).toBe('restorable');
        expect(restored.stateHash).toBe(beforeExport.stateHash);

        await server.restart();
        await reloadAndAwait(page, server.baseURL);
        await openWorldEngine(page);
        await expect(page.locator('#world_engine_state_summary')).toContainText('Turn 37');
        await expect(page.locator('#world_engine_state_summary')).toContainText('验收庭院');
        const afterRestart = await page.evaluate(async () => await window.Taverncraft.worldEngine.getState());
        expect(afterRestart.state.flags.phase1BackupMarker).toBe('restorable');
        expect(afterRestart.stateHash).toBe(beforeExport.stateHash);
    });
});
