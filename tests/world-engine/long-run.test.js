import { describe, expect, test } from '@jest/globals';

import { createFloorStateWithDeps } from '../../public/scripts/floor-state.js';
import { applyWorldStateOperations } from '../../public/scripts/extensions/world-engine/operations.js';
import { mapLegacyInitvarToWorldState } from '../../public/scripts/extensions/world-engine/legacy-st.js';

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

function message(swipeId = 0) {
    return { mes: 'turn', swipe_id: swipeId, swipes: ['turn', 'alternate'] };
}

function v4LikeSeed() {
    return mapLegacyInitvarToWorldState({
        主角状态: {
            修为: { 当前境界: '筑基五层', 当前状态描述: '清醒' },
            灵石钱包: { 下品灵石: 50 },
            个人背包: { 亲传弟子牌子: { 数量: 1 } },
        },
        世界系统: {
            当前时间: '修真历4500年9月10日 子时一刻',
            当前地址: '天剑后山·祖师祠堂',
            大区域: '天剑宗',
            子区域: '祖师祠堂',
            委托板: {
                寻回走失灵兔: { 报酬: '20下品灵石' },
                寻找遗失剑穗: { 报酬: '50下品灵石' },
                清理外围废剑: { 报酬: '30下品灵石' },
            },
        },
        人际交往: {
            结识道友录: {
                沈慕微: {
                    当前所在地: '天剑宗·主峰',
                    好感度数值: 40,
                    好感度阶段: '泛泛之交',
                    关系标签: '师尊',
                },
            },
            当前接触人物: { 沈慕微: { 心情: '心虚' } },
        },
    }, { playerName: 'User' });
}

describe('World Engine 200-turn persistence gate', () => {
    test('keeps v4-derived state consistent and rolls back delete/swipe paths', async () => {
        const chatRef = { value: [message()] };
        const runtime = makeRuntime(chatRef);
        const floorState = createFloorStateWithDeps({ namespace: 'world_engine_long_run' }, runtime.deps);

        expect((await floorState.update(() => v4LikeSeed(), { floor: 0 })).ok).toBe(true);

        for (let turn = 1; turn <= 200; turn++) {
            chatRef.value.push(message());
            const operations = [
                { op: 'increment', path: '/clock/turn', value: 1 },
                { op: 'set', path: '/location/current', value: turn % 2 ? '天剑宗·演武场' : '天剑后山·祖师祠堂' },
                { op: 'set', path: '/flags/lastResolvedTurn', value: turn },
            ];
            if (turn % 10 === 0) {
                operations.push({ op: 'increment', path: '/relationships/沈慕微/score', value: 1 });
            }
            if (turn % 25 === 0) {
                operations.push({ op: 'append', path: '/npc/knowledge/facts', value: `第${turn}回合的长期事实` });
            }
            const write = await floorState.update((current) => {
                const applied = applyWorldStateOperations(current, operations);
                if (!applied.ok) throw new Error(applied.errors.join('; '));
                return applied.state;
            });
            expect(write.ok).toBe(true);
            expect(write.updated).toBe(true);
            expect((await floorState.get()).state.clock.turn).toBe(turn);
        }

        const after200 = (await floorState.get()).state;
        expect(after200.clock.turn).toBe(200);
        expect(after200.flags.lastResolvedTurn).toBe(200);
        expect(after200.location.current).toBe('天剑后山·祖师祠堂');
        expect(after200.relationships.沈慕微.score).toBe(60);
        expect(after200.npc.knowledge.facts).toHaveLength(8);
        expect(after200.tasks).toHaveProperty('寻回走失灵兔');
        expect(after200.extensions.stLegacy).toBeTruthy();
        expect(runtime.store.get('world_engine_long_run__floor_log').commits).toHaveLength(201);

        // Delete the final 50 turns. The floor-state log must rewind to the
        // exact state visible after turn 150, not merely decrement a counter.
        chatRef.value = chatRef.value.slice(0, 151);
        await floorState.__handleMessageDeleted(chatRef.value.length);
        const afterDelete = (await floorState.get()).state;
        expect(afterDelete.clock.turn).toBe(150);
        expect(afterDelete.flags.lastResolvedTurn).toBe(150);
        expect(afterDelete.relationships.沈慕微.score).toBe(55);
        expect(afterDelete.npc.knowledge.facts).toHaveLength(6);

        // Switching the active swipe on the tail hides the commit anchored to
        // the old swipe; switching back restores it without rewriting state.
        chatRef.value[150].swipe_id = 1;
        await floorState.__handleMessageSwiped();
        const alternateSwipe = (await floorState.get()).state;
        expect(alternateSwipe.clock.turn).toBe(149);
        expect(alternateSwipe.flags.lastResolvedTurn).toBe(149);

        chatRef.value[150].swipe_id = 0;
        await floorState.__handleMessageSwiped();
        const restoredSwipe = (await floorState.get()).state;
        expect(restoredSwipe.clock.turn).toBe(150);
        expect(restoredSwipe.flags.lastResolvedTurn).toBe(150);
    });
});
