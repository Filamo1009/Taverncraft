import { describe, expect, test } from '@jest/globals';

import {
    POST_HISTORY_EXPORT_SCHEMA,
    createPostHistoryExport,
    estimatePostHistoryTokens,
    normalizePostHistoryOverride,
    parsePostHistoryExport,
    resolvePostHistoryConfiguration,
} from '../../public/scripts/extensions/world-engine/post-history.js';
import { DEFAULT_POST_HISTORY_PROMPT } from '../../public/scripts/extensions/world-engine/prompt.js';

describe('World Engine Post-History configuration', () => {
    test('migrates legacy enabled values without enabling legacy disabled settings', () => {
        expect(normalizePostHistoryOverride({ enabled: true, prompt: 'legacy' })).toEqual({ mode: 'custom', prompt: 'legacy' });
        expect(normalizePostHistoryOverride({ enabled: false, prompt: 'legacy' })).toEqual({ mode: 'off', prompt: 'legacy' });
        expect(normalizePostHistoryOverride(null)).toEqual({ mode: 'inherit', prompt: '' });
    });

    test('resolves chat over character over model over global and skips inherit', () => {
        const result = resolvePostHistoryConfiguration({
            global: { label: 'Global', configuration: { mode: 'example' } },
            model: { label: 'Model A', configuration: { mode: 'custom', prompt: 'model' } },
            character: { label: 'Card A', configuration: { mode: 'custom', prompt: 'character' } },
            chat: { label: 'Chat A', configuration: { mode: 'inherit' } },
        });
        expect(result).toMatchObject({
            enabled: true,
            mode: 'custom',
            prompt: 'character',
            sourceScope: 'character',
            sourceLabel: 'Card A',
        });
    });

    test('supports an explicit higher-scope off switch and a built-in example', () => {
        const off = resolvePostHistoryConfiguration({
            global: { configuration: { mode: 'example' } },
            chat: { configuration: { mode: 'off' } },
        });
        expect(off.enabled).toBe(false);
        expect(off.prompt).toBe('');
        expect(off.sourceScope).toBe('chat');

        const example = resolvePostHistoryConfiguration({
            global: { configuration: { mode: 'example' } },
        });
        expect(example.enabled).toBe(true);
        expect(example.prompt).toBe(DEFAULT_POST_HISTORY_PROMPT);
    });

    test('round-trips only the current scope and contains no credentials', () => {
        const exported = createPostHistoryExport({
            scope: 'character',
            source: { label: '苍玄界', id: '苍玄界.png', apiKey: 'must-not-export' },
            configuration: { mode: 'custom', prompt: 'portable text', apiKey: 'must-not-export' },
        });
        expect(exported.schema).toBe(POST_HISTORY_EXPORT_SCHEMA);
        expect(JSON.stringify(exported)).not.toContain('must-not-export');
        expect(parsePostHistoryExport(JSON.stringify(exported))).toEqual({ ok: true, value: exported });
    });

    test('rejects arbitrary JSON and caps imported prompt size', () => {
        expect(parsePostHistoryExport('{"schema":"other"}').ok).toBe(false);
        expect(parsePostHistoryExport(JSON.stringify({
            schema: POST_HISTORY_EXPORT_SCHEMA,
            version: 1,
            scope: 'chat',
            configuration: { mode: 'surprise', prompt: 'x' },
        })).ok).toBe(false);
        const parsed = parsePostHistoryExport(JSON.stringify({
            schema: POST_HISTORY_EXPORT_SCHEMA,
            version: 1,
            scope: 'chat',
            configuration: { mode: 'custom', prompt: 'x'.repeat(120_000) },
        }));
        expect(parsed.ok).toBe(true);
        expect(parsed.value.configuration.prompt).toHaveLength(100_000);
    });

    test('provides a conservative local token estimate for mixed text', () => {
        expect(estimatePostHistoryTokens('abcd')).toBe(1);
        expect(estimatePostHistoryTokens('苍玄界')).toBe(3);
        expect(estimatePostHistoryTokens('abcd苍')).toBe(2);
    });
});
