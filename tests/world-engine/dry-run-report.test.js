import { describe, expect, test } from '@jest/globals';

import { createDryRunReport, flattenDryRunPrompt } from '../../public/scripts/extensions/world-engine/dry-run-report.js';

describe('World Engine local prompt dry-run report', () => {
    test('flattens chat-completion messages without request credentials', () => {
        expect(flattenDryRunPrompt([
            { role: 'system', content: 'system layer' },
            { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        ])).toBe('[0:system]\nsystem layer\n\n[1:user]\nhello');
    });

    test('summarizes world-book activation, prompt truncation, and world state', () => {
        const report = createDryRunReport({
            worldInfo: { worldInfoBeforeEntries: ['A', 'B'], worldInfoAfterEntries: ['C'] },
            generationData: { prompt: 'x'.repeat(9_000), apiKey: 'must-not-copy' },
            state: { clock: { turn: 3, label: '子时' }, location: { current: '祖师祠堂' }, npc: { name: '沈慕微' } },
        });
        expect(report.worldBook).toMatchObject({ beforeCount: 2, afterCount: 1, totalCount: 3 });
        expect(report.prompt).toMatchObject({ kind: 'string', charLength: 9_000, previewTruncated: true });
        expect(report.prompt.preview).toHaveLength(8_000);
        expect(report.state).toEqual({ turn: 3, time: '子时', location: '祖师祠堂', npc: '沈慕微' });
        expect(JSON.stringify(report)).not.toContain('must-not-copy');
    });

    test('counts at-depth and other ST world-book routes, not only before/after', () => {
        const report = createDryRunReport({
            worldInfo: {
                worldInfoDepth: [{ depth: 0, entries: ['depth rule'] }],
                anBefore: ['author rule'],
                worldInfoExamples: [{ content: 'example' }],
                outletEntries: { tools: ['outlet rule'] },
                activatedEntries: [
                    { world: 'V4', uid: 155, comment: '变量设定结束', position: 4 },
                    { world: 'V4', uid: 154, comment: '好感度规则', position: 4 },
                    { world: 'V4', uid: 153, comment: '变量列表', position: 4 },
                    { world: 'V4', uid: 152, comment: '变量输出', position: 4 },
                ],
            },
        });
        expect(report.worldBook).toMatchObject({
            beforeCount: 0,
            afterCount: 0,
            depthCount: 1,
            authorNoteCount: 1,
            exampleCount: 1,
            outletCount: 1,
            totalCount: 4,
        });
        expect(report.worldBook.activatedPreview[0]).toEqual({
            world: 'V4',
            uid: 155,
            comment: '变量设定结束',
            position: 4,
        });
    });

    test('surfaces a world-book loader error without exposing unrelated request data', () => {
        const report = createDryRunReport({
            worldInfo: { diagnostics: { loadError: 'World data could not be cloned' } },
            generationData: { prompt: 'safe prompt', apiKey: 'must-not-copy' },
        });
        expect(report.worldBook.loadError).toBe('World data could not be cloned');
        expect(JSON.stringify(report)).not.toContain('must-not-copy');
    });
});
