import { describe, expect, test } from '@jest/globals';

import { hashWorldState } from '../../public/scripts/extensions/world-engine/events.js';
import { createEmptyWorldState } from '../../public/scripts/extensions/world-engine/schema.js';
import {
    WORLD_STATE_EXPORT_SCHEMA,
    buildLocationList,
    createWorldStateExport,
    parseWorldStateExport,
} from '../../public/scripts/extensions/world-engine/state-portability.js';

describe('World Engine state portability', () => {
    test('builds a de-duplicated location list with current actor positions', () => {
        const state = createEmptyWorldState({
            location: { current: '祖师祠堂', known: ['祖师祠堂', '主峰', '药田'] },
            player: { location: '祖师祠堂' },
            npc: { location: '主峰' },
        });
        expect(buildLocationList(state)).toEqual([
            { name: '祖师祠堂', current: true, actors: ['player'] },
            { name: '主峰', current: false, actors: ['npc'] },
            { name: '药田', current: false, actors: [] },
        ]);
    });

    test('round-trips a hashed state without unrelated settings or credentials', async () => {
        const state = createEmptyWorldState({
            clock: { turn: 42, label: '子时' },
            npc: { name: '沈慕微', location: '主峰' },
            extensions: { mod: { weather: 'rain' } },
        });
        const stateHash = await hashWorldState(state);
        const payload = createWorldStateExport({
            state,
            stateHash,
            source: { chatId: 'chat-a', characterName: '苍玄界', apiKey: 'must-not-export' },
        });
        expect(payload.schema).toBe(WORLD_STATE_EXPORT_SCHEMA);
        expect(JSON.stringify(payload)).not.toContain('must-not-export');
        const parsed = parseWorldStateExport(JSON.stringify(payload));
        expect(parsed.ok).toBe(true);
        expect(parsed.value.state).toEqual(state);
        expect(await hashWorldState(parsed.value.state)).toBe(stateHash);
    });

    test('rejects malformed hashes, unsafe keys, and arbitrary JSON', () => {
        expect(parseWorldStateExport('{}').ok).toBe(false);
        expect(parseWorldStateExport({
            schema: WORLD_STATE_EXPORT_SCHEMA,
            version: 1,
            stateHash: 'bad',
            state: {},
        }).ok).toBe(false);
        const unsafe = JSON.parse(`{"schema":"${WORLD_STATE_EXPORT_SCHEMA}","version":1,"state":{"extensions":{"__proto__":{"polluted":true}}}}`);
        expect(parseWorldStateExport(unsafe).ok).toBe(false);
    });
});
