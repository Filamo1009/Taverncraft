// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

export const WORLD_STATE_SCHEMA_VERSION = 1;
export const WORLD_STATE_NAMESPACE = 'world_engine';

export const WORLD_STATE_ROOTS = Object.freeze([
    'clock',
    'location',
    'player',
    'npc',
    'items',
    'relationships',
    'tasks',
    'flags',
    'extensions',
]);

const BLOCKED_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype === null || prototype === Object.prototype) {
        return true;
    }
    // JSON objects can cross iframe / VM / plugin realms. Their
    // Object.prototype is not reference-equal to this realm's prototype, but
    // it is still the terminal prototype (its own prototype is null). Class
    // instances and crafted intermediate prototype chains remain rejected.
    return Object.getPrototypeOf(prototype) === null;
}

export function cloneJsonValue(value, depth = 0) {
    if (depth > 32) {
        throw new Error('World state exceeds the maximum nesting depth.');
    }
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error('World state numbers must be finite.');
        }
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(item => cloneJsonValue(item, depth + 1));
    }
    if (!isPlainObject(value)) {
        throw new Error('World state values must be JSON-compatible.');
    }
    const result = {};
    for (const [key, item] of Object.entries(value)) {
        if (BLOCKED_OBJECT_KEYS.has(key)) {
            throw new Error(`Unsafe world state key: ${key}`);
        }
        result[key] = cloneJsonValue(item, depth + 1);
    }
    return result;
}

export function createEmptyWorldState(seed = {}) {
    const safeSeed = isPlainObject(seed) ? seed : {};
    return {
        schemaVersion: WORLD_STATE_SCHEMA_VERSION,
        clock: {
            turn: 0,
            label: '',
            iso: null,
            ...(isPlainObject(safeSeed.clock) ? cloneJsonValue(safeSeed.clock) : {}),
        },
        location: {
            current: '',
            region: '',
            area: '',
            known: [],
            presentCharacters: [],
            ...(isPlainObject(safeSeed.location) ? cloneJsonValue(safeSeed.location) : {}),
        },
        player: {
            id: 'player',
            name: '',
            location: '',
            status: {},
            inventory: {},
            ...(isPlainObject(safeSeed.player) ? cloneJsonValue(safeSeed.player) : {}),
        },
        npc: {
            id: 'npc',
            name: '',
            location: '',
            status: {},
            inventory: {},
            knowledge: { facts: [] },
            ...(isPlainObject(safeSeed.npc) ? cloneJsonValue(safeSeed.npc) : {}),
        },
        items: isPlainObject(safeSeed.items) ? cloneJsonValue(safeSeed.items) : {},
        relationships: isPlainObject(safeSeed.relationships) ? cloneJsonValue(safeSeed.relationships) : {},
        tasks: isPlainObject(safeSeed.tasks) ? cloneJsonValue(safeSeed.tasks) : {},
        flags: isPlainObject(safeSeed.flags) ? cloneJsonValue(safeSeed.flags) : {},
        extensions: isPlainObject(safeSeed.extensions) ? cloneJsonValue(safeSeed.extensions) : {},
        meta: {
            initialized: false,
            source: 'empty',
            ...(isPlainObject(safeSeed.meta) ? cloneJsonValue(safeSeed.meta) : {}),
        },
    };
}

export function normalizeWorldState(value) {
    if (!isPlainObject(value)) {
        return createEmptyWorldState();
    }
    const state = createEmptyWorldState(value);
    state.schemaVersion = WORLD_STATE_SCHEMA_VERSION;
    return state;
}

export function isWorldStateInitialized(value) {
    return Boolean(value && typeof value === 'object' && value.meta?.initialized);
}

export function cloneWorldState(value) {
    return cloneJsonValue(normalizeWorldState(value));
}

export function getPromptWorldState(value) {
    const state = normalizeWorldState(value);
    const extensionSummary = {};
    for (const [namespace, data] of Object.entries(state.extensions)) {
        if (namespace === 'stLegacy' || namespace === 'worldEngine') {
            continue;
        }
        extensionSummary[namespace] = data;
    }
    return {
        schemaVersion: state.schemaVersion,
        clock: state.clock,
        location: state.location,
        player: state.player,
        npc: state.npc,
        items: state.items,
        relationships: state.relationships,
        tasks: state.tasks,
        flags: state.flags,
        extensions: extensionSummary,
    };
}
