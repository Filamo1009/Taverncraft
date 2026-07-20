import { describe, expect, test } from '@jest/globals';

import {
    executeWorldOperationBatch,
    hashWorldState,
    replayWorldEvents,
    validateWorldOperationEnvelopes,
} from '../../public/scripts/extensions/world-engine/events.js';
import { createEmptyWorldState } from '../../public/scripts/extensions/world-engine/schema.js';

function seedState() {
    return createEmptyWorldState({
        clock: { turn: 3, label: '初始时刻' },
        location: { current: '祖师祠堂', known: ['祖师祠堂'] },
        player: { name: 'User', location: '祖师祠堂', inventory: { 灵石: 5 } },
        npc: { name: '沈慕微', location: '主峰', inventory: {} },
        relationships: { 沈慕微: { score: 40 } },
        meta: { initialized: true, source: 'test' },
    });
}

function envelope(index, expectedStateHash, type, args) {
    return {
        version: 1,
        operationId: `turn-4-op-${index}`,
        idempotencyKey: `chat-a:floor-4:swipe-0:${index}`,
        expectedStateHash,
        type,
        args,
        reason: 'test fixture',
    };
}

describe('WorldOperationV1 validation and event ledger', () => {
    test('hash is stable across JSON key order and ignores volatile metadata/audit', async () => {
        const a = seedState();
        const b = JSON.parse(JSON.stringify(a));
        b.meta.updatedAt = 'tomorrow';
        b.extensions.worldEngine = { events: [{ arbitrary: true }] };
        b.flags = { b: 2, a: 1 };
        a.flags = { a: 1, b: 2 };
        expect(await hashWorldState(a)).toBe(await hashWorldState(b));
    });

    test('rejects unknown fields, bad hashes, duplicate ids, and unsupported types', () => {
        const base = envelope(1, '0'.repeat(64), 'set_flag', { key: 'x', value: true });
        expect(validateWorldOperationEnvelopes([{ ...base, extra: true }]).ok).toBe(false);
        expect(validateWorldOperationEnvelopes([{ ...base, expectedStateHash: 'bad' }]).ok).toBe(false);
        expect(validateWorldOperationEnvelopes([base, base]).ok).toBe(false);
        expect(validateWorldOperationEnvelopes([{ ...base, type: 'write_anything' }]).ok).toBe(false);
    });

    test('applies a domain batch atomically and records source-linked immutable events', async () => {
        const seed = seedState();
        const hash = await hashWorldState(seed);
        const operations = [
            envelope(1, hash, 'advance_time', { turns: 1, label: '辰时' }),
            envelope(2, hash, 'move_actor', { actor: 'npc', location: '祖师祠堂' }),
            envelope(3, hash, 'give_item', { target: 'npc', itemId: '灵石', quantity: 2 }),
            envelope(4, hash, 'adjust_relationship', { character: '沈慕微', delta: 3, note: '开始建立信任' }),
            envelope(5, hash, 'create_task', { taskId: '问剑', task: { title: '向师尊问剑' } }),
            envelope(6, hash, 'set_flag', { key: '师尊已到场', value: true }),
        ];
        const result = await executeWorldOperationBatch(seed, operations, {
            chatId: 'chat-a', messageId: 4, floorId: 4, swipeId: 0, createdAt: '2026-07-19T00:00:00.000Z',
        });
        expect(result.ok).toBe(true);
        expect(result.state.clock).toMatchObject({ turn: 4, label: '辰时' });
        expect(result.state.npc).toMatchObject({ location: '祖师祠堂', inventory: { 灵石: 2 } });
        expect(result.state.location.presentCharacters).toEqual(['沈慕微']);
        expect(result.state.relationships.沈慕微.score).toBe(43);
        expect(result.state.relationships.沈慕微.note).toBe('开始建立信任');
        expect(result.state.tasks.问剑).toMatchObject({ title: '向师尊问剑', status: 'active' });
        expect(result.state.flags.师尊已到场).toBe(true);
        expect(result.events).toHaveLength(6);
        expect(result.events[0]).toMatchObject({ chatId: 'chat-a', floorId: 4, swipeId: 0 });
        expect(result.events.at(-1).afterStateHash).toBe(await hashWorldState(result.state));
    });

    test('updates a relationship note without requiring a score change', async () => {
        const seed = seedState();
        const hash = await hashWorldState(seed);
        const result = await executeWorldOperationBatch(seed, [
            envelope(1, hash, 'adjust_relationship', { character: '沈慕微', note: '开始建立信任' }),
        ]);
        expect(result.ok).toBe(true);
        expect(result.state.relationships.沈慕微).toEqual({ score: 40, note: '开始建立信任' });
        expect(result.events).toHaveLength(1);

        const missingChange = await executeWorldOperationBatch(seed, [
            envelope(2, hash, 'adjust_relationship', { character: '沈慕微' }),
        ]);
        expect(missingChange.ok).toBe(false);
        expect(missingChange.state.relationships.沈慕微).toEqual({ score: 40 });
    });

    test('normalizes authoritative actor names and common aliases without accepting unknown actors', async () => {
        const seed = seedState();
        const hash = await hashWorldState(seed);
        const compatible = await executeWorldOperationBatch(seed, [
            envelope(1, hash, 'move_actor', { actor: 'User', location: '剑临城·西城门' }),
            envelope(2, hash, 'move_actor', { actor: '沈慕微', location: '剑临城·西城门' }),
            envelope(3, hash, 'give_item', { target: '玩家', itemId: '青纹玉简', quantity: 1 }),
        ]);
        expect(compatible.ok).toBe(true);
        expect(compatible.state.player.location).toBe('剑临城·西城门');
        expect(compatible.state.npc.location).toBe('剑临城·西城门');
        expect(compatible.state.location.presentCharacters).toEqual(['沈慕微']);
        expect(compatible.state.player.inventory.青纹玉简).toBe(1);

        const rejected = await executeWorldOperationBatch(seed, [
            envelope(4, hash, 'move_actor', { actor: '未知路人', location: '剑临城·西城门' }),
        ]);
        expect(rejected.ok).toBe(false);
        expect(rejected.state.player.location).toBe('祖师祠堂');
        expect(rejected.state.npc.location).toBe('主峰');
    });

    test('idempotent retry is a no-op and a stale non-duplicate write is rejected', async () => {
        const seed = seedState();
        const hash = await hashWorldState(seed);
        const operation = envelope(1, hash, 'set_flag', { key: 'once', value: true });
        const first = await executeWorldOperationBatch(seed, [operation]);
        const retry = await executeWorldOperationBatch(first.state, [operation]);
        expect(retry.ok).toBe(true);
        expect(retry.events).toHaveLength(0);
        expect(retry.duplicateOperationIds).toEqual([operation.operationId]);
        const stale = await executeWorldOperationBatch(first.state, [envelope(2, hash, 'set_flag', { key: 'stale', value: true })]);
        expect(stale.ok).toBe(false);
        expect(stale.state.flags).not.toHaveProperty('stale');
    });

    test('accepts chained hashes from multiple staged tool calls in one atomic commit', async () => {
        const seed = seedState();
        const initialHash = await hashWorldState(seed);
        const firstOp = envelope(1, initialHash, 'set_flag', { key: 'firstStage', value: true });
        const firstPreview = await executeWorldOperationBatch(seed, [firstOp], { createdAt: 'preview' });
        const previewHash = await hashWorldState(firstPreview.state);
        const secondOp = envelope(2, previewHash, 'set_flag', { key: 'secondStage', value: true });
        const committed = await executeWorldOperationBatch(seed, [firstOp, secondOp]);
        expect(committed.ok).toBe(true);
        expect(committed.state.flags).toMatchObject({ firstStage: true, secondStage: true });
        expect(committed.events).toHaveLength(2);
    });

    test('failed precondition rolls back the entire batch', async () => {
        const seed = seedState();
        const hash = await hashWorldState(seed);
        const result = await executeWorldOperationBatch(seed, [
            envelope(1, hash, 'set_flag', { key: 'mustRollback', value: true }),
            envelope(2, hash, 'remove_item', { target: 'player', itemId: '不存在', quantity: 1 }),
        ]);
        expect(result.ok).toBe(false);
        expect(result.events).toHaveLength(0);
        expect(result.state.flags).not.toHaveProperty('mustRollback');
        expect(await hashWorldState(result.state)).toBe(hash);
    });

    test('declared extension namespaces are enforced', async () => {
        const seed = seedState();
        const hash = await hashWorldState(seed);
        const op = envelope(1, hash, 'set_extension_value', { namespace: 'combatMod', path: '/stance', value: 'guard' });
        const denied = await executeWorldOperationBatch(seed, [op]);
        expect(denied.ok).toBe(false);
        const allowed = await executeWorldOperationBatch(seed, [op], { allowedExtensionNamespaces: ['combatMod'] });
        expect(allowed.ok).toBe(true);
        expect(allowed.state.extensions.combatMod.stance).toBe('guard');
    });

    test('replays the immutable event chain to the same final hash', async () => {
        const seed = seedState();
        const hash = await hashWorldState(seed);
        const applied = await executeWorldOperationBatch(seed, [
            envelope(1, hash, 'give_item', { target: 'player', itemId: '剑穗', quantity: 1, item: { quality: '旧' } }),
            envelope(2, hash, 'create_task', { taskId: '寻剑穗', task: { title: '寻找剑穗' } }),
        ], { createdAt: '2026-07-19T00:00:00.000Z' });
        const replayed = await replayWorldEvents(seed, applied.events);
        expect(replayed.ok).toBe(true);
        expect(replayed.stateHash).toBe(await hashWorldState(applied.state));
        expect(replayed.state.player.inventory.剑穗).toMatchObject({ quality: '旧', quantity: 1 });
    });
});
