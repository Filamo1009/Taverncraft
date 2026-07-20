import { describe, expect, test } from '@jest/globals';

import {
    PHASE1_BRANCH_TURN,
    PHASE1_EDIT_TURNS,
    PHASE1_INVALID_OPERATION_TURN,
    PHASE1_KEYWORD_TURNS,
    PHASE1_LIVE_FACTS,
    PHASE1_LIVE_TURN_COUNT,
    PHASE1_LIVE_TURNS,
    PHASE1_RESTART_TURN,
    PHASE1_SWIPE_TURNS,
    PHASE1_WORLD_OPERATION_TURNS,
    mergeRequestInspectorEvidence,
    validatePhase1LiveScenario,
} from '../e2e/live/phase1-v4-scenario.js';

describe('Phase 1 real-model acceptance scenario', () => {
    test('locks every hard-gate action into a deterministic 50-turn manifest', () => {
        expect(validatePhase1LiveScenario()).toEqual([]);
        expect(PHASE1_LIVE_TURNS).toHaveLength(PHASE1_LIVE_TURN_COUNT);
        expect(PHASE1_KEYWORD_TURNS.length).toBeGreaterThanOrEqual(5);
        expect(PHASE1_WORLD_OPERATION_TURNS.length).toBeGreaterThanOrEqual(5);
        expect(PHASE1_EDIT_TURNS.length).toBeGreaterThanOrEqual(2);
        expect(PHASE1_SWIPE_TURNS.length).toBeGreaterThanOrEqual(3);
        expect(PHASE1_BRANCH_TURN).toBeGreaterThan(0);
        expect(PHASE1_RESTART_TURN).toBeGreaterThan(PHASE1_BRANCH_TURN);
        expect(PHASE1_INVALID_OPERATION_TURN).toBeGreaterThan(PHASE1_RESTART_TURN);
        expect(PHASE1_LIVE_FACTS).toHaveLength(3);
        expect(PHASE1_LIVE_FACTS.every(fact => fact.recallTurn - fact.introducedTurn >= 30)).toBe(true);
    });

    test('merges request-inspector windows across restart without double-counting ids', () => {
        const merged = mergeRequestInspectorEvidence([
            {
                phase: 'before-restart',
                evidence: {
                    total: 35,
                    relevant: 35,
                    completed: 34,
                    failed: 0,
                    invalidAttemptObserved: false,
                    worldBookLayerObserved: true,
                    secretLeakObserved: false,
                    requests: [
                        { id: 'before-only', status: 'success' },
                        { id: 'overlap', status: 'running' },
                    ],
                },
            },
            {
                phase: 'after-restart',
                evidence: {
                    total: 35,
                    relevant: 35,
                    completed: 29,
                    failed: 5,
                    invalidAttemptObserved: true,
                    worldBookLayerObserved: true,
                    secretLeakObserved: false,
                    requests: [
                        { id: 'overlap', status: 'success' },
                        { id: 'after-only', status: 'error' },
                    ],
                },
            },
        ]);
        expect(merged.total).toBe(70);
        expect(merged.relevant).toBe(3);
        expect(merged.completed).toBe(2);
        expect(merged.failed).toBe(1);
        expect(merged.invalidAttemptObserved).toBe(true);
        expect(merged.worldBookLayerObserved).toBe(true);
        expect(merged.secretLeakObserved).toBe(false);
        expect(merged.requests.find(request => request.id === 'overlap')).toMatchObject({
            status: 'success',
            phase: 'after-restart',
        });
    });
});
