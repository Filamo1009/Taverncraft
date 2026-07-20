import { beforeAll, describe, expect, jest, test } from '@jest/globals';
import '../memory-graph/_mocks/main-module-stack.js';

import { buildWorldEventMemorySummary } from '../../public/scripts/extensions/world-engine/memory-bridge.js';

const holder = { settings: null };

jest.unstable_mockModule('../../public/scripts/extensions/memory-graph/vector-index.js', () => ({
    findSimilarNodes: jest.fn(async () => []),
    getVectorConfigFromSettings: jest.fn(() => null),
    getRerankProfileFromSettings: jest.fn(() => null),
    validateVectorConfig: () => ({ ok: true }),
    syncVectorIndex: async () => ({}),
    ensureVectorIndexState: () => ({}),
    buildCollectionId: () => '',
    buildNodeVectorText: () => '',
    buildNodeVectorHash: () => '',
    computeVectorSyncPlan: () => ({ inserts: [], deletes: [] }),
    queryVectorCollection: async () => [],
    queryVectorCollectionByVector: async () => [],
    rerankDocuments: async (_query, docs) => docs,
    insertVectorItems: async () => ({}),
    deleteVectorItems: async () => ({}),
    purgeVectorCollection: async () => ({}),
}));

jest.unstable_mockModule('../../public/scripts/extensions/memory-graph/character-overrides.js', () => ({
    configure: () => {},
    getCurrentAvatar: () => '',
    getCharacterByAvatar: () => null,
    getCharacterIndexByAvatar: () => -1,
    getCharacterDisplayNameByAvatar: () => '',
    getCharacterExtensionDataByAvatar: () => ({}),
    getCharacterSchemaOverrideByAvatar: () => null,
    getCharacterAdvancedOverrideByAvatar: () => null,
    getEffectiveAdvancedSettings: (_context, base) => holder.settings || base || {},
    getEffectiveSettings: (_context, base) => holder.settings || base || {},
    getEffectiveNodeTypeSchema: (_context, settings) => holder.settings?.nodeTypeSchema || settings?.nodeTypeSchema || [],
    getSchemaScopeInfo: () => ({ avatar: '', characterName: '', hasOverride: false, effectiveSchema: [] }),
    getAdvancedScopeInfo: () => ({ avatar: '', characterName: '', hasOverride: false, effectiveSettings: {} }),
    persistCharacterSchemaOverride: async () => {},
    removeCharacterSchemaOverride: async () => {},
    persistCharacterAdvancedOverride: async () => {},
    removeCharacterAdvancedOverride: async () => {},
}));

let getMemoryGraphReadApi;

beforeAll(async () => {
    ({ getMemoryGraphReadApi } = await import('../../public/scripts/extensions/memory-graph/read-api.js'));
    holder.settings = {
        nodeTypeSchema: [{
            id: 'event',
            label: 'Event',
            tableName: 'event_table',
            tableColumns: ['summary'],
            embeddingColumns: ['summary'],
            requiredColumns: ['summary'],
            primaryKeyColumns: [],
            forceUpdate: true,
            alwaysInject: true,
            editable: false,
            keywords: ['event', 'world'],
            compression: { mode: 'hierarchical' },
        }],
    };
});

const criticalFacts = new Map([
    [5, '沈慕微把青玉剑穗交给主角'],
    [60, '祖师祠堂石碑背面刻着归墟二字'],
    [120, '灵兔只会在月圆夜靠近寒潭'],
    [170, '沈慕微答应在问剑大会后坦白旧事'],
]);

function makeEvent(turn) {
    const fact = criticalFacts.get(turn) || `第${turn}回合在天剑宗推进日常修行`;
    return {
        eventId: `event:turn-${turn}`,
        operationId: `turn-${turn}`,
        chatId: 'memory-200-chat',
        messageId: turn,
        floorId: turn,
        swipeId: 0,
        beforeStateHash: String(turn - 1).padStart(64, '0'),
        afterStateHash: String(turn).padStart(64, '0'),
        operation: { type: 'set_flag', reason: fact },
    };
}

function makeStore(maxTurn = 200, branchFactTurn = null) {
    const nodes = {};
    for (let turn = 1; turn <= maxTurn; turn++) {
        const event = makeEvent(turn);
        let summary = buildWorldEventMemorySummary([event], {
            clock: { turn, label: `修真历第${turn}回合` },
            location: { current: turn % 2 ? '祖师祠堂' : '主峰' },
            npc: { name: '沈慕微' },
        });
        if (turn === branchFactTurn) {
            summary += '\n废弃分支事实：沈慕微离开天剑宗';
        }
        nodes[`event-${turn}`] = {
            id: `event-${turn}`,
            type: 'event',
            level: 'semantic',
            title: `WorldEvent turn-${turn}`,
            fields: { summary },
            seqTo: turn,
            floorRange: { start: turn, end: turn },
            parentId: '',
            childrenIds: [],
            archived: false,
            semanticRollup: false,
            semanticDepth: 0,
        };
    }
    return { nodes, edges: [], seqCounter: maxTurn };
}

describe('World Engine 200-turn Memory Graph recall gate', () => {
    test('recalls all designated 30+ turn facts with source trace', () => {
        const store = makeStore();
        const api = getMemoryGraphReadApi(store, {});
        const queries = [
            ['青玉剑穗', 5],
            ['归墟二字', 60],
            ['月圆夜靠近寒潭', 120],
            ['问剑大会后坦白旧事', 170],
        ];
        let correct = 0;
        for (const [query, expectedTurn] of queries) {
            const hits = api.keywordSearch({ query, types: ['event'], k: 5 });
            expect(hits.length).toBeGreaterThan(0);
            expect(hits[0].id).toBe(`event-${expectedTurn}`);
            expect(hits[0].fields.summary).toContain(`message=${expectedTurn} floor=${expectedTurn} swipe=0`);
            expect(hits[0].fields.summary).toContain(`event:turn-${expectedTurn}`);
            correct++;
        }
        expect(correct / queries.length).toBeGreaterThanOrEqual(0.95);
        expect(api.listNodes({ types: ['event'] })).toHaveLength(200);
    });

    test('a branch-only fact disappears when the graph rewinds before its floor', () => {
        const branchStore = makeStore(200, 180);
        const branchApi = getMemoryGraphReadApi(branchStore, {});
        expect(branchApi.keywordSearch({ query: '离开天剑宗', types: ['event'], k: 5 })[0].id).toBe('event-180');

        // This is the materialized graph FloorState exposes after deleting /
        // switching away from floors 151-200.
        const rewoundStore = makeStore(150);
        const rewoundApi = getMemoryGraphReadApi(rewoundStore, {});
        expect(rewoundApi.keywordSearch({ query: '离开天剑宗', types: ['event'], k: 5 })).toEqual([]);
        expect(rewoundApi.keywordSearch({ query: '青玉剑穗', types: ['event'], k: 5 })[0].id).toBe('event-5');
    });
});
