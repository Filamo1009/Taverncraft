import { describe, expect, test } from '@jest/globals';

import {
    extractLegacyInitvar,
    findActiveLegacyInitvarCandidate,
    inferSeedNpcName,
    importLegacyInitvar,
    mapLegacyInitvarToWorldState,
} from '../../public/scripts/extensions/world-engine/legacy-st.js';

describe('ST initvar compatibility adapter', () => {
    test('never seeds the active branch from an inactive opening swipe', () => {
        const inactiveInitvar = '<initvar>世界系统:\n  当前时间: 错误时间</initvar>';
        expect(findActiveLegacyInitvarCandidate([{
            is_user: false,
            mes: '【GameStart】',
            swipe_id: 0,
            swipes: ['【GameStart】', inactiveInitvar],
        }])).toBeNull();

        expect(findActiveLegacyInitvarCandidate([{
            is_user: false,
            mes: inactiveInitvar,
            swipe_id: 1,
            swipes: ['【GameStart】', inactiveInitvar],
        }])).toEqual({ floor: 0, text: inactiveInitvar });
    });

    test('does not treat a GameStart world-card name as an NPC', () => {
        const worldCard = {
            name: '苍玄界',
            data: {
                first_mes: '【GameStart】',
                character_book: { entries: [] },
                extensions: {},
            },
        };
        expect(inferSeedNpcName(worldCard, '苍玄界')).toBe('');
        worldCard.data.extensions.world_engine = { primaryNpc: '沈慕微' };
        expect(inferSeedNpcName(worldCard, '苍玄界')).toBe('沈慕微');
        expect(inferSeedNpcName({ name: 'Seraphina', data: { first_mes: 'Hello' } }, 'Seraphina')).toBe('Seraphina');
    });

    test('extracts one complete initvar block only', () => {
        expect(extractLegacyInitvar('<UpdateVariable><initvar>a: 1</initvar></UpdateVariable>')).toBe('a: 1');
        expect(extractLegacyInitvar('no block')).toBeNull();
        expect(extractLegacyInitvar('<initvar>a<initvar>b</initvar>')).toBeNull();
    });

    test('maps the v4-style Chinese variable tree into authoritative core state', () => {
        const state = mapLegacyInitvarToWorldState({
            主角状态: {
                修为: { 当前境界: '筑基五层', 当前状态描述: '清醒' },
                灵石钱包: { 下品灵石: 50 },
                个人背包: { 弟子牌: { 数量: 1 } },
            },
            世界系统: {
                当前时间: '修真历4500年9月10日 子时一刻',
                当前地址: '天剑宗·祖师祠堂',
                大区域: '天剑宗',
                子区域: '祖师祠堂',
                委托板: { 寻兔: { 报酬: '20下品灵石' } },
            },
            人际交往: {
                结识道友录: {
                    沈慕微: { 当前所在地: '天剑宗·主峰', 好感度数值: 40, 好感度阶段: '泛泛之交', 关系标签: '师尊' },
                },
                当前接触人物: {
                    沈慕微: { 心情: '心虚', 心声: '完了' },
                },
            },
        }, { playerName: 'User' });

        expect(state.meta).toMatchObject({ initialized: true, source: 'st-initvar-yaml' });
        expect(state.clock.label).toContain('4500年');
        expect(state.location.current).toBe('天剑宗·祖师祠堂');
        expect(state.player.name).toBe('User');
        expect(state.player.inventory.弟子牌.数量).toBe(1);
        expect(state.npc).toMatchObject({ id: 'npc:沈慕微', name: '沈慕微', location: '天剑宗·主峰' });
        expect(state.relationships.沈慕微).toMatchObject({ score: 40, stage: '泛泛之交', label: '师尊' });
        expect(state.extensions.stLegacy.世界系统.当前地址).toBe('天剑宗·祖师祠堂');
    });

    test('uses an injected YAML parser and reports parser failures', () => {
        const parser = () => ({ 世界系统: { 当前地址: 'A' } });
        expect(importLegacyInitvar('<initvar>ignored</initvar>', parser).ok).toBe(true);
        expect(importLegacyInitvar('<initvar>bad</initvar>', () => { throw new Error('bad yaml'); })).toMatchObject({ ok: false, error: 'bad yaml' });
    });

    test('prefers a known in-world person over a world-simulation card name', () => {
        const state = mapLegacyInitvarToWorldState({
            世界系统: { 当前地址: '弟子居所' },
            人际交往: {
                当前接触人物: {},
                结识道友录: {
                    沈慕微: { 当前所在地: '主峰', 关系标签: '师尊' },
                    江念: { 当前所在地: '弟子居所', 关系标签: '师妹' },
                },
            },
        }, { playerName: 'User', npcName: '苍玄界' });

        expect(state.npc).toMatchObject({ name: '沈慕微', location: '主峰' });
        expect(state.relationships).toHaveProperty('沈慕微');
        expect(state.relationships).not.toHaveProperty('苍玄界');
    });

    test('keeps the card-name fallback for an ordinary character card', () => {
        const state = mapLegacyInitvarToWorldState({ 世界系统: { 当前地址: '客栈' } }, { npcName: '普通角色' });
        expect(state.npc).toMatchObject({ name: '普通角色', location: '客栈' });
    });
});
