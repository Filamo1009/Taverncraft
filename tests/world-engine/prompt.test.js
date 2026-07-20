import { describe, expect, test } from '@jest/globals';

import { buildWorldStatePrompt, DEFAULT_POST_HISTORY_PROMPT } from '../../public/scripts/extensions/world-engine/prompt.js';
import { createEmptyWorldState } from '../../public/scripts/extensions/world-engine/schema.js';

describe('World Engine prompt contract', () => {
    test('injects authoritative state/hash and omits legacy/audit payloads', () => {
        const state = createEmptyWorldState({
            npc: { name: '沈慕微' },
            extensions: {
                stLegacy: { huge: 'original ST tree' },
                worldEngine: { events: [{ eventId: 'hidden-audit' }] },
                combatMod: { stance: 'guard' },
            },
        });
        const hash = 'b'.repeat(64);
        const prompt = buildWorldStatePrompt(state, { currentStateHash: hash, nativeTools: true, taggedFallback: true });
        expect(prompt).toContain('<authoritative_world_state>');
        expect(prompt).toContain(`<authoritative_world_state_hash>${hash}</authoritative_world_state_hash>`);
        expect(prompt).toContain('use exactly "player" or "npc"');
        expect(prompt).toContain('沈慕微');
        expect(prompt).toContain('combatMod');
        expect(prompt).not.toContain('original ST tree');
        expect(prompt).not.toContain('hidden-audit');
        expect(prompt).toContain('WorldOperationV1');
        expect(prompt).toContain('worldOperations');
        expect(prompt).toContain('MUST successfully call world_state_apply');
        expect(prompt).toContain('exact current hash are already present');
        expect(prompt).toContain('For a relationship score or note, use adjust_relationship');
        expect(prompt).toContain('Writable extension namespaces: world, worldPack, mod');
        expect(prompt).toContain('stLegacy and worldEngine are protected');
        expect(prompt).toContain('never claim a rejected change succeeded');
        expect(prompt).toContain('invalid/security probe');
        expect(prompt).toContain('do not retry or replace it with a legal mutation');
        expect(prompt).toContain(hash);
    });

    test('respects disabled native tools and tagged fallback', () => {
        const prompt = buildWorldStatePrompt(createEmptyWorldState(), { nativeTools: false, taggedFallback: false });
        expect(prompt).not.toContain('world_state_apply');
        expect(prompt).not.toContain('<world_state_update>');
    });

    test('post-history example is transparent and does not automate repeated bypass attempts', () => {
        expect(DEFAULT_POST_HISTORY_PROMPT).toContain('editable post-history');
        expect(DEFAULT_POST_HISTORY_PROMPT).toContain('user remains in control');
        expect(DEFAULT_POST_HISTORY_PROMPT).toContain('Never return only an audit/checker card');
        expect(DEFAULT_POST_HISTORY_PROMPT).toContain('actual user-facing scene');
        expect(DEFAULT_POST_HISTORY_PROMPT).not.toMatch(/retry|multi-round|loop/iu);
    });
});
