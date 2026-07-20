// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

import { registerManagedRegexProvider, regex_placement, substitute_find_regex } from '../regex/engine.js';
import { findActiveLegacyInitvarCandidate, importLegacyInitvar, inferSeedNpcName } from './legacy-st.js';
import {
    applyWorldStateOperations,
    parseTaggedWorldStateUpdate,
    validateWorldStateOperations,
} from './operations.js';
import {
    WORLD_OPERATION_TYPES,
    executeWorldOperationBatch,
    hashWorldState,
    validateWorldOperationEnvelopes,
} from './events.js';
import { buildWorldStatePrompt, DEFAULT_POST_HISTORY_PROMPT } from './prompt.js';
import {
    createPostHistoryExport,
    estimatePostHistoryTokens,
    normalizePostHistoryOverride,
    parsePostHistoryExport,
    resolvePostHistoryConfiguration,
} from './post-history.js';
import {
    buildExactMemoryRecallPrompt,
    syncExplicitMemoriesToMemoryGraph,
    syncWorldEventsToMemoryGraph,
} from './memory-bridge.js';
import { createDryRunReport } from './dry-run-report.js';
import { getWorldStateApplyToolChoice } from './tool-choice.js';
import {
    WORLD_STATE_NAMESPACE,
    createEmptyWorldState,
    isPlainObject,
    isWorldStateInitialized,
    normalizeWorldState,
} from './schema.js';
import {
    buildLocationList,
    createWorldStateExport,
    parseWorldStateExport,
} from './state-portability.js';

const MODULE_NAME = WORLD_STATE_NAMESPACE;
const UI_BLOCK_ID = 'world_engine_settings';
const STATE_PROMPT_KEY = 'world_engine_authoritative_state';
const POST_HISTORY_PROMPT_KEY = 'world_engine_post_history';
const EXACT_MEMORY_PROMPT_KEY = 'world_engine_exact_memory_recall';
const FALLBACK_REGEX_PROVIDER_ID = 'world_engine_tag_filter';
const FALLBACK_REGEX_SCRIPT_ID = 'world_engine_hide_state_update';
const FLOOR_LOG_NAMESPACE = `${WORLD_STATE_NAMESPACE}__floor_log`;
const TOOL_NAMES = Object.freeze({
    READ: 'world_state_read',
    APPLY: 'world_state_apply',
});

const defaultSettings = Object.freeze({
    enabled: true,
    injectState: true,
    nativeTools: true,
    taggedFallback: true,
    autoImportLegacyInitvar: true,
    autoEnableMemoryGraph: false,
    memoryGraphConfigured: false,
    allowedExtensionNamespaces: ['world', 'worldPack', 'mod'],
    postHistoryEnabled: false,
    postHistoryPrompt: DEFAULT_POST_HISTORY_PROMPT,
    postHistoryGlobal: { mode: 'off', prompt: DEFAULT_POST_HISTORY_PROMPT },
});

let floorState = null;
let initQueue = Promise.resolve();
let pendingToolOperations = [];
let pendingWorldOperations = [];
let pendingToolAdvanceTurn = true;
let generationActive = false;
let fallbackRegexProvider = null;
let lastDryRunReport = null;
let lastCommitDiagnostic = null;
const pendingLifecycle = [];

function recordPendingLifecycle(entry) {
    pendingLifecycle.push({ at: Date.now(), ...entry });
    if (pendingLifecycle.length > 50) pendingLifecycle.splice(0, pendingLifecycle.length - 50);
}

function getContext() {
    return Taverncraft.getContext();
}

function ensureSettings() {
    const context = getContext();
    const root = context.extensionSettings;
    const hadSettings = Boolean(root[MODULE_NAME] && typeof root[MODULE_NAME] === 'object');
    const hadStructuredPostHistory = hadSettings && Object.hasOwn(root[MODULE_NAME], 'postHistoryGlobal');
    if (!root[MODULE_NAME] || typeof root[MODULE_NAME] !== 'object') {
        root[MODULE_NAME] = structuredClone(defaultSettings);
    }
    const settings = root[MODULE_NAME];
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (!Object.hasOwn(settings, key)) {
            settings[key] = typeof value === 'object' ? structuredClone(value) : value;
        }
    }
    if (!hadStructuredPostHistory) {
        settings.postHistoryGlobal = normalizePostHistoryOverride({
            enabled: hadSettings ? settings.postHistoryEnabled : false,
            prompt: settings.postHistoryPrompt,
        }, { fallbackMode: 'off' });
    } else {
        settings.postHistoryGlobal = normalizePostHistoryOverride(settings.postHistoryGlobal, { fallbackMode: 'off' });
    }
    return settings;
}

function cloneRecord(value) {
    if (!isPlainObject(value)) {
        return {};
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return { ...value };
    }
}

function getActiveCharacter(context) {
    const id = Number(context.characterId);
    return Number.isInteger(id) ? context.characters?.[id] || null : null;
}

function readPostHistoryContext() {
    const context = getContext();
    const settings = ensureSettings();
    const character = getActiveCharacter(context);
    const presetSnapshot = context.presets.getLive();
    const presetRef = presetSnapshot?.ref || context.presets.getSelected();
    const presetExtensions = presetSnapshot?.body?.extensions;
    const characterExtensions = character?.data?.extensions?.[MODULE_NAME];
    const chatExtensions = context.chatMetadata?.[MODULE_NAME];
    const scopes = {
        global: {
            label: '全局默认',
            id: 'global',
            available: true,
            configuration: normalizePostHistoryOverride(settings.postHistoryGlobal, { fallbackMode: 'off' }),
        },
        model: {
            label: presetRef?.name ? `模型预设 · ${presetRef.name}` : '模型预设 · 未选择',
            id: presetRef ? `${presetRef.collection}:${presetRef.name}` : '',
            available: Boolean(presetRef),
            target: presetRef || null,
            configuration: normalizePostHistoryOverride(presetExtensions?.[MODULE_NAME]?.postHistory),
        },
        character: {
            label: character ? `角色卡 · ${character.name || character.avatar}` : '角色卡 · 未选择',
            id: String(character?.avatar || ''),
            available: Boolean(character),
            target: character || null,
            configuration: normalizePostHistoryOverride(characterExtensions?.postHistory),
        },
        chat: {
            label: context.chatId ? `当前聊天 · ${context.chatId}` : '当前聊天 · 未打开',
            id: String(context.chatId || ''),
            available: Boolean(context.chatId),
            configuration: normalizePostHistoryOverride(chatExtensions?.postHistory),
        },
    };
    return {
        context,
        scopes,
        effective: resolvePostHistoryConfiguration(scopes),
    };
}

async function writePostHistoryScope(scope, configuration) {
    const normalized = normalizePostHistoryOverride(configuration);
    const snapshot = readPostHistoryContext();
    const { context, scopes } = snapshot;

    if (scope === 'global') {
        const settings = ensureSettings();
        settings.postHistoryGlobal = normalized;
        // Keep the original two fields synchronized for extensions or old
        // settings pages that still read the pre-scope contract.
        settings.postHistoryEnabled = ['example', 'custom'].includes(normalized.mode);
        settings.postHistoryPrompt = normalized.mode === 'example'
            ? DEFAULT_POST_HISTORY_PROMPT
            : normalized.prompt;
        context.saveSettingsDebounced();
        return { ok: true };
    }

    if (scope === 'model') {
        if (!scopes.model.available || !scopes.model.target) {
            return { ok: false, error: '当前没有可写入的模型预设。' };
        }
        const written = await context.presets.writeExtensions(
            scopes.model.target,
            `${MODULE_NAME}.postHistory`,
            normalized,
        );
        return written ? { ok: true } : { ok: false, error: '模型预设不支持扩展字段写入。' };
    }

    if (scope === 'character') {
        const characterId = Number(context.characterId);
        const character = scopes.character.target;
        if (!Number.isInteger(characterId) || !character) {
            return { ok: false, error: '当前没有可写入的角色卡。' };
        }
        const existing = cloneRecord(character?.data?.extensions?.[MODULE_NAME]);
        const written = await context.writeExtensionField(characterId, MODULE_NAME, {
            ...existing,
            postHistory: normalized,
        });
        return written ? { ok: true } : { ok: false, error: '角色卡扩展字段保存失败。' };
    }

    if (scope === 'chat') {
        if (!scopes.chat.available) {
            return { ok: false, error: '请先打开一个角色聊天。' };
        }
        const existing = cloneRecord(context.chatMetadata?.[MODULE_NAME]);
        context.chatMetadata[MODULE_NAME] = {
            ...existing,
            postHistory: normalized,
        };
        await context.saveMetadata();
        return { ok: true };
    }

    return { ok: false, error: '未知的 Post-History 作用域。' };
}

async function getFloorState() {
    if (!floorState) {
        floorState = await getContext().createFloorState({ namespace: WORLD_STATE_NAMESPACE });
    }
    return floorState;
}

function getCurrentCharacterName(context) {
    const id = Number(context.characterId);
    return String(context.characters?.[id]?.name || context.name2 || '').trim();
}

function buildCharacterSeed(context) {
    const characterId = Number(context.characterId);
    const character = context.characters?.[characterId];
    return createEmptyWorldState({
        player: { name: String(context.name1 || '').trim() },
        npc: { name: inferSeedNpcName(character, getCurrentCharacterName(context)) },
        meta: { initialized: true, source: 'character-card' },
    });
}

async function initializeStateForCurrentChat(options = {}) {
    const force = Boolean(options.force);
    const context = getContext();
    if (!context.chatId || !Array.isArray(context.chat) || context.chat.length === 0) {
        return { ok: false, reason: 'NO_CHAT', state: null };
    }
    const fs = await getFloorState();
    if (force) {
        const resetResult = await fs.reset([]);
        if (!resetResult?.ok) {
            return resetResult;
        }
    } else {
        const existing = await fs.get();
        if (existing?.ok && isWorldStateInitialized(existing.state)) {
            return { ok: true, state: normalizeWorldState(existing.state), initialized: false };
        }
    }

    const settings = ensureSettings();
    let floor = 0;
    let seed = null;
    if (settings.autoImportLegacyInitvar) {
        const candidate = findActiveLegacyInitvarCandidate(context.chat);
        if (candidate) {
            const imported = importLegacyInitvar(
                candidate.text,
                source => context.lib.yaml.parse(source, { maxAliasCount: 0, prettyErrors: true }),
                { playerName: context.name1, npcName: getCurrentCharacterName(context) },
            );
            if (imported.ok) {
                floor = candidate.floor;
                seed = imported.state;
            } else {
                console.warn(`[${MODULE_NAME}] Failed to import ST initvar`, imported.error);
            }
        }
    }
    seed ??= buildCharacterSeed(context);
    const result = await fs.update(() => seed, { floor });
    if (!result?.ok) {
        return result;
    }
    return { ok: true, state: seed, initialized: true };
}

function queueInitialization(options = {}) {
    const run = async () => initializeStateForCurrentChat(options);
    initQueue = initQueue.then(run, run);
    return initQueue;
}

async function readWorldState(options = {}) {
    if (options.initialize !== false) {
        await queueInitialization();
    }
    const fs = await getFloorState();
    const result = await fs.get();
    if (!result?.ok) {
        return result;
    }
    const state = normalizeWorldState(result.state);
    return { ok: true, state, stateHash: await hashWorldState(state) };
}

function advanceTurnIfNeeded(state, operations, advanceTurn) {
    if (!advanceTurn || operations.some(operation => operation.path === '/clock/turn')) {
        return state;
    }
    state.clock.turn = Math.max(0, Math.floor(Number(state.clock.turn) || 0)) + 1;
    return state;
}

async function commitOperations(operations, options = {}) {
    const validation = validateWorldStateOperations(operations);
    if (!validation.ok) {
        return { ok: false, applied: 0, errors: validation.errors };
    }
    const context = getContext();
    if (!Array.isArray(context.chat) || context.chat.length === 0) {
        return { ok: false, applied: 0, errors: ['No active chat message can anchor the state update.'] };
    }
    await queueInitialization();
    const fs = await getFloorState();
    const floor = Number.isInteger(options.floor) ? options.floor : context.chat.length - 1;
    let nextSnapshot = null;
    let applyError = null;
    const result = await fs.update((current) => {
        const applied = applyWorldStateOperations(current, validation.operations);
        if (!applied.ok) {
            applyError = applied.errors;
            throw new Error(applied.errors.join('; '));
        }
        const next = advanceTurnIfNeeded(applied.state, validation.operations, options.advanceTurn !== false);
        next.meta = {
            ...(isPlainObject(next.meta) ? next.meta : {}),
            initialized: true,
            source: String(options.source || 'world-state-operation'),
            updatedAt: new Date().toISOString(),
            updatedFloor: floor,
        };
        nextSnapshot = next;
        return next;
    }, { floor });
    if (!result?.ok) {
        return { ok: false, applied: 0, errors: applyError || [result?.hint || result?.reason || 'State update failed.'] };
    }
    await refreshPrompt(nextSnapshot);
    await refreshStateEditor(nextSnapshot);
    return { ok: true, applied: validation.operations.length, state: nextSnapshot, errors: [] };
}

async function commitWorldOperations(worldOperations, options = {}) {
    const validation = validateWorldOperationEnvelopes(worldOperations);
    if (!validation.ok) {
        return { ok: false, applied: 0, events: [], errors: validation.errors };
    }
    const context = getContext();
    if (!Array.isArray(context.chat) || context.chat.length === 0) {
        return { ok: false, applied: 0, events: [], errors: ['No active chat message can anchor the world event.'] };
    }
    await queueInitialization();
    const fs = await getFloorState();
    const floor = Number.isInteger(options.floor) ? options.floor : context.chat.length - 1;
    const swipeId = Number.isInteger(context.chat[floor]?.swipe_id) ? context.chat[floor].swipe_id : 0;
    let execution = null;
    const result = await fs.update(async (current) => {
        execution = await executeWorldOperationBatch(current, validation.operations, {
            chatId: context.chatId,
            messageId: floor,
            floorId: floor,
            swipeId,
            allowedExtensionNamespaces: ensureSettings().allowedExtensionNamespaces,
        });
        if (!execution.ok) {
            throw new Error(execution.errors.join('; '));
        }
        execution.state.meta = {
            ...(isPlainObject(execution.state.meta) ? execution.state.meta : {}),
            initialized: true,
            source: String(options.source || 'world-operation-v1'),
            updatedAt: new Date().toISOString(),
            updatedFloor: floor,
        };
        return execution.state;
    }, { floor, swipeId });
    if (!result?.ok || !execution?.ok) {
        return {
            ok: false,
            applied: 0,
            events: [],
            errors: execution?.errors || [result?.hint || result?.reason || 'WorldOperationV1 commit failed.'],
        };
    }
    try {
        const memorySync = await syncWorldEventsToMemoryGraph(context, execution.events, execution.state);
        if (memorySync.ok && memorySync.memoryNodeId) {
            const operationIds = new Set(execution.events.map(event => event.operationId));
            const linkResult = await fs.update((current) => {
                const next = structuredClone(current);
                const ledger = next.extensions?.worldEngine?.events;
                if (!Array.isArray(ledger)) return next;
                for (const event of ledger) {
                    if (operationIds.has(event.operationId)) {
                        event.memoryNodeId = memorySync.memoryNodeId;
                    }
                }
                return next;
            }, { floor, swipeId });
            if (!linkResult?.ok) {
                console.warn(`[${MODULE_NAME}] World event memory reference persist failed`, linkResult);
            } else {
                const refreshed = await fs.get();
                if (refreshed?.ok && refreshed.state) execution.state = normalizeWorldState(refreshed.state);
            }
        }
    } catch (error) {
        // The authoritative state/event commit already succeeded. Preserve it
        // and leave the source-rich event available for later reconciliation.
        console.warn(`[${MODULE_NAME}] Memory Graph world-event sync failed`, error);
    }
    await refreshPrompt(execution.state);
    await refreshStateEditor(execution.state);
    return {
        ok: true,
        applied: execution.events.length,
        events: execution.events,
        duplicateOperationIds: execution.duplicateOperationIds,
        state: execution.state,
        stateHash: await hashWorldState(execution.state),
        errors: [],
    };
}

async function getPreviewStateWithPending() {
    const current = await readWorldState();
    if (!current.ok) {
        return current;
    }
    if (pendingWorldOperations.length > 0) {
        const context = getContext();
        const preview = await executeWorldOperationBatch(current.state, pendingWorldOperations, {
            chatId: context.chatId,
            messageId: context.chat.length,
            floorId: context.chat.length,
            swipeId: 0,
            allowedExtensionNamespaces: ensureSettings().allowedExtensionNamespaces,
            createdAt: 'preview',
        });
        return preview.ok
            ? { ok: true, state: preview.state, stateHash: await hashWorldState(preview.state), stagedWorldOperations: pendingWorldOperations.length }
            : { ok: false, state: current.state, stateHash: current.stateHash, errors: preview.errors };
    }
    if (pendingToolOperations.length === 0) {
        return current;
    }
    const applied = applyWorldStateOperations(current.state, pendingToolOperations);
    if (!applied.ok) {
        return { ok: false, state: current.state, errors: applied.errors };
    }
    return {
        ok: true,
        state: advanceTurnIfNeeded(applied.state, pendingToolOperations, pendingToolAdvanceTurn),
        stagedOperations: pendingToolOperations.length,
    };
}

function clearPendingToolOperations(reason = 'unspecified') {
    recordPendingLifecycle({
        event: 'clear',
        reason,
        worldOperations: pendingWorldOperations.length,
        operations: pendingToolOperations.length,
    });
    pendingToolOperations = [];
    pendingWorldOperations = [];
    pendingToolAdvanceTurn = true;
}

async function stageWorldOperations(args = {}) {
    const validation = validateWorldOperationEnvelopes(args.worldOperations);
    if (!validation.ok) {
        return { ok: false, staged: 0, errors: validation.errors };
    }
    const current = await readWorldState();
    if (!current.ok) {
        return current;
    }
    const context = getContext();
    const combined = [...pendingWorldOperations, ...validation.operations];
    const preview = await executeWorldOperationBatch(current.state, combined, {
        chatId: context.chatId,
        messageId: context.chat.length,
        floorId: context.chat.length,
        swipeId: 0,
        allowedExtensionNamespaces: ensureSettings().allowedExtensionNamespaces,
        createdAt: 'preview',
    });
    if (!preview.ok) {
        return { ok: false, staged: 0, errors: preview.errors, stateHash: current.stateHash };
    }
    pendingWorldOperations = combined;
    recordPendingLifecycle({
        event: 'stage-world-operations',
        worldOperations: pendingWorldOperations.length,
        operations: pendingToolOperations.length,
    });
    return {
        ok: true,
        staged: validation.operations.length,
        totalStaged: pendingWorldOperations.length,
        preview: preview.state,
        previewStateHash: await hashWorldState(preview.state),
        note: generationActive
            ? 'Validated and staged. The atomic WorldOperationV1 batch will commit on the assistant message floor.'
            : 'Validated and staged for the next assistant message.',
    };
}

async function stageToolOperations(args = {}) {
    const validation = validateWorldStateOperations(args.operations);
    if (!validation.ok) {
        return { ok: false, staged: 0, errors: validation.errors };
    }
    const previewBase = await getPreviewStateWithPending();
    if (!previewBase.ok) {
        return previewBase;
    }
    const preview = applyWorldStateOperations(previewBase.state, validation.operations);
    if (!preview.ok) {
        return { ok: false, staged: 0, errors: preview.errors };
    }
    pendingToolOperations.push(...validation.operations);
    pendingToolAdvanceTurn = pendingToolAdvanceTurn && args.advanceTurn !== false;
    return {
        ok: true,
        staged: validation.operations.length,
        totalStaged: pendingToolOperations.length,
        preview: advanceTurnIfNeeded(preview.state, pendingToolOperations, pendingToolAdvanceTurn),
        note: generationActive
            ? 'Validated and staged. The update will commit on the assistant message floor.'
            : 'Validated and staged for the next assistant message.',
    };
}

function registerFunctionTools(context) {
    Object.values(TOOL_NAMES).forEach(name => context.unregisterFunctionTool(name));
    const shouldRegister = async () => {
        const settings = ensureSettings();
        return Boolean(settings.enabled && settings.nativeTools && context.groupId == null);
    };
    const getToolChoice = data => getWorldStateApplyToolChoice(data, TOOL_NAMES.APPLY);
    context.registerFunctionTool({
        name: TOOL_NAMES.APPLY,
        displayName: 'Apply World State',
        description: 'Validate and atomically stage durable WorldOperationV1 changes. Use the exact hash in authoritative_world_state_hash. You must call this before the final response whenever the turn establishes a persistent change; do not call when no durable change occurred. Use adjust_relationship for relationship notes; never write core state through set_extension_value.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['worldOperations'],
            properties: {
                worldOperations: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 32,
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['version', 'operationId', 'idempotencyKey', 'expectedStateHash', 'type', 'args'],
                        properties: {
                            version: { type: 'integer', enum: [1] },
                            operationId: { type: 'string', description: 'Unique stable id for this operation.' },
                            idempotencyKey: { type: 'string', description: 'Unique chat/floor/swipe-scoped retry key.' },
                            expectedStateHash: { type: 'string', description: 'Exact 64-character SHA-256 digest from authoritative_world_state_hash.' },
                            type: { type: 'string', enum: WORLD_OPERATION_TYPES },
                            args: {
                                type: 'object',
                                description: 'Arguments by type: give_item {target:"player|npc",itemId,quantity,item?}; move_actor {actor:"player|npc",location}; adjust_relationship {character,delta?,note?} (required for relationship notes); create_task {taskId,task}; update_task {taskId,patch}; complete_task {taskId}; set_flag {key,value}; unset_flag {key}; advance_time {turns,label?,iso?}; set_extension_value {namespace,path,value} (declared mod data only, never stLegacy/worldEngine or core state). Actor/target/from/to slots must use the literal reserved value "player" or "npc", never a character name.',
                                additionalProperties: true,
                            },
                            reason: { type: 'string', description: 'Short factual reason grounded in the resolved scene.' },
                        },
                    },
                },
            },
        },
        shouldRegister,
        getToolChoice,
        action: async args => await stageWorldOperations(args),
        formatMessage: () => 'Update authoritative world state',
    });
}

function syncFallbackRegex() {
    const settings = ensureSettings();
    if (!fallbackRegexProvider) {
        fallbackRegexProvider = registerManagedRegexProvider(FALLBACK_REGEX_PROVIDER_ID);
    }
    if (!settings.enabled || !settings.taggedFallback) {
        fallbackRegexProvider?.clearScripts();
        return;
    }
    fallbackRegexProvider?.setScripts([{
        id: FALLBACK_REGEX_SCRIPT_ID,
        scriptName: 'Hide World State Update Protocol',
        findRegex: '/<world_state_update>[\\s\\S]*?<\\/world_state_update>/gi',
        replaceString: '',
        trimStrings: [],
        placement: [regex_placement.AI_OUTPUT],
        disabled: false,
        markdownOnly: false,
        promptOnly: false,
        runOnEdit: true,
        substituteRegex: substitute_find_regex.NONE,
        minDepth: null,
        maxDepth: null,
    }]);
}

function clearPrompts() {
    const context = getContext();
    const promptTypes = context.constants.promptTypes;
    const promptRoles = context.constants.promptRoles;
    context.setExtensionPrompt(STATE_PROMPT_KEY, '', promptTypes.NONE, 0, false, promptRoles.SYSTEM);
    context.setExtensionPrompt(POST_HISTORY_PROMPT_KEY, '', promptTypes.NONE, 0, false, promptRoles.SYSTEM);
    context.setExtensionPrompt(EXACT_MEMORY_PROMPT_KEY, '', promptTypes.NONE, 0, false, promptRoles.SYSTEM);
}

async function refreshPrompt(knownState = null) {
    const context = getContext();
    const settings = ensureSettings();
    if (!settings.enabled || context.groupId != null) {
        clearPrompts();
        return;
    }
    const promptTypes = context.constants.promptTypes;
    const promptRoles = context.constants.promptRoles;
    let state = knownState;
    let stateHash = null;
    if (!state) {
        const result = await readWorldState();
        state = result.ok ? result.state : createEmptyWorldState();
        stateHash = result.ok ? result.stateHash : null;
    }
    stateHash ??= await hashWorldState(state);
    const postHistory = readPostHistoryContext().effective;
    context.setExtensionPrompt(
        STATE_PROMPT_KEY,
        settings.injectState ? buildWorldStatePrompt(state, { ...settings, currentStateHash: stateHash }) : '',
        promptTypes.IN_CHAT,
        1,
        false,
        promptRoles.SYSTEM,
    );
    context.setExtensionPrompt(
        POST_HISTORY_PROMPT_KEY,
        postHistory.enabled ? postHistory.prompt.trim() : '',
        promptTypes.IN_CHAT,
        0,
        false,
        promptRoles.SYSTEM,
    );
    context.setExtensionPrompt(
        EXACT_MEMORY_PROMPT_KEY,
        await buildExactMemoryRecallPrompt(context),
        promptTypes.IN_CHAT,
        0,
        false,
        promptRoles.SYSTEM,
    );
    const postHistoryEntry = context.extensionPrompts?.[POST_HISTORY_PROMPT_KEY];
    if (postHistoryEntry) {
        postHistoryEntry.diagnostics = {
            sourceScope: postHistory.sourceScope,
            sourceLabel: postHistory.sourceLabel,
            configurationMode: postHistory.mode,
        };
    }
    refreshPostHistoryUi({ preserveEditor: true });
}

async function stripCommittedTagFromMessage(context, messageId, parsed) {
    if (!parsed.found || !parsed.ok || parsed.cleanText === String(context.chat?.[messageId]?.mes || '')) {
        return;
    }
    const message = context.chat[messageId];
    const patch = { mes: parsed.cleanText };
    if (Array.isArray(message?.swipes)) {
        const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
        const swipes = message.swipes.slice();
        if (swipeId >= 0 && swipeId < swipes.length) {
            swipes[swipeId] = parsed.cleanText;
            patch.swipes = swipes;
        }
    }
    await context.updateMessages({ index: messageId, patch }, { silent: true });
}

async function commitAssistantStateUpdate(messageId, options = {}) {
    const context = getContext();
    const message = context.chat?.[messageId];
    if (!message || message.is_user) {
        return;
    }
    const settings = ensureSettings();
    const parsed = settings.taggedFallback
        ? parseTaggedWorldStateUpdate(message.mes)
        : { found: false, ok: true, operations: [], worldOperations: [], cleanText: message.mes, errors: [] };
    if (parsed.found && !parsed.ok) {
        console.warn(`[${MODULE_NAME}] Rejected tagged state update`, parsed.errors);
    }
    const hasNativeWorldOperations = pendingWorldOperations.length > 0;
    const hasNativeOperations = !hasNativeWorldOperations && pendingToolOperations.length > 0;
    const worldOperations = hasNativeWorldOperations
        ? pendingWorldOperations.slice()
        : (parsed.ok ? (parsed.worldOperations || []) : []);
    const operations = hasNativeOperations
        ? pendingToolOperations.slice()
        : (parsed.ok ? parsed.operations : []);
    const advanceTurn = hasNativeOperations ? pendingToolAdvanceTurn : true;
    lastCommitDiagnostic = {
        messageId: Number(messageId),
        status: 'received',
        nativeWorldOperations: hasNativeWorldOperations ? worldOperations.length : 0,
        nativeOperations: hasNativeOperations ? operations.length : 0,
        taggedWorldOperations: !hasNativeWorldOperations ? worldOperations.length : 0,
        taggedOperations: !hasNativeOperations ? operations.length : 0,
        errors: parsed.found && !parsed.ok ? parsed.errors.map(error => String(error).slice(0, 300)).slice(0, 5) : [],
    };
    recordPendingLifecycle({ event: 'message-received', messageId: Number(messageId) });
    clearPendingToolOperations('message-received');
    if (worldOperations.length > 0) {
        const result = await commitWorldOperations(worldOperations, {
            floor: Number(messageId),
            source: hasNativeWorldOperations ? 'native-world-operation-v1' : (options.source || 'tagged-world-operation-v1'),
        });
        if (!result.ok) {
            lastCommitDiagnostic.status = 'rejected';
            lastCommitDiagnostic.errors = (result.errors || []).map(error => String(error).slice(0, 300)).slice(0, 5);
            console.warn(`[${MODULE_NAME}] Failed to commit WorldOperationV1 update`, result.errors);
            return;
        }
        lastCommitDiagnostic.status = 'committed';
        lastCommitDiagnostic.applied = Number(result.applied || 0);
    } else if (operations.length > 0) {
        const result = await commitOperations(operations, {
            floor: Number(messageId),
            advanceTurn,
            source: hasNativeOperations ? 'native-tool' : (options.source || 'tagged-fallback'),
        });
        if (!result.ok) {
            lastCommitDiagnostic.status = 'rejected';
            lastCommitDiagnostic.errors = (result.errors || []).map(error => String(error).slice(0, 300)).slice(0, 5);
            console.warn(`[${MODULE_NAME}] Failed to commit assistant state update`, result.errors);
            return;
        }
        lastCommitDiagnostic.status = 'committed';
        lastCommitDiagnostic.applied = Number(result.applied || 0);
    } else {
        lastCommitDiagnostic.status = parsed.found && !parsed.ok ? 'rejected' : 'no-op';
    }
    if (parsed.found && parsed.ok) {
        await stripCommittedTagFromMessage(context, Number(messageId), parsed);
    }
}

async function rollbackFromEditedFloor(messageId) {
    const floor = Number(messageId);
    if (!Number.isInteger(floor) || floor < 0) {
        return;
    }
    const context = getContext();
    const raw = await context.getChatState(FLOOR_LOG_NAMESPACE);
    const commits = raw?.ok && Array.isArray(raw.state?.commits) ? raw.state.commits : [];
    const survivors = commits.filter(commit => Number(commit?.floor) < floor);
    const fs = await getFloorState();
    const result = await fs.reset(survivors);
    if (!result?.ok) {
        console.warn(`[${MODULE_NAME}] Failed to rollback state after message edit`, result);
        return;
    }
    await commitAssistantStateUpdate(floor, { source: 'edited-tagged-fallback' });
    await refreshPrompt();
    await refreshStateEditor();
}

async function saveEditorState() {
    const raw = String(jQuery('#world_engine_state_json').val() || '').trim();
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        toastr.error(`Invalid JSON: ${String(error?.message || error)}`, 'World Engine');
        return;
    }
    if (!isPlainObject(parsed)) {
        toastr.error('World state must be a JSON object.', 'World Engine');
        return;
    }
    const context = getContext();
    if (!Array.isArray(context.chat) || context.chat.length === 0) {
        toastr.error('Open a character chat before saving world state.', 'World Engine');
        return;
    }
    const normalized = normalizeWorldState(parsed);
    normalized.meta = {
        ...(isPlainObject(normalized.meta) ? normalized.meta : {}),
        initialized: true,
        source: 'manual-editor',
        updatedAt: new Date().toISOString(),
        updatedFloor: context.chat.length - 1,
    };
    const fs = await getFloorState();
    const result = await fs.update(() => normalized);
    if (!result?.ok) {
        toastr.error(result?.hint || 'Failed to save world state.', 'World Engine');
        return;
    }
    await refreshPrompt(normalized);
    await refreshStateEditor(normalized);
    toastr.success('Authoritative world state saved.', 'World Engine');
}

function downloadJsonPayload(fileName, payload) {
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

async function exportWorldState() {
    const context = getContext();
    const result = await readWorldState();
    if (!result.ok) {
        toastr.error(result?.hint || result?.reason || '世界状态读取失败。', 'World Engine');
        return;
    }
    const payload = createWorldStateExport({
        state: result.state,
        stateHash: result.stateHash,
        source: {
            chatId: context.chatId,
            characterName: getCurrentCharacterName(context),
        },
    });
    downloadJsonPayload('world-engine-state-backup.json', payload);
}

async function importWorldStateFile(file) {
    if (!file) {
        return;
    }
    if (Number(file.size) > 5_000_000) {
        toastr.error('世界状态备份超过 5 MB 限制。', 'World Engine');
        return;
    }
    const parsed = parseWorldStateExport(await file.text());
    if (!parsed.ok) {
        toastr.error(parsed.error, 'World Engine');
        return;
    }
    const context = getContext();
    if (!context.chatId || !Array.isArray(context.chat) || context.chat.length === 0) {
        toastr.error('请先打开一个角色聊天。', 'World Engine');
        return;
    }
    const actualHash = await hashWorldState(parsed.value.state);
    if (parsed.value.stateHash && parsed.value.stateHash !== actualHash) {
        toastr.error('备份内容与记录的状态哈希不一致，已拒绝导入。', 'World Engine');
        return;
    }
    const imported = normalizeWorldState(parsed.value.state);
    imported.meta = {
        ...(isPlainObject(imported.meta) ? imported.meta : {}),
        initialized: true,
        source: 'state-backup-import',
        importedAt: new Date().toISOString(),
        updatedFloor: context.chat.length - 1,
    };
    const fs = await getFloorState();
    const result = await fs.update(() => imported, { floor: context.chat.length - 1 });
    if (!result?.ok) {
        toastr.error(result?.hint || result?.reason || '世界状态导入失败。', 'World Engine');
        return;
    }
    await refreshPrompt(imported);
    await refreshStateEditor(imported);
    toastr.success('世界状态备份已校验并导入当前聊天。', 'World Engine');
}

async function runLocalPromptInspection() {
    const context = getContext();
    const status = jQuery('#world_engine_dry_run_status');
    if (!context.chatId || !Array.isArray(context.chat) || context.chat.length === 0) {
        toastr.error('请先打开一个角色聊天。', 'World Engine');
        return null;
    }
    status.text('正在本地拼装提示词与扫描世界书；不会调用模型……');
    let worldInfo = null;
    let generationData = null;
    const worldInfoEvent = context.eventTypes.GENERATION_WORLD_INFO_FINALIZED;
    const generationDataEvent = context.eventTypes.GENERATE_AFTER_DATA;
    const onWorldInfo = payload => { worldInfo = payload; };
    const onGenerationData = payload => { generationData = payload; };
    context.eventSource.once(worldInfoEvent, onWorldInfo);
    context.eventSource.once(generationDataEvent, onGenerationData);
    try {
        await context.generate('normal', {}, true);
        const stateResult = await readWorldState();
        lastDryRunReport = createDryRunReport({
            worldInfo,
            generationData,
            state: stateResult.ok ? stateResult.state : null,
        });
        jQuery('#world_engine_dry_run_result').val(JSON.stringify(lastDryRunReport, null, 2));
        status.text([
            `世界书 ${lastDryRunReport.worldBook.totalCount} 层`,
            `Prompt ${lastDryRunReport.prompt.charLength.toLocaleString()} 字符`,
            lastDryRunReport.prompt.previewTruncated ? '预览已截断' : '预览完整',
            lastDryRunReport.worldBook.loadError ? `世界书错误：${lastDryRunReport.worldBook.loadError}` : '',
            '未调用模型',
        ].filter(Boolean).join(' · '));
        toastr.success('本地上下文检查完成，未发送任何模型请求。', 'World Engine');
        return lastDryRunReport;
    } catch (error) {
        console.error(`[${MODULE_NAME}] Local prompt inspection failed`, error);
        status.text(`检查失败：${String(error?.message || error)}`);
        toastr.error(String(error?.message || error), 'World Engine');
        return null;
    } finally {
        context.eventSource.removeListener(worldInfoEvent, onWorldInfo);
        context.eventSource.removeListener(generationDataEvent, onGenerationData);
        generationActive = false;
    }
}

function refreshLocationList(state) {
    const list = jQuery('#world_engine_location_list');
    if (!list.length) {
        return;
    }
    list.empty();
    const locations = buildLocationList(state);
    if (!locations.length) {
        list.append(jQuery('<small>').text('尚无已知地点。'));
        return;
    }
    for (const location of locations) {
        const row = jQuery('<div>').addClass('world_engine_location_row');
        row.append(jQuery('<span>').addClass('world_engine_location_name').text(location.name));
        if (location.current) {
            row.append(jQuery('<span>').addClass('world_engine_location_badge').text('当前场景'));
        }
        for (const actor of location.actors) {
            row.append(jQuery('<span>').addClass('world_engine_location_badge').text(actor === 'player' ? '玩家' : 'NPC'));
        }
        list.append(row);
    }
}

async function refreshStateEditor(knownState = null) {
    const editor = jQuery('#world_engine_state_json');
    if (!editor.length) {
        return;
    }
    let state = knownState;
    if (!state) {
        const result = await readWorldState();
        state = result.ok ? result.state : createEmptyWorldState();
    }
    editor.val(JSON.stringify(state, null, 2));
    refreshLocationList(state);
    jQuery('#world_engine_state_summary').text([
        `Turn ${state.clock?.turn ?? 0}`,
        state.clock?.label || 'time unset',
        state.location?.current || 'location unset',
        state.npc?.name || 'NPC unset',
    ].join(' · '));
}

function getPostHistoryUiScope() {
    const value = String(jQuery('#world_engine_post_history_scope').val() || 'global');
    return ['global', 'model', 'character', 'chat'].includes(value) ? value : 'global';
}

function getPostHistoryUiConfiguration() {
    return normalizePostHistoryOverride({
        mode: String(jQuery('#world_engine_post_history_mode').val() || 'inherit'),
        prompt: String(jQuery('#world_engine_post_history_prompt').val() || ''),
    });
}

function refreshPostHistoryUi({ preserveEditor = false } = {}) {
    const root = jQuery(`#${UI_BLOCK_ID}`);
    if (!root.length || !root.find('#world_engine_post_history_scope').length) {
        return;
    }
    const snapshot = readPostHistoryContext();
    const scope = getPostHistoryUiScope();
    const selected = snapshot.scopes[scope];

    for (const scopeName of ['global', 'model', 'character', 'chat']) {
        const entry = snapshot.scopes[scopeName];
        const option = root.find(`#world_engine_post_history_scope option[value="${scopeName}"]`);
        option.text(entry.label);
        option.prop('disabled', !entry.available);
    }

    if (!preserveEditor) {
        root.find('#world_engine_post_history_mode').val(selected.configuration.mode);
        const editablePrompt = selected.configuration.mode === 'example'
            ? DEFAULT_POST_HISTORY_PROMPT
            : selected.configuration.prompt;
        root.find('#world_engine_post_history_prompt').val(editablePrompt);
    }

    const effective = snapshot.effective;
    const tokenEstimate = estimatePostHistoryTokens(effective.prompt);
    const chain = ['global', 'model', 'character', 'chat']
        .map(name => `${name}: ${snapshot.scopes[name].configuration.mode}`)
        .join(' → ');
    root.find('#world_engine_post_history_selected_source').text(
        selected.available ? `正在编辑：${selected.label}` : `${selected.label}（当前不可用）`,
    );
    root.find('#world_engine_post_history_effective').text(
        `生效来源：${effective.sourceLabel} · ${effective.mode} · UI 估算约 ${tokenEstimate} tokens`,
    );
    root.find('#world_engine_post_history_chain').text(`覆盖链：${chain}`);
    root.find('#world_engine_post_history_effective_prompt').val(effective.prompt);
    root.find('#world_engine_post_history_truncation').text(
        '本层原文不会被后台秘密截断；最终 Token 与上下文预算截断结果记录在 Request Inspector。',
    );
}

async function savePostHistoryFromUi() {
    const scope = getPostHistoryUiScope();
    const configuration = getPostHistoryUiConfiguration();
    try {
        const result = await writePostHistoryScope(scope, configuration);
        if (!result.ok) {
            toastr.error(result.error || '保存失败。', 'World Engine');
            return false;
        }
        await refreshPrompt();
        refreshPostHistoryUi();
        toastr.success('Post-History 作用域配置已保存。', 'World Engine');
        return true;
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to save Post-History scope`, error);
        toastr.error(String(error?.message || error), 'World Engine');
        return false;
    }
}

function exportPostHistoryFromUi() {
    const scope = getPostHistoryUiScope();
    const snapshot = readPostHistoryContext();
    const selected = snapshot.scopes[scope];
    const payload = createPostHistoryExport({
        scope,
        source: { label: selected.label, id: selected.id },
        configuration: getPostHistoryUiConfiguration(),
    });
    downloadJsonPayload(`world-engine-post-history-${scope}.json`, payload);
}

async function importPostHistoryFile(file) {
    if (!file) {
        return;
    }
    if (Number(file.size) > 1_000_000) {
        toastr.error('配置文件超过 1 MB 限制。', 'World Engine');
        return;
    }
    const parsed = parsePostHistoryExport(await file.text());
    if (!parsed.ok) {
        toastr.error(parsed.error, 'World Engine');
        return;
    }
    const configuration = parsed.value.configuration;
    jQuery('#world_engine_post_history_mode').val(configuration.mode);
    jQuery('#world_engine_post_history_prompt').val(
        configuration.mode === 'example' ? DEFAULT_POST_HISTORY_PROMPT : configuration.prompt,
    );
    const saved = await savePostHistoryFromUi();
    if (saved) {
        toastr.info(`已将导入配置写入当前选择的 ${getPostHistoryUiScope()} 作用域。`, 'World Engine');
    }
}

function enableMemoryGraphFromExplicitOptIn(context) {
    const settings = ensureSettings();
    if (!context.extensionSettings.memory_graph || typeof context.extensionSettings.memory_graph !== 'object') {
        context.extensionSettings.memory_graph = {};
    }
    context.extensionSettings.memory_graph.enabled = true;
    settings.memoryGraphConfigured = true;
}

function syncSettingsFromUi(event) {
    const settings = ensureSettings();
    settings.enabled = Boolean(jQuery('#world_engine_enabled').prop('checked'));
    settings.injectState = Boolean(jQuery('#world_engine_inject_state').prop('checked'));
    settings.nativeTools = Boolean(jQuery('#world_engine_native_tools').prop('checked'));
    settings.taggedFallback = Boolean(jQuery('#world_engine_tagged_fallback').prop('checked'));
    settings.autoImportLegacyInitvar = Boolean(jQuery('#world_engine_auto_import_initvar').prop('checked'));
    const autoEnableMemoryGraph = Boolean(jQuery('#world_engine_auto_memory').prop('checked'));
    settings.autoEnableMemoryGraph = autoEnableMemoryGraph;
    const context = getContext();
    if (event?.target?.id === 'world_engine_auto_memory' && autoEnableMemoryGraph) {
        enableMemoryGraphFromExplicitOptIn(context);
    }
    context.saveSettingsDebounced();
    syncFallbackRegex();
    void refreshPrompt();
}

function bindUi() {
    const settings = ensureSettings();
    const root = jQuery(`#${UI_BLOCK_ID}`);
    if (!root.length) {
        return;
    }
    root.find('#world_engine_enabled').prop('checked', settings.enabled);
    root.find('#world_engine_inject_state').prop('checked', settings.injectState);
    root.find('#world_engine_native_tools').prop('checked', settings.nativeTools);
    root.find('#world_engine_tagged_fallback').prop('checked', settings.taggedFallback);
    root.find('#world_engine_auto_import_initvar').prop('checked', settings.autoImportLegacyInitvar);
    root.find('#world_engine_auto_memory').prop('checked', settings.autoEnableMemoryGraph);
    root.off('.worldEngine');
    root.on('change.worldEngine input.worldEngine', '[data-world-engine-setting]', syncSettingsFromUi);
    root.on('click.worldEngine', '#world_engine_refresh_state', () => void refreshStateEditor());
    root.on('click.worldEngine', '#world_engine_save_state', () => void saveEditorState());
    root.on('click.worldEngine', '#world_engine_export_state', () => void exportWorldState());
    root.on('click.worldEngine', '#world_engine_import_state', () => {
        const input = root.find('#world_engine_import_state_file');
        input.val('');
        input.trigger('click');
    });
    root.on('change.worldEngine', '#world_engine_import_state_file', function () {
        void importWorldStateFile(this.files?.[0]);
    });
    root.on('click.worldEngine', '#world_engine_run_dry_inspection', () => void runLocalPromptInspection());
    root.on('click.worldEngine', '#world_engine_import_initvar', async () => {
        const result = await queueInitialization({ force: true });
        if (result?.ok) {
            await refreshPrompt(result.state);
            await refreshStateEditor(result.state);
            toastr.success('World state rebuilt from the active card/chat.', 'World Engine');
        } else {
            toastr.error(result?.hint || result?.reason || 'Import failed.', 'World Engine');
        }
    });
    root.on('change.worldEngine', '#world_engine_post_history_scope', () => refreshPostHistoryUi());
    root.on('change.worldEngine', '#world_engine_post_history_mode', () => {
        const mode = String(jQuery('#world_engine_post_history_mode').val() || 'inherit');
        if (mode === 'example') {
            jQuery('#world_engine_post_history_prompt').val(DEFAULT_POST_HISTORY_PROMPT);
        }
        jQuery('#world_engine_post_history_selected_source').append(' · 未保存');
    });
    root.on('input.worldEngine', '#world_engine_post_history_prompt', () => {
        const editor = jQuery('#world_engine_post_history_prompt');
        if (String(jQuery('#world_engine_post_history_mode').val()) === 'example'
            && String(editor.val() || '') !== DEFAULT_POST_HISTORY_PROMPT) {
            jQuery('#world_engine_post_history_mode').val('custom');
        }
        if (!String(jQuery('#world_engine_post_history_selected_source').text()).includes('未保存')) {
            jQuery('#world_engine_post_history_selected_source').append(' · 未保存');
        }
    });
    root.on('click.worldEngine', '#world_engine_save_post_history', () => void savePostHistoryFromUi());
    root.on('click.worldEngine', '#world_engine_inherit_post_history', () => {
        jQuery('#world_engine_post_history_mode').val('inherit');
        void savePostHistoryFromUi();
    });
    root.on('click.worldEngine', '#world_engine_reset_post_history', () => {
        jQuery('#world_engine_post_history_mode').val('example');
        jQuery('#world_engine_post_history_prompt').val(DEFAULT_POST_HISTORY_PROMPT);
        jQuery('#world_engine_post_history_selected_source').append(' · 未保存');
    });
    root.on('click.worldEngine', '#world_engine_export_post_history', exportPostHistoryFromUi);
    root.on('click.worldEngine', '#world_engine_import_post_history', () => {
        const input = root.find('#world_engine_import_post_history_file');
        input.val('');
        input.trigger('click');
    });
    root.on('change.worldEngine', '#world_engine_import_post_history_file', function () {
        void importPostHistoryFile(this.files?.[0]);
    });
    void refreshStateEditor();
    refreshPostHistoryUi();
}

function getActiveExtensionsSettingsHost() {
    // Taverncraft keeps desktop and compact-layout drawers in the DOM at the same
    // time and both currently use the same id. Pick the host belonging to the
    // visible drawer trigger instead of relying on jQuery's id fast-path,
    // which always returns the first (and can therefore be hidden) copy.
    const hosts = jQuery('[id="extensions_settings2"]');
    const activeLayoutHost = hosts.filter((_index, element) => jQuery(element)
        .closest('[id="extensions-settings-button"]')
        .is(':visible'))
        .first();
    if (activeLayoutHost.length) {
        return activeLayoutHost;
    }
    const visibleHost = hosts.filter(':visible').first();
    return visibleHost.length ? visibleHost : hosts.first();
}

function ensureUi() {
    const host = getActiveExtensionsSettingsHost();
    const existing = jQuery(`#${UI_BLOCK_ID}`);
    if (!host.length) {
        return;
    }
    if (existing.length) {
        if (existing.parent().get(0) !== host.get(0)) {
            host.append(existing);
        }
        bindUi();
        return;
    }
    host.append(`
<div id="${UI_BLOCK_ID}" class="extension_container">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>World Engine · 单 NPC</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content world_engine_panel">
      <label class="checkbox_label"><input id="world_engine_enabled" data-world-engine-setting type="checkbox">启用权威世界状态</label>
      <label class="checkbox_label"><input id="world_engine_inject_state" data-world-engine-setting type="checkbox">向主对话注入当前状态</label>
      <label class="checkbox_label"><input id="world_engine_native_tools" data-world-engine-setting type="checkbox">优先使用原生 Tool Calls</label>
      <label class="checkbox_label"><input id="world_engine_tagged_fallback" data-world-engine-setting type="checkbox">允许严格 JSON 标签兜底</label>
      <label class="checkbox_label"><input id="world_engine_auto_import_initvar" data-world-engine-setting type="checkbox">兼容导入 ST &lt;initvar&gt; YAML</label>
      <label class="checkbox_label"><input id="world_engine_auto_memory" data-world-engine-setting type="checkbox">启用 Memory Graph 长记忆（会增加后台模型请求）</label>
      <div class="world_engine_section">
        <b>权威状态编辑器</b>
        <small id="world_engine_state_summary"></small>
        <div class="world_engine_locations">
          <b>已知地点列表</b>
          <div id="world_engine_location_list"></div>
        </div>
        <textarea id="world_engine_state_json" class="text_pole" rows="16" spellcheck="false"></textarea>
        <div class="flex-container">
          <div id="world_engine_refresh_state" class="menu_button">重新读取</div>
          <div id="world_engine_save_state" class="menu_button">校验并保存</div>
          <div id="world_engine_import_initvar" class="menu_button">从角色卡/开场重建</div>
        </div>
        <div class="flex-container">
          <div id="world_engine_export_state" class="menu_button">导出状态备份</div>
          <div id="world_engine_import_state" class="menu_button">校验并导入备份</div>
          <input id="world_engine_import_state_file" type="file" accept="application/json,.json" hidden>
        </div>
      </div>
      <div class="world_engine_section">
        <b>本地上下文检查</b>
        <small>执行与真实生成相同的世界书扫描和 Prompt 拼装，但不会调用模型或消耗额度。</small>
        <div id="world_engine_run_dry_inspection" class="menu_button">运行本地 Dry Run</div>
        <small id="world_engine_dry_run_status">尚未运行。</small>
        <textarea id="world_engine_dry_run_result" class="text_pole" rows="10" readonly spellcheck="false"></textarea>
      </div>
      <div class="world_engine_section">
        <b>Post-History / 破甲提示层</b>
        <small>透明、可编辑、单轮注入；不会自动发起多轮绕过。覆盖优先级：聊天 ＞ 角色卡 ＞ 模型预设 ＞ 全局。</small>
        <label>编辑作用域
          <select id="world_engine_post_history_scope" class="text_pole">
            <option value="global">全局默认</option>
            <option value="model">模型预设</option>
            <option value="character">角色卡</option>
            <option value="chat">当前聊天</option>
          </select>
        </label>
        <label>此作用域的模式
          <select id="world_engine_post_history_mode" class="text_pole">
            <option value="inherit">继承低优先级作用域</option>
            <option value="off">明确关闭</option>
            <option value="example">内置示例</option>
            <option value="custom">自定义</option>
          </select>
        </label>
        <small id="world_engine_post_history_selected_source"></small>
        <label>当前作用域文本
          <textarea id="world_engine_post_history_prompt" class="text_pole" rows="8" spellcheck="false"></textarea>
        </label>
        <div class="flex-container">
          <div id="world_engine_save_post_history" class="menu_button">保存当前作用域</div>
          <div id="world_engine_inherit_post_history" class="menu_button">设为继承</div>
          <div id="world_engine_reset_post_history" class="menu_button">载入示例</div>
        </div>
        <div class="flex-container">
          <div id="world_engine_export_post_history" class="menu_button">导出当前作用域</div>
          <div id="world_engine_import_post_history" class="menu_button">导入到当前作用域</div>
          <input id="world_engine_import_post_history_file" type="file" accept="application/json,.json" hidden>
        </div>
        <div class="world_engine_effective_prompt">
          <b>最终注入结果</b>
          <small id="world_engine_post_history_effective"></small>
          <small id="world_engine_post_history_chain"></small>
          <textarea id="world_engine_post_history_effective_prompt" class="text_pole" rows="6" readonly></textarea>
          <small id="world_engine_post_history_truncation"></small>
        </div>
      </div>
    </div>
  </div>
</div>`);
    bindUi();
}

function installGlobalApi() {
    globalThis.Taverncraft.worldEngine = {
        toolNames: TOOL_NAMES,
        getState: async () => await readWorldState(),
        getPreviewState: async () => await getPreviewStateWithPending(),
        apply: async (operations, options = {}) => await commitOperations(operations, options),
        stage: async (operations, options = {}) => await stageToolOperations({ operations, ...options }),
        applyWorldOperations: async (worldOperations, options = {}) => await commitWorldOperations(worldOperations, options),
        stageWorldOperations: async worldOperations => await stageWorldOperations({ worldOperations }),
        hashState: async state => await hashWorldState(state),
        parseTaggedUpdate: parseTaggedWorldStateUpdate,
        initialize: async options => await queueInitialization(options),
        getSettings: () => structuredClone(ensureSettings()),
        getPostHistory: () => {
            const snapshot = readPostHistoryContext();
            return structuredClone({
                effective: snapshot.effective,
                scopes: Object.fromEntries(Object.entries(snapshot.scopes).map(([scope, entry]) => [scope, {
                    label: entry.label,
                    id: entry.id,
                    available: entry.available,
                    configuration: entry.configuration,
                }])),
            });
        },
        setPostHistory: async (scope, configuration) => await writePostHistoryScope(scope, configuration),
        inspectPrompt: async () => await runLocalPromptInspection(),
        getLastPromptInspection: () => lastDryRunReport ? structuredClone(lastDryRunReport) : null,
        getLastCommitDiagnostic: () => lastCommitDiagnostic ? structuredClone(lastCommitDiagnostic) : null,
        getPendingSummary: () => ({
            worldOperations: pendingWorldOperations.length,
            operations: pendingToolOperations.length,
        }),
        getPendingLifecycle: () => structuredClone(pendingLifecycle),
    };
}

jQuery(() => {
    const context = getContext();
    ensureSettings();
    registerFunctionTools(context);
    syncFallbackRegex();
    ensureUi();
    installGlobalApi();
    let uiRelocationTimer = null;
    jQuery(window).off('resize.worldEngine').on('resize.worldEngine', () => {
        clearTimeout(uiRelocationTimer);
        uiRelocationTimer = setTimeout(ensureUi, 100);
    });
    void queueInitialization().then(() => refreshPrompt());

    context.eventSource.on(context.eventTypes.CHAT_CHANGED, async () => {
        clearPendingToolOperations('chat-changed');
        generationActive = false;
        ensureUi();
        await queueInitialization();
        await refreshPrompt();
        await refreshStateEditor();
    });
    context.eventSource.on(context.eventTypes.GENERATION_STARTED, async (type, params, dryRun) => {
        const recursionDepth = Math.max(0, Number(params?.depth) || 0);
        const generationType = String(type || '');
        const lastMessage = context.chat?.at(-1);
        const isTopLevelChatRequest = recursionDepth === 0 && (
            Boolean(lastMessage?.is_user)
            || ['swipe', 'regenerate', 'continue', 'impersonate'].includes(generationType)
        );
        recordPendingLifecycle({
            event: 'generation-start',
            type: generationType,
            depth: recursionDepth,
            lastRole: lastMessage?.is_user ? 'user' : (lastMessage?.is_system ? 'system' : 'assistant'),
            topLevelChatRequest: isTopLevelChatRequest,
        });
        if (isTopLevelChatRequest) clearPendingToolOperations('top-level-chat-generation-start');
        generationActive = !dryRun;
        await refreshPrompt();
    });
    context.eventSource.on(context.eventTypes.MESSAGE_SENT, async (messageId) => {
        const message = context.chat?.[Number(messageId)];
        if (message?.is_user && !message?.is_system) {
            // GENERATION_STARTED fires before a normal composer message is
            // appended. MESSAGE_SENT is awaited before prompt assembly, so
            // this is the first lifecycle point where an exact-recall query
            // can be selected and injected into the same outbound request.
            await refreshPrompt();
        }
    });
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, async (messageId) => {
        await commitAssistantStateUpdate(Number(messageId));
        if (ensureSettings().autoEnableMemoryGraph) {
            try {
                await syncExplicitMemoriesToMemoryGraph(context, Number(messageId));
            } catch (error) {
                console.warn(`[${MODULE_NAME}] Explicit Memory Graph anchor sync failed`, error);
            }
        }
    });
    context.eventSource.on(context.eventTypes.MESSAGE_EDITED, async (messageId) => {
        await rollbackFromEditedFloor(Number(messageId));
    });
    context.eventSource.on(context.eventTypes.MESSAGE_SWIPED, async () => {
        await refreshPrompt();
        await refreshStateEditor();
    });
    context.eventSource.on(context.eventTypes.MESSAGE_DELETED, async () => {
        await refreshPrompt();
        await refreshStateEditor();
    });
    for (const eventName of [
        context.eventTypes.OAI_PRESET_CHANGED_AFTER,
        context.eventTypes.PRESET_CHANGED,
        context.eventTypes.CHARACTER_FIELDS_UPDATED,
    ].filter(Boolean)) {
        context.eventSource.on(eventName, async () => {
            await refreshPrompt();
            refreshPostHistoryUi();
        });
    }
    context.eventSource.on(context.eventTypes.GENERATION_ENDED, () => {
        generationActive = false;
        // Tool recursion can briefly end one provider request before the
        // final assistant message arrives. MESSAGE_RECEIVED owns successful
        // consumption; GENERATION_STOPPED and the next depth-0 start own
        // cancellation cleanup.
    });
    context.eventSource.on(context.eventTypes.GENERATION_STOPPED, () => {
        generationActive = false;
        clearPendingToolOperations('generation-stopped');
    });
});
