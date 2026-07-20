// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

import {
    WORLD_STATE_ROOTS,
    cloneJsonValue,
    cloneWorldState,
    isPlainObject,
    normalizeWorldState,
} from './schema.js';

export const WORLD_STATE_UPDATE_TAG = 'world_state_update';
export const WORLD_STATE_OPERATION_TYPES = Object.freeze(['set', 'increment', 'append', 'remove', 'merge']);

const ALLOWED_ROOTS = new Set(WORLD_STATE_ROOTS);
const BLOCKED_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_OPERATIONS = 64;
const MAX_PATH_LENGTH = 512;
const MAX_PATH_DEPTH = 16;
const MAX_OPERATION_BYTES = 64 * 1024;

function decodePointerSegment(segment) {
    if (/~(?![01])/u.test(segment)) {
        throw new Error('JSON pointer contains an invalid escape.');
    }
    return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

export function parseWorldStatePath(path) {
    const raw = String(path ?? '');
    if (!raw.startsWith('/') || raw.length < 2 || raw.length > MAX_PATH_LENGTH) {
        throw new Error('Operation path must be a non-empty JSON pointer.');
    }
    const segments = raw.slice(1).split('/').map(decodePointerSegment);
    if (segments.length > MAX_PATH_DEPTH || segments.some(segment => !segment || BLOCKED_SEGMENTS.has(segment))) {
        throw new Error('Operation path is unsafe or too deeply nested.');
    }
    if (!ALLOWED_ROOTS.has(segments[0])) {
        throw new Error(`Operation root /${segments[0]} is not part of the world-state schema.`);
    }
    return segments;
}

function assertJsonValue(value) {
    let encoded;
    try {
        encoded = JSON.stringify(value);
    } catch {
        throw new Error('Operation value must be JSON-compatible.');
    }
    if (encoded === undefined || encoded.length > MAX_OPERATION_BYTES) {
        throw new Error('Operation value is missing or too large.');
    }
    if (encoded.includes('__proto__') || encoded.includes('"constructor"') || encoded.includes('"prototype"')) {
        const walk = (item) => {
            if (Array.isArray(item)) {
                item.forEach(walk);
                return;
            }
            if (!isPlainObject(item)) {
                return;
            }
            for (const [key, child] of Object.entries(item)) {
                if (BLOCKED_SEGMENTS.has(key)) {
                    throw new Error(`Unsafe operation value key: ${key}`);
                }
                walk(child);
            }
        };
        walk(value);
    }
}

export function validateWorldStateOperations(rawOperations) {
    if (!Array.isArray(rawOperations)) {
        return { ok: false, operations: [], errors: ['operations must be an array.'] };
    }
    if (rawOperations.length === 0 || rawOperations.length > MAX_OPERATIONS) {
        return { ok: false, operations: [], errors: [`operations must contain 1-${MAX_OPERATIONS} entries.`] };
    }

    const operations = [];
    const errors = [];
    rawOperations.forEach((rawOperation, index) => {
        try {
            if (!isPlainObject(rawOperation)) {
                throw new Error('operation must be an object.');
            }
            const op = String(rawOperation.op || '').trim().toLowerCase();
            if (!WORLD_STATE_OPERATION_TYPES.includes(op)) {
                throw new Error(`unsupported op: ${op || '(empty)'}.`);
            }
            const path = String(rawOperation.path || '');
            parseWorldStatePath(path);
            const operation = { op, path };
            if (op !== 'remove') {
                if (!Object.hasOwn(rawOperation, 'value')) {
                    throw new Error(`${op} requires value.`);
                }
                assertJsonValue(rawOperation.value);
                operation.value = cloneJsonValue(rawOperation.value);
            }
            if (op === 'increment' && (!Number.isFinite(operation.value))) {
                throw new Error('increment value must be a finite number.');
            }
            if (op === 'merge' && !isPlainObject(operation.value)) {
                throw new Error('merge value must be an object.');
            }
            operations.push(operation);
        } catch (error) {
            errors.push(`operation #${index}: ${String(error?.message || error)}`);
        }
    });
    return errors.length > 0
        ? { ok: false, operations: [], errors }
        : { ok: true, operations, errors: [] };
}

function resolveParent(root, segments, createMissing) {
    let cursor = root;
    for (let index = 0; index < segments.length - 1; index++) {
        const segment = segments[index];
        const nextSegment = segments[index + 1];
        if (Array.isArray(cursor)) {
            const arrayIndex = Number(segment);
            if (!Number.isInteger(arrayIndex) || arrayIndex < 0 || arrayIndex >= cursor.length) {
                throw new Error(`Array index out of range: ${segment}`);
            }
            cursor = cursor[arrayIndex];
            continue;
        }
        if (!isPlainObject(cursor)) {
            throw new Error(`Path segment is not an object: ${segment}`);
        }
        if (!Object.hasOwn(cursor, segment)) {
            if (!createMissing) {
                return null;
            }
            cursor[segment] = /^\d+$/u.test(nextSegment) ? [] : {};
        }
        cursor = cursor[segment];
    }
    return { parent: cursor, key: segments.at(-1) };
}

function getExistingValue(parent, key) {
    if (Array.isArray(parent)) {
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= parent.length) {
            return { exists: false, value: undefined, index };
        }
        return { exists: true, value: parent[index], index };
    }
    if (!isPlainObject(parent)) {
        throw new Error('Operation parent is not an object or array.');
    }
    return { exists: Object.hasOwn(parent, key), value: parent[key], index: null };
}

function writeValue(parent, key, value) {
    if (Array.isArray(parent)) {
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index > parent.length) {
            throw new Error(`Array index out of range: ${key}`);
        }
        if (index === parent.length) {
            parent.push(value);
        } else {
            parent[index] = value;
        }
        return;
    }
    if (!isPlainObject(parent)) {
        throw new Error('Operation parent is not an object or array.');
    }
    parent[key] = value;
}

function deepMerge(target, incoming) {
    const result = isPlainObject(target) ? cloneJsonValue(target) : {};
    for (const [key, value] of Object.entries(incoming)) {
        if (BLOCKED_SEGMENTS.has(key)) {
            throw new Error(`Unsafe merge key: ${key}`);
        }
        result[key] = isPlainObject(value) && isPlainObject(result[key])
            ? deepMerge(result[key], value)
            : cloneJsonValue(value);
    }
    return result;
}

function applyOneOperation(state, operation) {
    const segments = parseWorldStatePath(operation.path);
    const resolved = resolveParent(state, segments, operation.op !== 'remove');
    if (!resolved) {
        return;
    }
    const { parent, key } = resolved;
    const current = getExistingValue(parent, key);

    switch (operation.op) {
        case 'set':
            writeValue(parent, key, cloneJsonValue(operation.value));
            break;
        case 'increment': {
            const base = current.exists ? current.value : 0;
            if (!Number.isFinite(base)) {
                throw new Error(`increment target is not numeric: ${operation.path}`);
            }
            const next = base + operation.value;
            if (!Number.isFinite(next)) {
                throw new Error(`increment result is not finite: ${operation.path}`);
            }
            writeValue(parent, key, next);
            break;
        }
        case 'append': {
            const array = current.exists ? current.value : [];
            if (!Array.isArray(array)) {
                throw new Error(`append target is not an array: ${operation.path}`);
            }
            if (array.length >= 2000) {
                throw new Error(`append target reached its 2000-item limit: ${operation.path}`);
            }
            const next = cloneJsonValue(array);
            next.push(cloneJsonValue(operation.value));
            writeValue(parent, key, next);
            break;
        }
        case 'merge':
            writeValue(parent, key, deepMerge(current.value, operation.value));
            break;
        case 'remove':
            if (!current.exists) {
                break;
            }
            if (Array.isArray(parent)) {
                parent.splice(current.index, 1);
            } else {
                delete parent[key];
            }
            break;
        default:
            throw new Error(`Unsupported operation: ${operation.op}`);
    }
}

export function applyWorldStateOperations(currentState, rawOperations) {
    const validation = validateWorldStateOperations(rawOperations);
    if (!validation.ok) {
        return { ok: false, state: normalizeWorldState(currentState), applied: 0, errors: validation.errors };
    }
    const nextState = cloneWorldState(currentState);
    try {
        for (const operation of validation.operations) {
            applyOneOperation(nextState, operation);
        }
        nextState.clock.turn = Math.max(0, Math.floor(Number(nextState.clock.turn) || 0));
        return { ok: true, state: normalizeWorldState(nextState), applied: validation.operations.length, errors: [] };
    } catch (error) {
        return { ok: false, state: normalizeWorldState(currentState), applied: 0, errors: [String(error?.message || error)] };
    }
}

export function parseTaggedWorldStateUpdate(text) {
    const source = String(text ?? '');
    const open = `<${WORLD_STATE_UPDATE_TAG}>`;
    const close = `</${WORLD_STATE_UPDATE_TAG}>`;
    const openMatches = source.split(open).length - 1;
    const closeMatches = source.split(close).length - 1;
    if (openMatches === 0 && closeMatches === 0) {
        return { found: false, ok: true, operations: [], payload: null, cleanText: source, errors: [] };
    }
    if (openMatches !== 1 || closeMatches !== 1) {
        return { found: true, ok: false, operations: [], payload: null, cleanText: source, errors: ['Exactly one complete world_state_update block is allowed.'] };
    }
    const start = source.indexOf(open);
    const end = source.indexOf(close, start + open.length);
    if (end < start) {
        return { found: true, ok: false, operations: [], payload: null, cleanText: source, errors: ['world_state_update tags are out of order.'] };
    }
    const rawJson = source.slice(start + open.length, end).trim();
    if (!rawJson || rawJson.startsWith('```')) {
        return { found: true, ok: false, operations: [], payload: null, cleanText: source, errors: ['world_state_update must contain raw JSON, not Markdown.'] };
    }
    let payload;
    try {
        payload = JSON.parse(rawJson);
    } catch (error) {
        return { found: true, ok: false, operations: [], payload: null, cleanText: source, errors: [`Invalid world_state_update JSON: ${String(error?.message || error)}`] };
    }
    if (!isPlainObject(payload)) {
        return { found: true, ok: false, operations: [], payload: null, cleanText: source, errors: ['world_state_update payload must be an object.'] };
    }
    const allowedKeys = new Set(['operations', 'worldOperations', 'reason', 'schemaVersion']);
    const unknownKeys = Object.keys(payload).filter(key => !allowedKeys.has(key));
    if (unknownKeys.length > 0) {
        return { found: true, ok: false, operations: [], payload, cleanText: source, errors: [`Unknown world_state_update fields: ${unknownKeys.join(', ')}`] };
    }
    const hasLegacyOperations = Object.hasOwn(payload, 'operations');
    const hasWorldOperations = Object.hasOwn(payload, 'worldOperations');
    if (hasLegacyOperations === hasWorldOperations) {
        return { found: true, ok: false, operations: [], worldOperations: [], payload, cleanText: source, errors: ['Provide exactly one of operations or worldOperations.'] };
    }
    const cleanText = `${source.slice(0, start)}${source.slice(end + close.length)}`.trim();
    if (hasWorldOperations) {
        if (!Array.isArray(payload.worldOperations) || payload.worldOperations.length < 1 || payload.worldOperations.length > 32) {
            return { found: true, ok: false, operations: [], worldOperations: [], payload, cleanText: source, errors: ['worldOperations must contain 1-32 entries.'] };
        }
        return {
            found: true,
            ok: true,
            mode: 'world-v1',
            operations: [],
            worldOperations: cloneJsonValue(payload.worldOperations),
            payload,
            cleanText,
            errors: [],
        };
    }
    const validation = validateWorldStateOperations(payload.operations);
    return validation.ok
        ? { found: true, ok: true, mode: 'legacy-path', operations: validation.operations, worldOperations: [], payload, cleanText, errors: [] }
        : { found: true, ok: false, operations: [], worldOperations: [], payload, cleanText: source, errors: validation.errors };
}

export function buildTaggedFallbackExample(expectedStateHash = '0'.repeat(64)) {
    return `<${WORLD_STATE_UPDATE_TAG}>{"worldOperations":[{"version":1,"operationId":"turn-id-op-1","idempotencyKey":"chat-id:floor:swipe:1","expectedStateHash":"${expectedStateHash}","type":"move_actor","args":{"actor":"player","location":"new location"},"reason":"The player moved in the resolved scene."}]}</${WORLD_STATE_UPDATE_TAG}>`;
}
