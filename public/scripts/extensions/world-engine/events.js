// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

import { applyWorldStateOperations } from './operations.js';
import {
    cloneJsonValue,
    isPlainObject,
    normalizeWorldState,
} from './schema.js';

export const WORLD_OPERATION_VERSION = 1;
export const WORLD_EVENT_VERSION = 1;
export const WORLD_EVENT_NAMESPACE = 'worldEngine';
export const WORLD_OPERATION_TYPES = Object.freeze([
    'advance_time',
    'move_actor',
    'set_flag',
    'unset_flag',
    'give_item',
    'remove_item',
    'transfer_item',
    'adjust_relationship',
    'create_task',
    'update_task',
    'complete_task',
    'set_extension_value',
]);

const TYPE_SET = new Set(WORLD_OPERATION_TYPES);
const SAFE_ID = /^[\p{L}\p{N}_.:@/-]{1,160}$/u;
const SAFE_KEY = /^[^~/]{1,160}$/u;
const MAX_BATCH = 32;
const MAX_EVENTS = 5000;
const DEFAULT_EXTENSION_NAMESPACES = Object.freeze(['world', 'worldPack', 'mod']);

function sortJson(value) {
    if (Array.isArray(value)) {
        return value.map(sortJson);
    }
    if (!isPlainObject(value)) {
        return value;
    }
    const out = {};
    for (const key of Object.keys(value).sort()) {
        out[key] = sortJson(value[key]);
    }
    return out;
}

function getHashableState(value) {
    const state = normalizeWorldState(value);
    delete state.meta;
    if (isPlainObject(state.extensions?.[WORLD_EVENT_NAMESPACE])) {
        delete state.extensions[WORLD_EVENT_NAMESPACE];
    }
    return sortJson(state);
}

export function canonicalizeWorldState(value) {
    return JSON.stringify(getHashableState(value));
}

export async function hashWorldState(value) {
    const bytes = new TextEncoder().encode(canonicalizeWorldState(value));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function encodePointerSegment(value) {
    return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

function assertSafeId(value, field) {
    const id = String(value || '').trim();
    if (!SAFE_ID.test(id) || id.includes('__proto__') || id.includes('constructor') || id.includes('prototype')) {
        throw new Error(`${field} is missing or unsafe.`);
    }
    return id;
}

function assertSafeKey(value, field) {
    const key = String(value || '').trim();
    if (!SAFE_KEY.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) {
        throw new Error(`${field} is missing or unsafe.`);
    }
    return key;
}

function assertArgs(value) {
    if (!isPlainObject(value)) {
        throw new Error('args must be an object.');
    }
    return cloneJsonValue(value);
}

export function validateWorldOperationEnvelopes(rawOperations) {
    if (!Array.isArray(rawOperations) || rawOperations.length < 1 || rawOperations.length > MAX_BATCH) {
        return { ok: false, operations: [], errors: [`worldOperations must contain 1-${MAX_BATCH} entries.`] };
    }
    const operations = [];
    const errors = [];
    const operationIds = new Set();
    const idempotencyKeys = new Set();
    rawOperations.forEach((raw, index) => {
        try {
            if (!isPlainObject(raw)) {
                throw new Error('operation must be an object.');
            }
            const allowed = new Set(['version', 'operationId', 'idempotencyKey', 'expectedStateHash', 'type', 'args', 'reason']);
            const unknown = Object.keys(raw).filter(key => !allowed.has(key));
            if (unknown.length > 0) {
                throw new Error(`unknown fields: ${unknown.join(', ')}.`);
            }
            const version = Number(raw.version ?? WORLD_OPERATION_VERSION);
            if (version !== WORLD_OPERATION_VERSION) {
                throw new Error(`unsupported version: ${version}.`);
            }
            const operationId = assertSafeId(raw.operationId, 'operationId');
            const idempotencyKey = assertSafeId(raw.idempotencyKey, 'idempotencyKey');
            if (operationIds.has(operationId)) {
                throw new Error(`duplicate operationId: ${operationId}.`);
            }
            if (idempotencyKeys.has(idempotencyKey)) {
                throw new Error(`duplicate idempotencyKey: ${idempotencyKey}.`);
            }
            const expectedStateHash = String(raw.expectedStateHash || '').trim().toLowerCase();
            if (!/^[a-f0-9]{64}$/u.test(expectedStateHash)) {
                throw new Error('expectedStateHash must be a SHA-256 hex digest.');
            }
            const type = String(raw.type || '').trim();
            if (!TYPE_SET.has(type)) {
                throw new Error(`unsupported type: ${type || '(empty)'}.`);
            }
            const args = assertArgs(raw.args);
            const operation = { version, operationId, idempotencyKey, expectedStateHash, type, args };
            if (raw.reason !== undefined) {
                operation.reason = String(raw.reason).slice(0, 500);
            }
            operationIds.add(operationId);
            idempotencyKeys.add(idempotencyKey);
            operations.push(operation);
        } catch (error) {
            errors.push(`world operation #${index}: ${String(error?.message || error)}`);
        }
    });
    return errors.length > 0
        ? { ok: false, operations: [], errors }
        : { ok: true, operations, errors: [] };
}

function getQuantity(entry) {
    if (Number.isFinite(entry)) {
        return { quantity: Number(entry), key: null };
    }
    if (!isPlainObject(entry)) {
        return { quantity: entry === undefined ? 0 : 1, key: null };
    }
    const key = Object.hasOwn(entry, '数量') ? '数量' : 'quantity';
    const raw = Object.hasOwn(entry, key) ? entry[key] : 1;
    return { quantity: Number(raw), key };
}

function itemWithQuantity(existing, quantity, template) {
    if (isPlainObject(existing) || isPlainObject(template)) {
        const base = isPlainObject(existing) ? cloneJsonValue(existing) : cloneJsonValue(template || {});
        const key = Object.hasOwn(base, '数量') ? '数量' : 'quantity';
        base[key] = quantity;
        return base;
    }
    return quantity;
}

function normalizeActorSlot(state, value, field = 'actor') {
    const raw = String(value || '').trim();
    const folded = raw.toLocaleLowerCase().replace(/[\s_-]+/gu, '');
    const playerName = String(state?.player?.name || '').trim().toLocaleLowerCase();
    const npcName = String(state?.npc?.name || '').trim().toLocaleLowerCase();
    const playerAliases = new Set(['player', 'user', '玩家', '主角', '玩家角色', '当前玩家', '當前玩家']);
    const npcAliases = new Set(['npc', 'currentnpc', '当前npc', '當前npc', '当前角色', '當前角色', '随行npc', '隨行npc']);

    if (playerAliases.has(folded) || (playerName && raw.toLocaleLowerCase() === playerName)) {
        return 'player';
    }
    if (npcAliases.has(folded) || (npcName && raw.toLocaleLowerCase() === npcName)) {
        return 'npc';
    }
    throw new Error(`${field} must identify player or npc.`);
}

function getInventoryPath(target, itemId) {
    if (!['player', 'npc'].includes(target)) {
        throw new Error('item target must be player or npc.');
    }
    return `/${target}/inventory/${encodePointerSegment(itemId)}`;
}

function compileGiveItem(state, args) {
    const target = normalizeActorSlot(state, args.target || 'player', 'item target');
    const itemId = assertSafeKey(args.itemId, 'itemId');
    const quantity = Number(args.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) {
        throw new Error('quantity must be a positive integer.');
    }
    const existing = state[target]?.inventory?.[itemId];
    const current = getQuantity(existing).quantity;
    if (!Number.isFinite(current) || current < 0) {
        throw new Error(`inventory quantity is invalid for ${itemId}.`);
    }
    return [{
        op: 'set',
        path: getInventoryPath(target, itemId),
        value: itemWithQuantity(existing, current + quantity, args.item),
    }];
}

function compileRemoveItem(state, args) {
    const target = normalizeActorSlot(state, args.target || 'player', 'item target');
    const itemId = assertSafeKey(args.itemId, 'itemId');
    const quantity = Number(args.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) {
        throw new Error('quantity must be a positive integer.');
    }
    const existing = state[target]?.inventory?.[itemId];
    if (existing === undefined) {
        throw new Error(`${target} does not own item ${itemId}.`);
    }
    const current = getQuantity(existing).quantity;
    if (!Number.isFinite(current) || current < quantity) {
        throw new Error(`insufficient quantity for item ${itemId}.`);
    }
    const path = getInventoryPath(target, itemId);
    return current === quantity
        ? [{ op: 'remove', path }]
        : [{ op: 'set', path, value: itemWithQuantity(existing, current - quantity) }];
}

function compileMoveActor(state, args) {
    const actor = normalizeActorSlot(state, args.actor, 'actor');
    const location = String(args.location || '').trim();
    if (!location || location.length > 500) {
        throw new Error('location is missing or too long.');
    }
    const operations = [{ op: 'set', path: `/${actor}/location`, value: location }];
    if (actor === 'player') {
        operations.push({ op: 'set', path: '/location/current', value: location });
        if (!state.location.known.includes(location)) {
            operations.push({ op: 'append', path: '/location/known', value: location });
        }
    }
    const playerLocation = actor === 'player' ? location : state.player.location;
    const npcLocation = actor === 'npc' ? location : state.npc.location;
    const presentCharacters = playerLocation && playerLocation === npcLocation && state.npc.name
        ? [state.npc.name]
        : [];
    operations.push({ op: 'set', path: '/location/presentCharacters', value: presentCharacters });
    return operations;
}

function compileWorldOperation(state, operation, options) {
    const args = operation.args;
    switch (operation.type) {
        case 'advance_time': {
            const turns = Number(args.turns ?? 1);
            if (!Number.isInteger(turns) || turns < 0 || turns > 10_000) {
                throw new Error('turns must be an integer between 0 and 10000.');
            }
            const out = turns > 0 ? [{ op: 'increment', path: '/clock/turn', value: turns }] : [];
            if (args.label !== undefined) out.push({ op: 'set', path: '/clock/label', value: String(args.label) });
            if (args.iso !== undefined) out.push({ op: 'set', path: '/clock/iso', value: args.iso === null ? null : String(args.iso) });
            if (out.length === 0) throw new Error('advance_time would not change state.');
            return out;
        }
        case 'move_actor':
            return compileMoveActor(state, args);
        case 'set_flag': {
            const key = assertSafeKey(args.key, 'flag key');
            if (!Object.hasOwn(args, 'value')) throw new Error('set_flag requires value.');
            return [{ op: 'set', path: `/flags/${encodePointerSegment(key)}`, value: args.value }];
        }
        case 'unset_flag': {
            const key = assertSafeKey(args.key, 'flag key');
            if (!Object.hasOwn(state.flags, key)) throw new Error(`flag ${key} does not exist.`);
            return [{ op: 'remove', path: `/flags/${encodePointerSegment(key)}` }];
        }
        case 'give_item':
            return compileGiveItem(state, args);
        case 'remove_item':
            return compileRemoveItem(state, args);
        case 'transfer_item': {
            const from = normalizeActorSlot(state, args.from || 'player', 'transfer source');
            const to = normalizeActorSlot(state, args.to || 'npc', 'transfer destination');
            if (from === to) throw new Error('transfer endpoints must differ.');
            return [
                ...compileRemoveItem(state, { ...args, target: from }),
                ...compileGiveItem(state, { ...args, target: to }),
            ];
        }
        case 'adjust_relationship': {
            const name = assertSafeKey(args.character || state.npc.name, 'relationship character');
            const path = `/relationships/${encodePointerSegment(name)}`;
            const out = [];
            if (Object.hasOwn(args, 'delta')) {
                const delta = Number(args.delta);
                if (!Number.isFinite(delta) || Math.abs(delta) > 1000) throw new Error('relationship delta is invalid.');
                out.push({ op: 'increment', path: `${path}/score`, value: delta });
            }
            if (Object.hasOwn(args, 'note')) {
                const note = String(args.note || '').trim();
                if (!note || note.length > 1000) throw new Error('relationship note is missing or too long.');
                out.push({ op: 'set', path: `${path}/note`, value: note });
            }
            if (out.length === 0) throw new Error('adjust_relationship requires delta and/or note.');
            return out;
        }
        case 'create_task': {
            const taskId = assertSafeKey(args.taskId, 'taskId');
            if (Object.hasOwn(state.tasks, taskId)) throw new Error(`task ${taskId} already exists.`);
            const task = isPlainObject(args.task) ? args.task : {};
            return [{ op: 'set', path: `/tasks/${encodePointerSegment(taskId)}`, value: { ...cloneJsonValue(task), status: task.status || 'active' } }];
        }
        case 'update_task': {
            const taskId = assertSafeKey(args.taskId, 'taskId');
            if (!Object.hasOwn(state.tasks, taskId)) throw new Error(`task ${taskId} does not exist.`);
            if (!isPlainObject(args.patch)) throw new Error('update_task patch must be an object.');
            return [{ op: 'merge', path: `/tasks/${encodePointerSegment(taskId)}`, value: args.patch }];
        }
        case 'complete_task': {
            const taskId = assertSafeKey(args.taskId, 'taskId');
            if (!Object.hasOwn(state.tasks, taskId)) throw new Error(`task ${taskId} does not exist.`);
            return [{ op: 'merge', path: `/tasks/${encodePointerSegment(taskId)}`, value: { status: 'completed', completedTurn: state.clock.turn } }];
        }
        case 'set_extension_value': {
            const namespace = assertSafeKey(args.namespace, 'extension namespace');
            const allowedNamespaces = new Set(options.allowedExtensionNamespaces || DEFAULT_EXTENSION_NAMESPACES);
            if (!allowedNamespaces.has(namespace)) {
                throw new Error(`extension namespace ${namespace} is not declared.`);
            }
            const rawPath = String(args.path || '').trim();
            if (rawPath && (!rawPath.startsWith('/') || rawPath.includes('__proto__'))) {
                throw new Error('extension path must be an empty path or a safe JSON pointer.');
            }
            if (!Object.hasOwn(args, 'value')) throw new Error('set_extension_value requires value.');
            return [{ op: 'set', path: `/extensions/${encodePointerSegment(namespace)}${rawPath}`, value: args.value }];
        }
        default:
            throw new Error(`unsupported world operation type: ${operation.type}.`);
    }
}

function getEventLedger(state) {
    const internal = state.extensions?.[WORLD_EVENT_NAMESPACE];
    return Array.isArray(internal?.events) ? internal.events : [];
}

export async function executeWorldOperationBatch(currentState, rawOperations, options = {}) {
    const validation = validateWorldOperationEnvelopes(rawOperations);
    const original = normalizeWorldState(currentState);
    if (!validation.ok) {
        return { ok: false, state: original, events: [], duplicateOperationIds: [], errors: validation.errors };
    }
    const existingEvents = getEventLedger(original);
    const existingKeys = new Set(existingEvents.map(event => event.idempotencyKey));
    const duplicates = validation.operations.filter(operation => existingKeys.has(operation.idempotencyKey));
    const pending = validation.operations.filter(operation => !existingKeys.has(operation.idempotencyKey));
    if (pending.length === 0) {
        return {
            ok: true,
            state: original,
            events: [],
            duplicateOperationIds: duplicates.map(operation => operation.operationId),
            errors: [],
        };
    }
    const initialHash = await hashWorldState(original);

    let next = normalizeWorldState(original);
    const events = [];
    try {
        for (const operation of pending) {
            const beforeHash = await hashWorldState(next);
            // A single atomic batch may use one hash for every operation, or
            // chained hashes when the model makes more than one tool call in
            // the same generation. Both stay conflict-safe: every operation
            // must match either the batch base or its exact immediate base.
            if (operation.expectedStateHash !== initialHash && operation.expectedStateHash !== beforeHash) {
                throw new Error(`operation ${operation.operationId}: expectedStateHash conflict.`);
            }
            const compiled = compileWorldOperation(next, operation, options);
            const applied = applyWorldStateOperations(next, compiled);
            if (!applied.ok) throw new Error(applied.errors.join('; '));
            next = applied.state;
            const afterHash = await hashWorldState(next);
            events.push({
                version: WORLD_EVENT_VERSION,
                eventId: `event:${operation.operationId}`,
                operationId: operation.operationId,
                idempotencyKey: operation.idempotencyKey,
                operation: cloneJsonValue(operation),
                beforeStateHash: beforeHash,
                afterStateHash: afterHash,
                chatId: String(options.chatId || ''),
                messageId: Number.isInteger(options.messageId) ? options.messageId : null,
                floorId: Number.isInteger(options.floorId) ? options.floorId : null,
                swipeId: Number.isInteger(options.swipeId) ? options.swipeId : null,
                createdAt: String(options.createdAt || new Date().toISOString()),
            });
        }
    } catch (error) {
        return {
            ok: false,
            state: original,
            events: [],
            duplicateOperationIds: duplicates.map(operation => operation.operationId),
            errors: [String(error?.message || error)],
        };
    }

    const combinedEvents = [...existingEvents, ...events];
    if (combinedEvents.length > MAX_EVENTS) {
        return { ok: false, state: original, events: [], duplicateOperationIds: [], errors: [`World event ledger exceeds ${MAX_EVENTS} events.`] };
    }
    next.extensions[WORLD_EVENT_NAMESPACE] = {
        ...(isPlainObject(next.extensions[WORLD_EVENT_NAMESPACE]) ? next.extensions[WORLD_EVENT_NAMESPACE] : {}),
        version: WORLD_EVENT_VERSION,
        events: combinedEvents,
        currentStateHash: events.at(-1).afterStateHash,
    };
    return {
        ok: true,
        state: next,
        events,
        duplicateOperationIds: duplicates.map(operation => operation.operationId),
        errors: [],
    };
}

export async function replayWorldEvents(seedState, events, options = {}) {
    let state = normalizeWorldState(seedState);
    state.extensions[WORLD_EVENT_NAMESPACE] = { version: WORLD_EVENT_VERSION, events: [] };
    for (const event of events || []) {
        if (!isPlainObject(event?.operation)) {
            return { ok: false, state, error: `event ${event?.eventId || '(unknown)'} has no operation.` };
        }
        const beforeHash = await hashWorldState(state);
        if (beforeHash !== event.beforeStateHash) {
            return { ok: false, state, error: `event ${event.eventId}: before-state hash mismatch.` };
        }
        const operation = { ...cloneJsonValue(event.operation), expectedStateHash: beforeHash };
        const replayed = await executeWorldOperationBatch(state, [operation], {
            ...options,
            chatId: event.chatId,
            messageId: event.messageId,
            floorId: event.floorId,
            swipeId: event.swipeId,
            createdAt: event.createdAt,
        });
        if (!replayed.ok) {
            return { ok: false, state, error: `event ${event.eventId}: ${replayed.errors.join('; ')}` };
        }
        const afterHash = await hashWorldState(replayed.state);
        if (afterHash !== event.afterStateHash) {
            return { ok: false, state, error: `event ${event.eventId}: after-state hash mismatch.` };
        }
        state = replayed.state;
    }
    return { ok: true, state, stateHash: await hashWorldState(state), error: null };
}
