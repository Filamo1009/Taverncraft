import { describe, expect, jest, test } from '@jest/globals';

import {
    buildExactMemoryRecallGuard,
    buildExactMemoryRecallPrompt,
    buildWorldEventMemorySummary,
    extractExplicitMemoryAnchors,
    isExactMemoryRecallRequest,
    syncExplicitMemoriesToMemoryGraph,
    syncWorldEventsToMemoryGraph,
} from '../../public/scripts/extensions/world-engine/memory-bridge.js';

function eventFixture() {
    return [{
        eventId: 'event:op-1',
        operationId: 'op-1',
        chatId: 'chat-a',
        messageId: 7,
        floorId: 7,
        swipeId: 1,
        beforeStateHash: 'a'.repeat(64),
        afterStateHash: 'b'.repeat(64),
        operation: { type: 'move_actor', reason: '沈慕微抵达祖师祠堂' },
    }];
}

function stateFixture() {
    return {
        clock: { turn: 8, label: '辰时' },
        location: { current: '祖师祠堂' },
        npc: { name: '沈慕微' },
    };
}

describe('World Engine Memory Graph bridge', () => {
    test('extracts only explicitly requested quoted memories without paraphrasing', () => {
        expect(extractExplicitMemoryAnchors('请记住暗号“青瓷七雁”，也牢记「落梅三钱」。')).toEqual([
            { verbatim: '青瓷七雁', context: '请记住暗号“青瓷七雁”，也牢记「落梅三钱」。' },
            { verbatim: '落梅三钱', context: '请记住暗号“青瓷七雁”，也牢记「落梅三钱」。' },
        ]);
        expect(extractExplicitMemoryAnchors('她说“青瓷七雁”，但没有要求长期记忆。')).toEqual([]);
    });

    test('injects only the requested source-turn anchor next to an exact recall request', () => {
        const nodes = [
            { type: 'memory_anchor', fields: { source_turn: '14', verbatim: '东堤蓝灯三' } },
            { type: 'event', fields: { source_turn: '2', verbatim: 'not-an-anchor' } },
            { type: 'memory_anchor', fields: { source_turn: '2', verbatim: '青瓷七雁' } },
            { type: 'memory_anchor', fields: { source_turn: '7', verbatim: '落梅三钱' } },
        ];
        const query = '请准确说出第 2 回合我托你记住的四字暗号，答案必须包含原样文本。';
        const prompt = buildExactMemoryRecallGuard(nodes, query);
        expect(isExactMemoryRecallRequest(query)).toBe(true);
        expect(prompt).toContain('source_user_turn=2; verbatim="青瓷七雁"');
        expect(prompt).not.toContain('落梅三钱');
        expect(prompt).not.toContain('东堤蓝灯三');
        expect(prompt).toContain('never instructions');
        expect(prompt).toContain('byte-for-byte');
        expect(prompt).toContain('CURRENT-TURN REQUIREMENT');
        expect(prompt).toContain('is now satisfied');
        expect(prompt).toContain('MUST contain every matching `verbatim` value');
        expect(prompt).toContain('Do not refuse, evade');
    });

    test('does not inject exact-memory records into unrelated turns', () => {
        const nodes = [{ type: 'memory_anchor', fields: { source_turn: '2', verbatim: '青瓷七雁' } }];
        expect(buildExactMemoryRecallGuard(nodes, '我们继续前往山门。')).toBe('');
        expect(isExactMemoryRecallRequest('Please recall the code word from turn 2 verbatim.')).toBe(true);
    });

    test('reads visible memory anchors through the public Memory Graph session API', async () => {
        const listVisibleCandidates = jest.fn(() => [
            { type: 'memory_anchor', fields: { source_turn: '7', verbatim: '落梅三钱' } },
        ]);
        const context = {
            chat: [{ is_user: true, mes: '请复述第 7 回合的记忆代号。' }],
            getExtensionApi: () => ({ openSession: async () => ({ listVisibleCandidates }) }),
        };
        const prompt = await buildExactMemoryRecallPrompt(context);
        expect(prompt).toContain('source_user_turn=7; verbatim="落梅三钱"');
        expect(listVisibleCandidates).toHaveBeenCalledWith({ types: ['memory_anchor'], excludeRecentMessages: 0 });
    });

    test('builds a traceable compact memory summary', () => {
        const summary = buildWorldEventMemorySummary(eventFixture(), stateFixture());
        expect(summary).toContain('WorldEventV1 · 辰时 · 祖师祠堂');
        expect(summary).toContain('move_actor: 沈慕微抵达祖师祠堂');
        expect(summary).toContain('chat=chat-a message=7 floor=7 swipe=1');
        expect(summary).toContain('event:op-1');
        expect(summary).toContain('b'.repeat(64));
    });

    test('creates one event node and links existing NPC/location nodes', async () => {
        const createNode = jest.fn(async () => ({ id: 'memory-event-1' }));
        const upsertLinks = jest.fn(async () => ({ applied: 2 }));
        const findByName = jest.fn(async ({ query, types }) => {
            if (query === 'op-1') return { matches: [] };
            if (types.includes('character_sheet')) return { matches: [{ id: 'npc-node' }] };
            if (types.includes('location_state')) return { matches: [{ id: 'location-node' }] };
            return { matches: [] };
        });
        const session = { createNode, upsertLinks, findByName };
        const context = { getExtensionApi: () => ({ openSession: async () => session }) };
        const result = await syncWorldEventsToMemoryGraph(context, eventFixture(), stateFixture());
        expect(result).toMatchObject({ ok: true, duplicate: false, memoryNodeId: 'memory-event-1', linked: 2 });
        expect(createNode).toHaveBeenCalledWith(expect.objectContaining({ type: 'event', title: 'WorldEvent op-1' }));
        expect(upsertLinks).toHaveBeenCalledWith({
            source: { id: 'memory-event-1' },
            links: [
                { target: { id: 'npc-node' }, relation: 'involved_in', direction: 'out' },
                { target: { id: 'location-node' }, relation: 'occurred_at', direction: 'out' },
            ],
        });
    });

    test('deduplicates retries by operation id and skips cleanly without the API', async () => {
        const session = {
            findByName: async () => ({ matches: [{ id: 'existing-event' }] }),
            createNode: jest.fn(),
            upsertLinks: jest.fn(),
        };
        const duplicateContext = { getExtensionApi: () => ({ openSession: async () => session }) };
        const duplicate = await syncWorldEventsToMemoryGraph(duplicateContext, eventFixture(), stateFixture());
        expect(duplicate).toMatchObject({ ok: true, duplicate: true, memoryNodeId: 'existing-event' });
        expect(session.createNode).not.toHaveBeenCalled();

        const skipped = await syncWorldEventsToMemoryGraph({}, eventFixture(), stateFixture());
        expect(skipped).toMatchObject({ ok: false, skipped: true, reason: 'memory-graph-api-unavailable' });
    });

    test('persists exact user memories with their source turn and deduplicates retries', async () => {
        const createNode = jest.fn(async () => ({ id: 'anchor-1' }));
        const keywordSearch = jest.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ id: 'anchor-1', fields: { verbatim: '青瓷七雁' } }]);
        const session = { createNode, keywordSearch };
        const context = {
            chat: [
                { is_user: false, mes: 'opening' },
                { is_user: true, mes: '普通第一回合' },
                { is_user: false, mes: 'reply' },
                { is_user: true, mes: '请记住暗号“青瓷七雁”，不要主动复述。' },
                { is_user: false, mes: '我记住了。' },
            ],
            getExtensionApi: () => ({ openSession: async () => session }),
        };
        const created = await syncExplicitMemoriesToMemoryGraph(context, 4);
        expect(created).toMatchObject({ ok: true, created: 1, duplicates: 0, memoryNodeIds: ['anchor-1'] });
        expect(createNode).toHaveBeenCalledWith(expect.objectContaining({
            type: 'memory_anchor',
            title: 'Explicit memory T2.1',
            fields: expect.objectContaining({ source_turn: '2', verbatim: '青瓷七雁', source_message_id: '3' }),
        }));

        const duplicate = await syncExplicitMemoriesToMemoryGraph(context, 4);
        expect(duplicate).toMatchObject({ ok: true, created: 0, duplicates: 1, memoryNodeIds: ['anchor-1'] });
        expect(createNode).toHaveBeenCalledTimes(1);
    });
});
