import { describe, expect, test } from '@jest/globals';

import { createFloorStateWithDeps } from '../../public/scripts/floor-state.js';
import { executeWorldOperationBatch, hashWorldState } from '../../public/scripts/extensions/world-engine/events.js';
import { parseTaggedWorldStateUpdate } from '../../public/scripts/extensions/world-engine/operations.js';
import { createEmptyWorldState } from '../../public/scripts/extensions/world-engine/schema.js';

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makeRuntime(chatRef) {
    const store = new Map();
    return {
        store,
        deps: {
            async getChatState(namespace) {
                return { ok: true, state: clone(store.get(namespace) ?? null) };
            },
            async updateChatState(namespace, updater) {
                const next = await updater(clone(store.get(namespace) ?? null));
                if (next == null) store.delete(namespace);
                else store.set(namespace, clone(next));
                return { ok: true, state: clone(store.get(namespace) ?? null), updated: true };
            },
            async deleteChatState(namespace) {
                store.delete(namespace);
                return { ok: true };
            },
            async buildObjectPatchOperationsAsync(previous, next) {
                const { compare } = await import('../../public/scripts/util/fast-json-patch.js');
                return compare(previous ?? {}, next ?? {});
            },
            getChat: () => chatRef.value,
        },
    };
}

function assistantMessage(swipes, swipeId = 0) {
    return { is_user: false, mes: swipes[swipeId], swipes, swipe_id: swipeId };
}

function taggedOperation(operationId, expectedStateHash, key) {
    const payload = {
        worldOperations: [{
            version: 1,
            operationId,
            idempotencyKey: `chat:floor-1:${operationId}`,
            expectedStateHash,
            type: 'set_flag',
            args: { key, value: true },
            reason: `established ${key}`,
        }],
    };
    return `叙事正文 ${key}\n<world_state_update>${JSON.stringify(payload)}</world_state_update>`;
}

async function applyTaggedMessage(floorState, chatRef, floor) {
    const parsed = parseTaggedWorldStateUpdate(chatRef.value[floor].mes);
    expect(parsed).toMatchObject({ found: true, ok: true, mode: 'world-v1' });
    let executed = null;
    const swipeId = chatRef.value[floor].swipe_id;
    const write = await floorState.update(async (current) => {
        executed = await executeWorldOperationBatch(current, parsed.worldOperations, {
            chatId: 'chat', messageId: floor, floorId: floor, swipeId, createdAt: '2026-07-19T00:00:00.000Z',
        });
        if (!executed.ok) throw new Error(executed.errors.join('; '));
        return executed.state;
    }, { floor, swipeId });
    expect(write.ok).toBe(true);
    return { parsed, executed };
}

describe('strict fallback + FloorState integration', () => {
    test('commits, edits, isolates swipes, and deletes without stale branch pollution', async () => {
        const seed = createEmptyWorldState({
            npc: { name: '沈慕微' },
            meta: { initialized: true, source: 'fixture' },
        });
        const seedHash = await hashWorldState(seed);
        const swipeA = taggedOperation('op-a', seedHash, '分支A');
        const swipeB = taggedOperation('op-b', seedHash, '分支B');
        const swipeC = taggedOperation('op-c', seedHash, '分支C');
        const chatRef = {
            value: [
                assistantMessage(['seed']),
                assistantMessage([swipeA, swipeC]),
            ],
        };
        const runtime = makeRuntime(chatRef);
        const floorState = createFloorStateWithDeps({ namespace: 'world_engine_fallback_integration' }, runtime.deps);
        expect((await floorState.update(() => seed, { floor: 0, swipeId: 0 })).ok).toBe(true);

        const first = await applyTaggedMessage(floorState, chatRef, 1);
        expect(first.parsed.cleanText).toBe('叙事正文 分支A');
        expect((await floorState.get()).state.flags).toMatchObject({ 分支A: true });
        expect((await floorState.get()).state.extensions.worldEngine.events).toHaveLength(1);

        // Edit floor 1: discard its causal tail and re-derive from the edited
        // message. The old operation/event must not survive.
        chatRef.value[1].mes = swipeB;
        chatRef.value[1].swipes[0] = swipeB;
        const log = runtime.store.get('world_engine_fallback_integration__floor_log');
        expect((await floorState.reset(log.commits.filter(commit => commit.floor < 1))).ok).toBe(true);
        await applyTaggedMessage(floorState, chatRef, 1);
        const afterEdit = (await floorState.get()).state;
        expect(afterEdit.flags).toMatchObject({ 分支B: true });
        expect(afterEdit.flags).not.toHaveProperty('分支A');
        expect(afterEdit.extensions.worldEngine.events.map(event => event.operationId)).toEqual(['op-b']);

        // Switching to an uncommitted alternate swipe projects only the seed.
        chatRef.value[1].swipe_id = 1;
        chatRef.value[1].mes = swipeC;
        await floorState.__handleMessageSwiped();
        expect((await floorState.get()).state.flags).toEqual({});

        await applyTaggedMessage(floorState, chatRef, 1);
        const branchC = (await floorState.get()).state;
        expect(branchC.flags).toMatchObject({ 分支C: true });
        expect(branchC.flags).not.toHaveProperty('分支B');

        chatRef.value[1].swipe_id = 0;
        chatRef.value[1].mes = swipeB;
        await floorState.__handleMessageSwiped();
        const restoredB = (await floorState.get()).state;
        expect(restoredB.flags).toMatchObject({ 分支B: true });
        expect(restoredB.flags).not.toHaveProperty('分支C');

        // Delete the derived message and its world event together.
        chatRef.value = chatRef.value.slice(0, 1);
        await floorState.__handleMessageDeleted(1);
        const afterDelete = (await floorState.get()).state;
        expect(afterDelete.flags).toEqual({});
        expect(afterDelete.extensions.worldEngine).toBeUndefined();
    });
});
