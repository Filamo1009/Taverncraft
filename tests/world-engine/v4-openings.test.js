import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';
import YAML from 'yaml';

import { read } from '../../src/character-card-parser.js';
import { importLegacyInitvar } from '../../public/scripts/extensions/world-engine/legacy-st.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultFixturePath = path.resolve(testDirectory, '..', '..', '..', 'v4.0.png');
const fixturePath = process.env.WORLD_ENGINE_TEST_CARD || defaultFixturePath;
const describeRealFixture = fs.existsSync(fixturePath) ? describe : describe.skip;

describeRealFixture('v4.0.png opening-state acceptance', () => {
    test('keeps GameStart unseeded and maps each of the 18 explicit opening timelines', () => {
        const card = JSON.parse(read(fs.readFileSync(fixturePath)));
        const openings = [card.data.first_mes, ...card.data.alternate_greetings];
        expect(openings).toHaveLength(19);

        const results = openings.map(text => importLegacyInitvar(
            text,
            source => YAML.parse(source, { maxAliasCount: 0, prettyErrors: true }),
            { playerName: 'User', npcName: card.data.name },
        ));

        expect(results[0]).toMatchObject({ ok: false, state: null });
        expect(results.slice(1).every(result => result.ok)).toBe(true);

        const states = results.slice(1).map(result => result.state);
        expect(states.every(state => state.clock.label && state.location.current)).toBe(true);
        expect(states.every(state => state.meta.source === 'st-initvar-yaml')).toBe(true);
        expect(states.every(state => state.npc.name && state.npc.name !== card.data.name)).toBe(true);
        expect(states.every(state => Object.keys(state.relationships).length === 1)).toBe(true);
        expect(states.map(state => state.npc.name)).toEqual([
            '沈慕微', '沈慕微', '冷小凝', '印唯心', '妖九烟', '药芷若',
            '慕海棠', '谢忘生', '萧天衍', '颂长风', '姜昭昭', '苏酒儿',
            '姜澄鸢', '红', '雪照宁', '潮听澜', '凌长霜', '银摇枝',
        ]);
        expect(states[0]).toMatchObject({
            clock: { label: '修真历4500年9月10日 子时一刻' },
            location: { current: '天剑后山·祖师祠堂' },
            npc: { name: '沈慕微', location: '天剑宗·主峰' },
        });
        expect(states.at(-1)).toMatchObject({
            clock: { label: '修真历4500年7月19日 未时' },
            location: { current: '赤铃沙海·百蛊绿洲' },
            npc: { name: '银摇枝', location: '赤铃沙海·百蛊绿洲·蛊契堂' },
        });
    });
});
