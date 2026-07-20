import { describe, expect, test } from '@jest/globals';

import {
    applyWorldStateOperations,
    parseTaggedWorldStateUpdate,
    parseWorldStatePath,
    validateWorldStateOperations,
} from '../../public/scripts/extensions/world-engine/operations.js';
import { createEmptyWorldState } from '../../public/scripts/extensions/world-engine/schema.js';

describe('world state operation validation', () => {
    test('accepts the supported atomic operations', () => {
        const result = validateWorldStateOperations([
            { op: 'set', path: '/location/current', value: 'Moon Gate' },
            { op: 'increment', path: '/relationships/Alice/score', value: 3 },
            { op: 'append', path: '/npc/knowledge/facts', value: 'The gate is sealed' },
            { op: 'merge', path: '/tasks/quest-1', value: { status: 'active' } },
            { op: 'remove', path: '/flags/temporary' },
        ]);
        expect(result.ok).toBe(true);
        expect(result.operations).toHaveLength(5);
    });

    test('rejects unknown roots and prototype pollution paths', () => {
        expect(() => parseWorldStatePath('/secrets/token')).toThrow(/not part/u);
        expect(() => parseWorldStatePath('/extensions/__proto__/polluted')).toThrow(/unsafe/u);
        expect(validateWorldStateOperations([
            { op: 'set', path: '/flags/safe', value: { constructor: { polluted: true } } },
        ]).ok).toBe(false);
    });

    test('rejects malformed, empty, or oversized batches', () => {
        expect(validateWorldStateOperations(null).ok).toBe(false);
        expect(validateWorldStateOperations([]).ok).toBe(false);
        expect(validateWorldStateOperations(Array.from({ length: 65 }, () => ({
            op: 'set', path: '/flags/a', value: true,
        }))).ok).toBe(false);
    });
});

describe('applyWorldStateOperations', () => {
    test('applies a valid batch atomically', () => {
        const current = createEmptyWorldState({
            relationships: { Alice: { score: 4 } },
            flags: { temporary: true },
        });
        const result = applyWorldStateOperations(current, [
            { op: 'set', path: '/location/current', value: 'Moon Gate' },
            { op: 'increment', path: '/relationships/Alice/score', value: 3 },
            { op: 'append', path: '/npc/knowledge/facts', value: 'The gate is sealed' },
            { op: 'merge', path: '/tasks/quest-1', value: { status: 'active', progress: 1 } },
            { op: 'remove', path: '/flags/temporary' },
        ]);
        expect(result.ok).toBe(true);
        expect(result.applied).toBe(5);
        expect(result.state.location.current).toBe('Moon Gate');
        expect(result.state.relationships.Alice.score).toBe(7);
        expect(result.state.npc.knowledge.facts).toEqual(['The gate is sealed']);
        expect(result.state.tasks['quest-1']).toEqual({ status: 'active', progress: 1 });
        expect(result.state.flags.temporary).toBeUndefined();
        expect(current.location.current).toBe('');
    });

    test('returns the original normalized state when any operation fails', () => {
        const current = createEmptyWorldState({ relationships: { Alice: { score: 'high' } } });
        const result = applyWorldStateOperations(current, [
            { op: 'set', path: '/location/current', value: 'Should not land' },
            { op: 'increment', path: '/relationships/Alice/score', value: 1 },
        ]);
        expect(result.ok).toBe(false);
        expect(result.applied).toBe(0);
        expect(result.state.location.current).toBe('');
    });
});

describe('strict tagged fallback parser', () => {
    test('parses exactly one raw-JSON tagged block and returns clean prose', () => {
        const input = 'The gate opens.\n<world_state_update>{"operations":[{"op":"set","path":"/flags/gateOpen","value":true}]}</world_state_update>';
        const result = parseTaggedWorldStateUpdate(input);
        expect(result.found).toBe(true);
        expect(result.ok).toBe(true);
        expect(result.cleanText).toBe('The gate opens.');
        expect(result.operations).toEqual([
            { op: 'set', path: '/flags/gateOpen', value: true },
        ]);
    });

    test('never parses arbitrary prose or Markdown JSON fences', () => {
        expect(parseTaggedWorldStateUpdate('{"operations":[]}')).toMatchObject({ found: false, ok: true });
        expect(parseTaggedWorldStateUpdate('<world_state_update>```json\n{}\n```</world_state_update>').ok).toBe(false);
    });

    test('rejects duplicate blocks and unknown payload fields', () => {
        const block = '<world_state_update>{"operations":[{"op":"set","path":"/flags/x","value":true}]}</world_state_update>';
        expect(parseTaggedWorldStateUpdate(`${block}\n${block}`).ok).toBe(false);
        expect(parseTaggedWorldStateUpdate('<world_state_update>{"operations":[{"op":"set","path":"/flags/x","value":true}],"surprise":1}</world_state_update>').ok).toBe(false);
    });

    test('accepts a strict WorldOperationV1 fallback without treating it as legacy paths', () => {
        const hash = 'a'.repeat(64);
        const text = `Scene.<world_state_update>{"worldOperations":[{"version":1,"operationId":"op-1","idempotencyKey":"chat:1:0:1","expectedStateHash":"${hash}","type":"set_flag","args":{"key":"seen","value":true}}]}</world_state_update>`;
        const parsed = parseTaggedWorldStateUpdate(text);
        expect(parsed).toMatchObject({ found: true, ok: true, mode: 'world-v1', cleanText: 'Scene.' });
        expect(parsed.operations).toEqual([]);
        expect(parsed.worldOperations).toHaveLength(1);
    });
});
