import {
    createPromptLayerSnapshot,
    finalizePromptLayerSnapshot,
    getPromptLayerSnapshot,
    rememberPromptLayerSnapshot,
} from '../../public/scripts/prompt-inspector-snapshot.js';

function message(identifier, role, content, tokens) {
    return { identifier, role, content, tokens, getTokens: () => tokens };
}

describe('prompt inspector snapshot', () => {
    test('preserves ordered prompt sources and reports context truncation', () => {
        const tree = {
            identifier: 'root',
            collection: [
                { identifier: 'main', collection: [message('main', 'system', 'Base system prompt', 4)] },
                { identifier: 'worldInfoBefore', collection: [message('worldInfoBefore-1', 'system', 'Lore entry', 3)] },
                {
                    identifier: 'chatHistory',
                    collection: [
                        message('chatHistory-3', 'system', 'WORLD STATE\nPOST HISTORY', 8),
                        message('chatHistory-2', 'user', 'Newest user message', 5),
                    ],
                },
            ],
        };
        const finalMessages = [
            { role: 'system', content: 'Base system prompt' },
            { role: 'system', content: 'Lore entry' },
            { role: 'system', content: 'WORLD STATE\nPOST HISTORY' },
            { role: 'user', content: 'Newest user message' },
        ];
        const sourceMessages = [
            { role: 'user', content: 'Old user' },
            { role: 'assistant', content: 'Old assistant' },
            { role: 'user', content: 'Newest user message' },
        ];
        const extensionPrompts = {
            world_engine_authoritative_state: { position: 1, depth: 1, role: 0, value: 'WORLD STATE' },
            world_engine_post_history: {
                position: 1,
                depth: 0,
                role: 0,
                value: 'POST HISTORY',
                diagnostics: { sourceScope: 'character', sourceLabel: '角色卡 · 苍玄界', configurationMode: 'custom' },
            },
            ignored_relative: { position: 0, depth: 0, role: 0, value: 'ignored' },
        };

        const snapshot = createPromptLayerSnapshot({
            messageTree: tree,
            finalMessages,
            sourceMessages,
            extensionPrompts,
            contextTokens: 100,
            completionReserve: 20,
            remainingTokens: 60,
            substitute: text => text,
        });

        expect(snapshot.layers.map(layer => layer.identifier)).toEqual([
            'main',
            'worldInfoBefore-1',
            'chatHistory-3',
            'chatHistory-2',
        ]);
        expect(snapshot.layers[1].category).toBe('world_book');
        expect(snapshot.assembly).toMatchObject({
            contextTokens: 100,
            completionReserve: 20,
            promptBudget: 80,
            estimatedPromptTokens: 20,
            sourceHistoryMessages: 3,
            includedHistoryMessages: 1,
            omittedHistoryMessages: 2,
        });
        expect(snapshot.truncation).toEqual({ applied: true, omittedHistoryMessages: 2, reason: 'context_budget' });
        expect(snapshot.inChatExtensions.map(layer => [layer.identifier, layer.category, layer.messageIndex])).toEqual([
            ['world_engine_authoritative_state', 'world_state', 2],
            ['world_engine_post_history', 'post_history', 2],
        ]);
        expect(snapshot.inChatExtensions[1]).toMatchObject({
            sourceScope: 'character',
            sourceLabel: '角色卡 · 苍玄界',
            configurationMode: 'custom',
        });
    });

    test('stores snapshots out of band and finalizes squash diagnostics', () => {
        const messages = [{ role: 'system', content: 'x' }];
        const snapshot = createPromptLayerSnapshot({
            messageTree: { identifier: 'root', collection: [message('main', 'system', 'x', 1)] },
            finalMessages: messages,
        });

        finalizePromptLayerSnapshot(snapshot, messages, { squashedSystemMessages: true });
        rememberPromptLayerSnapshot(messages, snapshot);

        expect(getPromptLayerSnapshot(messages)).toBe(snapshot);
        expect(getPromptLayerSnapshot([{ role: 'system', content: 'x' }])).toBeNull();
        expect(snapshot.assembly.squashedSystemMessages).toBe(true);
        expect(Object.keys(messages)).toEqual(['0']);
    });
});
