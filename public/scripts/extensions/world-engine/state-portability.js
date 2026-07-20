// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

import { cloneJsonValue, isPlainObject, normalizeWorldState } from './schema.js';

export const WORLD_STATE_EXPORT_SCHEMA = 'world-engine-state-backup-v1';

function cleanText(value, maxLength = 512) {
    return String(value ?? '').slice(0, maxLength);
}

export function buildLocationList(value) {
    const state = normalizeWorldState(value);
    const names = [];
    const add = (name) => {
        const normalized = cleanText(name, 1024).trim();
        if (normalized && !names.includes(normalized)) names.push(normalized);
    };
    add(state.location.current);
    for (const name of Array.isArray(state.location.known) ? state.location.known : []) add(name);
    add(state.player.location);
    add(state.npc.location);

    return names.map(name => ({
        name,
        current: name === String(state.location.current || '').trim(),
        actors: [
            String(state.player.location || '').trim() === name ? 'player' : '',
            String(state.npc.location || '').trim() === name ? 'npc' : '',
        ].filter(Boolean),
    }));
}

export function createWorldStateExport({ state, stateHash = '', source = {} } = {}) {
    const safeState = normalizeWorldState(cloneJsonValue(state));
    const safeSource = isPlainObject(source) ? source : {};
    return {
        schema: WORLD_STATE_EXPORT_SCHEMA,
        version: 1,
        exportedAt: new Date().toISOString(),
        stateHash: cleanText(stateHash, 64).toLowerCase(),
        source: {
            chatId: cleanText(safeSource.chatId),
            characterName: cleanText(safeSource.characterName, 256),
        },
        state: safeState,
    };
}

export function parseWorldStateExport(input) {
    let parsed = input;
    if (typeof input === 'string') {
        try {
            parsed = JSON.parse(input);
        } catch (error) {
            return { ok: false, error: `Invalid JSON: ${String(error?.message || error)}` };
        }
    }
    if (!isPlainObject(parsed) || parsed.schema !== WORLD_STATE_EXPORT_SCHEMA || Number(parsed.version) !== 1) {
        return { ok: false, error: `Expected ${WORLD_STATE_EXPORT_SCHEMA}.` };
    }
    if (!isPlainObject(parsed.state)) {
        return { ok: false, error: 'The backup does not contain a world state object.' };
    }
    const stateHash = cleanText(parsed.stateHash, 64).toLowerCase();
    if (stateHash && !/^[a-f0-9]{64}$/.test(stateHash)) {
        return { ok: false, error: 'The backup state hash is invalid.' };
    }
    try {
        const state = normalizeWorldState(cloneJsonValue(parsed.state));
        return { ok: true, value: { state, stateHash } };
    } catch (error) {
        return { ok: false, error: String(error?.message || error) };
    }
}
