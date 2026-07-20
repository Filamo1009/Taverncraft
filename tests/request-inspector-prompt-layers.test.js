import {
    getBufferForHandle,
    sanitizePromptLayerSnapshot,
    startInspection,
} from '../src/request-inspector.js';

function rawSnapshot(overrides = {}) {
    return {
        version: 1,
        assembly: {
            contextTokens: 8192,
            completionReserve: 1024,
            promptBudget: 7168,
            estimatedPromptTokens: 2000,
            remainingTokens: 5168,
            sourceHistoryMessages: 20,
            includedHistoryMessages: 18,
            omittedHistoryMessages: 2,
            preSquashMessageCount: 25,
            finalMessageCount: 12,
            squashedSystemMessages: true,
        },
        truncation: { applied: true, omittedHistoryMessages: 2, reason: 'context_budget', ignored: 'drop me' },
        layers: [{
            order: 0,
            messageIndex: 0,
            identifier: 'worldInfoBefore-1',
            label: 'World Book Entry',
            collection: 'worldInfoBefore',
            path: ['worldInfoBefore'],
            category: 'world_book',
            role: 'system',
            estimatedTokens: 500,
            preview: 'x'.repeat(5000),
            previewTruncated: false,
            charLength: 5000,
            unknown: 'drop me',
        }],
        inChatExtensions: [{
            order: 0,
            messageIndex: 3,
            identifier: 'world_engine_post_history',
            label: 'World Engine Post-History',
            category: 'post_history',
            role: 'system',
            position: 'in_chat',
            depth: 0,
            sourceScope: 'character',
            sourceLabel: '角色卡 · 苍玄界',
            configurationMode: 'custom',
            preview: 'transparent prompt',
            charLength: 18,
        }],
        ignoredRoot: 'drop me',
        ...overrides,
    };
}

describe('request inspector prompt layers', () => {
    test('whitelists, bounds, and truncates untrusted diagnostic input', () => {
        const result = sanitizePromptLayerSnapshot(rawSnapshot());

        expect(Object.keys(result)).toEqual(['version', 'assembly', 'truncation', 'layers', 'inChatExtensions']);
        expect(result.layers[0].preview).toHaveLength(4096);
        expect(result.layers[0].previewTruncated).toBe(true);
        expect(result.layers[0]).not.toHaveProperty('unknown');
        expect(result.truncation).not.toHaveProperty('ignored');
        expect(result.inChatExtensions[0]).toMatchObject({
            identifier: 'world_engine_post_history',
            category: 'post_history',
            depth: 0,
            sourceScope: 'character',
            sourceLabel: '角色卡 · 苍玄界',
            configurationMode: 'custom',
        });
    });

    test('captures then deletes the local-only field before provider dispatch', () => {
        const handle = `prompt-layer-test-${Date.now()}-${Math.random()}`;
        const request = {
            user: { profile: { handle } },
            body: {
                chat_completion_source: 'custom',
                model: 'test-model',
                messages: [{ role: 'user', content: 'hello' }],
                luker_prompt_layers: rawSnapshot(),
            },
        };

        startInspection(request);

        expect(request.body).not.toHaveProperty('luker_prompt_layers');
        const entries = getBufferForHandle(handle);
        expect(entries).toHaveLength(1);
        expect(entries[0].promptLayers.assembly.omittedHistoryMessages).toBe(2);
        expect(entries[0].promptLayers.inChatExtensions[0].identifier).toBe('world_engine_post_history');
    });

    test('deletes malformed metadata even when no inspector user is available', () => {
        const request = { body: { luker_prompt_layers: { version: 99, secret: 'never retain' } } };
        startInspection(request);
        expect(request.body).not.toHaveProperty('luker_prompt_layers');
    });
});
