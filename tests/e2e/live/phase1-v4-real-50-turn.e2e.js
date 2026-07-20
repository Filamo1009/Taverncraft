// SPDX-License-Identifier: AGPL-3.0-or-later
// Phase 1 hard gate: a real OpenAI-compatible model, the real v4.0.png
// card, 50 main-branch turns, real UI operations, restart, memory recall,
// World Info evidence, world-state evidence, and a redacted JSON report.
//
// This spec is intentionally opt-in and MUST NOT be counted as passed when
// skipped. It writes the API key only to the isolated Playwright data root;
// teardown deletes that root. The report contains hashes/metrics, never the
// key or full prompt bodies.
//
// Required environment:
//   LIVE_PHASE1=1
//   PHASE1_COST_APPROVED=1
//   PHASE1_BASE_URL=https://provider.example/v1
//   PHASE1_MODEL=model-id
//   PHASE1_API_KEY=...
//   PHASE1_PERSONA='Name: ...\nBackground: ...'

/* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect */

import { test, expect } from '@playwright/test';
import crypto from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

import { read as readCharacterCard } from '../../../src/character-card-parser.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { appendConnectionProfile, bootstrapCustomBackend, markOnboarded } from '../_lib/fixtures.js';
import {
    awaitMainUI,
    branchFromMessageViaUI,
    closeExtensionsDrawer,
    editMessageViaUI,
    getChatSnapshot,
    openExtensionsDrawer,
    openInlineDrawer,
    reloadAndAwait,
    regenerateViaUI,
    selectCharacterByName,
    sendMessageAndAwaitReply,
    swipeRightOnLatest,
} from '../_lib/page.js';
import { importCharacterFile } from '../_lib/ui-character.js';
import { clickCharacterCard, disableTagImportPopup, dismissAnyPopup, openCharacterEditPanel } from '../character/_helpers.js';
import {
    PHASE1_BRANCH_TURN,
    PHASE1_EDIT_TURNS,
    PHASE1_INVALID_OPERATION_TURN,
    PHASE1_LIVE_FACTS,
    PHASE1_LIVE_TURN_COUNT,
    PHASE1_LIVE_TURNS,
    PHASE1_RESTART_TURN,
    PHASE1_SWIPE_TURNS,
    mergeRequestInspectorEvidence,
    validatePhase1LiveScenario,
} from './phase1-v4-scenario.js';

const LIVE = process.env.LIVE_PHASE1 === '1';
const liveDescribe = LIVE ? test.describe : test.describe.skip;
const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const FIXTURE_PATH = resolve(REPO_ROOT, '..', 'v4.0.png');
const EXPECTED_CARD_SHA256 = 'e031e7062ee7e9f140c72cecd0156625443a87391f4ee8400d2902893d804c8f';
const CHARACTER_NAME = '苍玄界';
const WORLD_BOOK_NAME = '我的苍玄界，才不会这么跌宕起伏！';
const REPORT_SCHEMA = 'phase1-v4-real-acceptance-report-v1';
const REPORT_DIR = resolve(REPO_ROOT, 'tests/.e2e-scratch/reports');
const REQUEST_TIMEOUT_MS = Number(process.env.PHASE1_REQUEST_TIMEOUT_MS || 240_000);
const MAX_TURN_TRANSPORT_RETRIES = 2;

let server;
let reportPath = '';

function requiredEnvironment() {
    const values = {
        baseURL: String(process.env.PHASE1_BASE_URL || '').trim(),
        model: String(process.env.PHASE1_MODEL || '').trim(),
        apiKey: String(process.env.PHASE1_API_KEY || ''),
        persona: String(process.env.PHASE1_PERSONA || '').trim(),
        personaName: String(process.env.PHASE1_PERSONA_NAME || '云舟').trim(),
        maxContext: Number(process.env.PHASE1_MAX_CONTEXT || 65_536),
        maxTokens: Number(process.env.PHASE1_MAX_TOKENS || 900),
        customIncludeBody: String(process.env.PHASE1_CUSTOM_INCLUDE_BODY || '').trim(),
    };
    const missing = [];
    if (process.env.PHASE1_COST_APPROVED !== '1') missing.push('PHASE1_COST_APPROVED=1');
    if (!values.baseURL) missing.push('PHASE1_BASE_URL');
    if (!values.model) missing.push('PHASE1_MODEL');
    if (!values.apiKey) missing.push('PHASE1_API_KEY');
    if (!values.persona) missing.push('PHASE1_PERSONA');
    if (!Number.isFinite(values.maxContext) || values.maxContext < 65_536) missing.push('PHASE1_MAX_CONTEXT>=65536');
    if (!Number.isFinite(values.maxTokens) || values.maxTokens < 256) missing.push('PHASE1_MAX_TOKENS>=256');
    if (missing.length) {
        throw new Error(`Phase 1 live acceptance preflight failed; missing/invalid: ${missing.join(', ')}`);
    }
    let parsedURL;
    try {
        parsedURL = new URL(values.baseURL);
    } catch {
        throw new Error('PHASE1_BASE_URL must be an absolute http(s) URL');
    }
    if (!['http:', 'https:'].includes(parsedURL.protocol)) {
        throw new Error('PHASE1_BASE_URL must use http or https');
    }
    return { ...values, baseHost: parsedURL.host };
}

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function safeUnlink(path) {
    if (existsSync(path)) unlinkSync(path);
}

function resetClonedV4Artifacts(dataRoot) {
    const userRoot = resolve(dataRoot, 'default-user');
    safeUnlink(resolve(userRoot, 'characters', `${CHARACTER_NAME}.png`));
    safeUnlink(resolve(userRoot, 'worlds', `${WORLD_BOOK_NAME}.json`));
    const chatsRoot = resolve(userRoot, 'chats');
    if (existsSync(chatsRoot)) {
        for (const name of readdirSync(chatsRoot)) {
            if (name.includes(CHARACTER_NAME)) {
                rmSync(resolve(chatsRoot, name), { recursive: true, force: true });
            }
        }
    }
}

function configureIsolatedLiveBackend(dataRoot, env) {
    markOnboarded({ dataRoot });
    disableTagImportPopup({ dataRoot });
    bootstrapCustomBackend({ dataRoot, baseURL: env.baseURL, model: env.model });
    appendConnectionProfile({
        dataRoot,
        name: `Phase 1 acceptance · ${env.model}`,
        baseURL: env.baseURL,
        model: env.model,
        maxRequestRetries: 2,
    });

    const userRoot = resolve(dataRoot, 'default-user');
    const settingsPath = resolve(userRoot, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    settings.firstRun = false;
    settings.main_api = 'openai';
    settings.oai_settings = settings.oai_settings || {};
    Object.assign(settings.oai_settings, {
        chat_completion_source: 'custom',
        custom_url: env.baseURL,
        custom_model: env.model,
        openai_model: env.model,
        openai_max_context: env.maxContext,
        openai_max_tokens: env.maxTokens,
        max_context_unlocked: true,
        stream_openai: true,
        function_calling: true,
        function_calling_plain_text: false,
        custom_prompt_post_processing: '',
        tool_call_recurse_limit: 5,
        custom_include_body: env.customIncludeBody,
    });
    settings.power_user = settings.power_user || {};
    Object.assign(settings.power_user, {
        world_import_dialog: true,
        default_persona: 'user-default.png',
        persona_description: env.persona,
        persona_description_position: 0,
    });
    settings.power_user.personas = settings.power_user.personas || {};
    settings.power_user.personas['user-default.png'] = env.personaName;
    settings.power_user.persona_descriptions = settings.power_user.persona_descriptions || {};
    settings.power_user.persona_descriptions['user-default.png'] = { description: env.persona, position: 0 };
    settings.accountStorage = settings.accountStorage || {};
    delete settings.accountStorage[`AlertWI_${CHARACTER_NAME}.png`];
    settings.extension_settings = settings.extension_settings || {};
    settings.extension_settings.world_engine = {
        ...(settings.extension_settings.world_engine || {}),
        enabled: true,
        injectState: true,
        nativeTools: true,
        taggedFallback: true,
        autoImportLegacyInitvar: true,
        autoEnableMemoryGraph: false,
        memoryGraphConfigured: false,
    };
    writeFileSync(settingsPath, JSON.stringify(settings, null, 4));

    const secretsPath = resolve(userRoot, 'secrets.json');
    let secrets = {};
    try { secrets = JSON.parse(readFileSync(secretsPath, 'utf8')); } catch { /* fresh isolated user */ }
    secrets.api_key_custom = env.apiKey;
    writeFileSync(secretsPath, JSON.stringify(secrets, null, 4));
}

function inspectFixture() {
    if (!existsSync(FIXTURE_PATH)) throw new Error(`v4.0.png not found at ${FIXTURE_PATH}`);
    const decoded = readCharacterCard(readFileSync(FIXTURE_PATH));
    const card = JSON.parse(decoded);
    const entries = card?.data?.character_book?.entries || [];
    return {
        decodedSha256: sha256(decoded),
        name: card?.data?.name,
        spec: card?.spec,
        specVersion: card?.spec_version,
        openings: 1 + (card?.data?.alternate_greetings?.length || 0),
        worldBookName: card?.data?.character_book?.name,
        entries: entries.length,
        enabledEntries: entries.filter(entry => entry.enabled !== false).length,
        constantEntries: entries.filter(entry => entry.constant === true).length,
    };
}

async function acceptEmbeddedWorldBookPopup(page) {
    const popup = page.locator('dialog.popup[open]', {
        hasText: /embedded World|World\/Lorebook|世界书|世界信息|导入|匯入/i,
    }).last();
    if (!(await popup.isVisible({ timeout: 2_000 }).catch(() => false))) {
        await clickCharacterCard(page, CHARACTER_NAME);
        await openCharacterEditPanel(page);
    }
    await popup.waitFor({ state: 'visible', timeout: 10_000 });
    await popup.locator('.popup-button-ok').first().click();
    await popup.waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {});

    // The legacy popup resolves before importEmbeddedWorldInfo() has
    // finished saving a large embedded book. v4.0.png also carries a stale
    // extensions.world pointer, so merely checking the character binding
    // cannot distinguish "174 entries imported" from "name only". Wait on
    // the authoritative world list and inspect the saved book before the
    // first generation is allowed to start.
    await page.waitForFunction(async (worldBookName) => {
        const worldInfo = await import('/scripts/world-info.js');
        return Array.isArray(worldInfo.world_names) && worldInfo.world_names.includes(worldBookName);
    }, WORLD_BOOK_NAME, { timeout: 60_000 });

    return page.evaluate(async ({ worldBookName, probeComments }) => {
        const worldInfo = await import('/scripts/world-info.js');
        const saved = await worldInfo.loadWorldInfo(worldBookName);
        const entries = Object.values(saved?.entries || {});
        const probeText = probeComments.join('、');
        const scan = await worldInfo.getWorldInfoPrompt([probeText], 65_536, true);
        const activated = Array.isArray(scan?.activatedEntries) ? scan.activatedEntries : [];
        const activatedComments = [...new Set(activated.map(entry => String(entry?.comment || '')).filter(Boolean))];
        return {
            worldKnown: Array.isArray(worldInfo.world_names) && worldInfo.world_names.includes(worldBookName),
            savedEntryCount: entries.length,
            savedEnabledEntryCount: entries.filter(entry => !entry?.disable).length,
            savedConstantEntryCount: entries.filter(entry => entry?.constant).length,
            activatedEntryCount: activated.length,
            matchedProbeComments: probeComments.filter(comment => activatedComments.includes(comment)),
            activatedConstantEntryCount: activated.filter(entry => entry?.constant).length,
            activatedProbabilityCheckedCount: activated.filter(entry => entry?.useProbability).length,
            activatedRecursionGuardCount: activated.filter(entry => entry?.preventRecursion || entry?.excludeRecursion).length,
        };
    }, {
        worldBookName: WORLD_BOOK_NAME,
        probeComments: ['沈慕微', '剑临城', '谢忘生', '药芷若', '姜昭昭', '东海海域'],
    });
}

async function enableLongMemoryThroughUi(page) {
    await openExtensionsDrawer(page);
    await openInlineDrawer(page, 'world_engine_settings');
    const worldMemory = page.locator('#world_engine_auto_memory');
    if (!(await worldMemory.isChecked())) await worldMemory.check();
    await openInlineDrawer(page, 'memory_graph_settings');
    for (const id of ['luker_rpg_memory_enabled', 'luker_rpg_memory_auto_extraction_enabled']) {
        const checkbox = page.locator(`#${id}`);
        if (!(await checkbox.isChecked())) await checkbox.check();
    }
    await closeExtensionsDrawer(page);
}

async function installEvidenceHooks(page) {
    await page.evaluate(() => {
        const ctx = window.Taverncraft.getContext();
        const prior = window.__phase1AcceptanceEvidence;
        if (prior?.listener) {
            try { ctx.eventSource.removeListener(ctx.eventTypes.GENERATION_WORLD_INFO_FINALIZED, prior.listener); } catch { /* stale page listener */ }
        }
        const bucket = { worldInfo: [], listener: null };
        bucket.listener = ctx.eventSource.on(ctx.eventTypes.GENERATION_WORLD_INFO_FINALIZED, payload => {
            const entries = Array.isArray(payload?.activatedEntries) ? payload.activatedEntries : [];
            bucket.worldInfo.push(entries.map(entry => {
                const ext = entry?.extensions && typeof entry.extensions === 'object' ? entry.extensions : {};
                return {
                    uid: String(entry?.uid ?? entry?.id ?? ''),
                    world: String(entry?.world ?? ''),
                    comment: String(entry?.comment ?? entry?.name ?? ''),
                    constant: Boolean(entry?.constant),
                    selective: Boolean(entry?.selective),
                    probability: Number(ext.probability ?? entry?.probability ?? 100),
                    useProbability: Boolean(ext.useProbability ?? entry?.useProbability),
                    preventRecursion: Boolean(ext.prevent_recursion ?? entry?.preventRecursion ?? entry?.prevent_recursion),
                    excludeRecursion: Boolean(ext.exclude_recursion ?? entry?.excludeRecursion ?? entry?.exclude_recursion),
                };
            }));
        });
        window.__phase1AcceptanceEvidence = bucket;
    });
}

async function drainWorldInfoEvidence(page) {
    return page.evaluate(() => {
        const bucket = window.__phase1AcceptanceEvidence;
        if (!bucket || !Array.isArray(bucket.worldInfo)) return [];
        return bucket.worldInfo.splice(0, bucket.worldInfo.length);
    });
}

async function getWorldStateEvidence(page) {
    return page.evaluate(async () => {
        const result = await window.Taverncraft.worldEngine.getState();
        if (!result?.ok || !result?.state) throw new Error('World Engine returned no authoritative state');
        const state = result.state;
        const hash = result.stateHash || await window.Taverncraft.worldEngine.hashState(state);
        const events = Array.isArray(state?.extensions?.worldEngine?.events)
            ? state.extensions.worldEngine.events
            : [];
        const diagnostic = window.Taverncraft.worldEngine.getLastCommitDiagnostic?.() || null;
        const pending = window.Taverncraft.worldEngine.getPendingSummary?.() || null;
        const pendingLifecycle = window.Taverncraft.worldEngine.getPendingLifecycle?.() || [];
        return {
            hash,
            initialized: Boolean(state?.meta?.initialized),
            source: String(state?.meta?.source || ''),
            turn: Number(state?.clock?.turn || 0),
            location: String(state?.location?.current || ''),
            npcName: String(state?.npc?.name || ''),
            eventCount: events.length,
            operationIds: events.map(event => String(event?.operationId || '')).filter(Boolean),
            diagnostic,
            pending,
            pendingLifecycle,
        };
    });
}

async function waitForWorldStateCommit(page, messageId, startedAt, timeoutMs = 60_000) {
    await page.waitForFunction(({ expectedMessageId, startedAt }) => {
        const engine = window.Taverncraft?.worldEngine;
        const diagnostic = engine?.getLastCommitDiagnostic?.();
        const pending = engine?.getPendingSummary?.();
        const settled = Number(diagnostic?.messageId) === Number(expectedMessageId)
            && diagnostic?.status !== 'received'
            && Number(pending?.worldOperations || 0) === 0
            && Number(pending?.operations || 0) === 0;
        const stopped = (engine?.getPendingLifecycle?.() || []).some(entry => Number(entry?.at || 0) >= startedAt
            && entry?.event === 'clear'
            && entry?.reason === 'generation-stopped');
        return settled || stopped;
    }, { expectedMessageId: messageId, startedAt }, { timeout: timeoutMs });
    return page.evaluate(({ expectedMessageId, startedAt }) => {
        const engine = window.Taverncraft.worldEngine;
        const diagnostic = engine.getLastCommitDiagnostic?.();
        const settled = Number(diagnostic?.messageId) === Number(expectedMessageId) && diagnostic?.status !== 'received';
        const stopped = (engine.getPendingLifecycle?.() || []).some(entry => Number(entry?.at || 0) >= startedAt
            && entry?.event === 'clear'
            && entry?.reason === 'generation-stopped');
        return { settled, stopped };
    }, { expectedMessageId: messageId, startedAt });
}

function isRetryableGenerationStop(error) {
    return /generation stopped before a completed reply|regenerate stopped before a completed reply/iu
        .test(String(error?.message || error));
}

async function generateTurnWithTransportRecovery(page, turn, report) {
    const startedAt = Date.now();
    let lastError = null;
    for (let attempt = 0; attempt <= MAX_TURN_TRANSPORT_RETRIES; attempt += 1) {
        try {
            const attemptStartedAt = await page.evaluate(() => Date.now());
            const reply = attempt === 0
                ? await sendMessageAndAwaitReply(page, turn.text, { timeoutMs: REQUEST_TIMEOUT_MS })
                : await regenerateViaUI(page, { timeoutMs: REQUEST_TIMEOUT_MS });
            const normalized = {
                replyId: Number(reply.replyId ?? reply.id ?? reply.swipeId),
                text: String(reply.text || ''),
            };
            const resolution = await waitForWorldStateCommit(page, normalized.replyId, attemptStartedAt, REQUEST_TIMEOUT_MS);
            if (resolution.stopped && !resolution.settled) {
                throw new Error('generation stopped before a completed reply');
            }
            return { reply: normalized, durationMs: Date.now() - startedAt };
        } catch (error) {
            lastError = error;
            if (!isRetryableGenerationStop(error) || attempt >= MAX_TURN_TRANSPORT_RETRIES) throw error;

            // The core GENERATION_STOPPED lifecycle clears staged tool data
            // before the UI is reused. Require that cleanup and exactly one
            // copy of the user turn, then regenerate the existing assistant
            // floor instead of sending a duplicate user message.
            await page.waitForFunction(() => {
                const engine = window.Taverncraft?.worldEngine;
                const pending = engine?.getPendingSummary?.();
                const stop = document.querySelector('#mes_stop');
                const stopHidden = !stop || getComputedStyle(stop).display === 'none';
                const send = document.querySelector('#send_but');
                return stopHidden
                    && send
                    && !send.classList.contains('displayNone')
                    && Number(pending?.worldOperations || 0) === 0
                    && Number(pending?.operations || 0) === 0;
            }, undefined, { timeout: 30_000 });
            const recovery = await page.evaluate(expectedText => {
                const ctx = window.Taverncraft.getContext();
                const exactUserMessages = ctx.chat.filter(message => message?.is_user && String(message?.mes || '') === expectedText);
                const pending = window.Taverncraft.worldEngine.getPendingSummary();
                return {
                    exactUserMessageCount: exactUserMessages.length,
                    pendingWorldOperations: Number(pending?.worldOperations || 0),
                    pendingOperations: Number(pending?.operations || 0),
                };
            }, turn.text);
            expect(recovery.exactUserMessageCount, `transport recovery duplicated or lost user turn ${turn.turn}`).toBe(1);
            expect(recovery.pendingWorldOperations, `transport recovery left staged world operations at turn ${turn.turn}`).toBe(0);
            expect(recovery.pendingOperations, `transport recovery left staged legacy operations at turn ${turn.turn}`).toBe(0);
            report.actions.transportRetries.push({
                turn: turn.turn,
                retry: attempt + 1,
                reason: 'generation-stopped',
                ...recovery,
            });
        }
    }
    throw lastError || new Error(`turn ${turn.turn} transport recovery exhausted`);
}

async function openChatThroughUi(page, chatId, { expectedLength = null } = {}) {
    const visibleList = page.locator('#select_chat_popup:visible .select_chat_block_wrapper');
    if ((await visibleList.count()) === 0) {
        await page.locator('#options_button').click();
        await page.locator('#option_select_chat').click();
    }
    const blocks = page.locator('#select_chat_popup:visible .select_chat_block');
    await blocks.first().waitFor({ state: 'visible', timeout: 15_000 });
    let exactBlock = null;
    for (let index = 0; index < await blocks.count(); index++) {
        const block = blocks.nth(index);
        const fileName = String(await block.getAttribute('file_name') || '').replace(/\.jsonl$/iu, '');
        if (fileName === chatId) {
            exactBlock = block;
            break;
        }
    }
    if (!exactBlock) throw new Error(`Chat ${chatId} was not present in Manage Chat Files.`);
    const chatChanged = page.evaluate(({ expectedId, timeoutMs }) => new Promise((resolve, reject) => {
        const ctx = window.Taverncraft.getContext();
        const timer = setTimeout(() => {
            try { ctx.eventSource.removeListener(ctx.eventTypes.CHAT_CHANGED, off); } catch { /* timed out */ }
            reject(new Error(`CHAT_CHANGED did not settle on ${expectedId}`));
        }, timeoutMs);
        const off = ctx.eventSource.on(ctx.eventTypes.CHAT_CHANGED, id => {
            if (String(id) !== expectedId) return;
            clearTimeout(timer);
            try { ctx.eventSource.removeListener(ctx.eventTypes.CHAT_CHANGED, off); } catch { /* already removed */ }
            resolve(id);
        });
    }), { expectedId: chatId, timeoutMs: 20_000 });
    await exactBlock.click();
    await chatChanged;
    if (Number.isInteger(expectedLength)) {
        await page.waitForFunction(length => {
            const ctx = window.Taverncraft.getContext();
            return ctx.chat.length === length && document.querySelectorAll('#chat .mes').length === length;
        }, expectedLength, { timeout: 20_000 });
    }
}

async function requestInspectorEvidence(page, model, apiKey) {
    return page.evaluate(async ({ expectedModel, secret }) => {
        const listResponse = await fetch('/api/request-inspector/list');
        if (!listResponse.ok) throw new Error(`Request Inspector list failed: ${listResponse.status}`);
        const list = await listResponse.json();
        const relevant = list.filter(item => (item.type || 'chat') === 'chat'
            && (!expectedModel || String(item.model || '').includes(expectedModel)));
        const details = [];
        for (const item of relevant) {
            const response = await fetch(`/api/request-inspector/${encodeURIComponent(item.id)}`);
            if (!response.ok) continue;
            const detail = await response.json();
            const serialized = JSON.stringify(detail);
            details.push({
                id: item.id,
                model: item.model,
                status: item.status,
                durationMs: item.durationMs,
                hasInvalidProbe: serialized.includes('phase1Probe') || serialized.includes('/__proto__'),
                hasWorldBookLayer: serialized.includes('world_book') || serialized.includes('World Book'),
                leakedSecret: Boolean(secret && serialized.includes(secret)),
            });
        }
        return {
            total: list.length,
            relevant: relevant.length,
            completed: relevant.filter(item => item.status === 'completed' || item.status === 'success').length,
            failed: relevant.filter(item => item.status === 'failed' || item.status === 'error').length,
            invalidAttemptObserved: details.some(detail => detail.hasInvalidProbe),
            worldBookLayerObserved: details.some(detail => detail.hasWorldBookLayer),
            secretLeakObserved: details.some(detail => detail.leakedSecret),
            requests: details.map(({ leakedSecret: _leakedSecret, ...detail }) => detail),
        };
    }, { expectedModel: model, secret: apiKey });
}

async function latestToolRequestEvidence(page, model, userPrompt) {
    return page.evaluate(async ({ expectedModel, prompt }) => {
        const listResponse = await fetch('/api/request-inspector/list');
        if (!listResponse.ok) throw new Error(`Request Inspector list failed: ${listResponse.status}`);
        const list = await listResponse.json();
        const candidates = list.filter(item => (item.type || 'chat') === 'chat'
            && (!expectedModel || String(item.model || '').includes(expectedModel))).slice(0, 40);
        const matches = [];
        for (const item of candidates) {
            const response = await fetch(`/api/request-inspector/${encodeURIComponent(item.id)}`);
            if (!response.ok) continue;
            const detail = await response.json();
            const messages = detail?.wireRequest?.messages || detail?.fullMessages || [];
            if (JSON.stringify(messages).includes(prompt)) matches.push(detail);
        }
        const detail = matches.find(item => Array.isArray(item?.wireRequest?.messages)
            && item.wireRequest.messages.some(message => message?.role === 'tool')) || matches[0];
        if (!detail) return { found: false, toolNames: [], toolChoice: '', finishReason: '', priorToolCallNames: [], toolResults: [], hasToolResult: false };
        const tools = Array.isArray(detail?.wireRequest?.tools) ? detail.wireRequest.tools : [];
        const messages = Array.isArray(detail?.wireRequest?.messages) ? detail.wireRequest.messages : [];
        const parts = Array.isArray(detail?.responseParts) ? detail.responseParts : [];
        const priorToolCallNames = messages.flatMap(message => Array.isArray(message?.tool_calls)
            ? message.tool_calls.map(call => String(call?.function?.name || '')).filter(Boolean)
            : []);
        const toolResults = messages.filter(message => message?.role === 'tool').map(message => {
            let parsed = null;
            try { parsed = JSON.parse(String(message?.content || '')); } catch { /* non-JSON tool output */ }
            return {
                name: String(message?.name || ''),
                ok: typeof parsed?.ok === 'boolean' ? parsed.ok : null,
                staged: Number.isFinite(Number(parsed?.staged)) ? Number(parsed.staged) : null,
                applied: Number.isFinite(Number(parsed?.applied)) ? Number(parsed.applied) : null,
                errors: Array.isArray(parsed?.errors) ? parsed.errors.map(error => String(error).slice(0, 300)).slice(0, 5) : [],
            };
        });
        return {
            found: true,
            status: String(detail.status || ''),
            toolNames: tools.map(tool => String(tool?.function?.name || '')).filter(Boolean),
            toolChoice: typeof detail?.wireRequest?.tool_choice === 'string'
                ? detail.wireRequest.tool_choice
                : JSON.stringify(detail?.wireRequest?.tool_choice || ''),
            finishReason: String(detail.finishReason || ''),
            responseToolNames: parts.filter(part => part?.type === 'tool_call').map(part => String(part.name || '')),
            priorToolCallNames,
            toolResults,
            hasToolResult: messages.some(message => message?.role === 'tool'),
        };
    }, { expectedModel: model, prompt: userPrompt });
}

async function memoryEvidence(page) {
    return page.evaluate(async (facts) => {
        const ctx = window.Taverncraft.getContext();
        const api = ctx.getExtensionApi?.('memory-graph');
        const session = await api?.openSession?.(ctx);
        if (!session) return { available: false, nodeCount: 0, facts: [] };
        const visible = session.listVisibleCandidates({});
        const results = [];
        for (const fact of facts) {
            const hits = await session.keywordSearch({ query: fact.token, k: 10 });
            results.push({
                token: fact.token,
                hitCount: hits.length,
                sources: hits.map(hit => ({ id: hit.id, type: hit.type, title: hit.title, floorRange: hit.floorRange || null })),
            });
        }
        return { available: true, nodeCount: visible.length, facts: results };
    }, PHASE1_LIVE_FACTS);
}

async function memoryFactEvidence(page, token) {
    return page.evaluate(async (expectedToken) => {
        const ctx = window.Taverncraft.getContext();
        const api = ctx.getExtensionApi?.('memory-graph');
        const session = await api?.openSession?.(ctx);
        if (!session) return { available: false, hitCount: 0, exactCount: 0, alwaysInjectedCount: 0, sourceTurns: [] };
        const hits = await session.keywordSearch({ query: expectedToken, types: ['memory_anchor'], k: 20 });
        const exact = hits.filter(hit => String(hit?.fields?.verbatim || '') === expectedToken);
        const injection = api?.getCurrentInjection?.(ctx);
        const alwaysIds = injection?.alwaysInjectIds instanceof Set ? injection.alwaysInjectIds : new Set();
        return {
            available: true,
            hitCount: hits.length,
            exactCount: exact.length,
            alwaysInjectedCount: exact.filter(hit => alwaysIds.has(String(hit.id))).length,
            sourceTurns: exact.map(hit => Number(hit?.fields?.source_turn || 0)).filter(Number.isFinite),
        };
    }, token);
}

function scanIsolatedDataForSecret(dataRoot, secret) {
    if (!secret) return [];
    const hits = [];
    const userRoot = resolve(dataRoot, 'default-user');
    const visit = path => {
        for (const entry of readdirSync(path, { withFileTypes: true })) {
            const child = resolve(path, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'backups') continue;
                visit(child);
                continue;
            }
            if (entry.name === 'secrets.json') continue;
            if (!/\.(json|jsonl|log|txt|yaml|yml)$/i.test(entry.name)) continue;
            let value = '';
            try { value = readFileSync(child, 'utf8'); } catch { continue; }
            if (value.includes(secret)) hits.push(child.slice(userRoot.length + 1));
        }
    };
    visit(userRoot);
    return hits;
}

function summarizeWorldInfo(worldInfoEvents) {
    const flattened = worldInfoEvents.flatMap(event => event.entries || []);
    const unique = new Map();
    for (const entry of flattened) {
        const key = `${entry.world}:${entry.uid}:${entry.comment}`;
        if (!unique.has(key)) unique.set(key, entry);
    }
    const entries = [...unique.values()];
    return {
        generationCount: worldInfoEvents.length,
        uniqueEntryCount: entries.length,
        keywordEntries: entries.filter(entry => !entry.constant).map(entry => entry.comment).filter(Boolean),
        constantEntryCount: entries.filter(entry => entry.constant).length,
        probabilityCheckedCount: entries.filter(entry => entry.useProbability).length,
        recursionGuardCheckedCount: entries.filter(entry => entry.preventRecursion || entry.excludeRecursion).length,
    };
}

liveDescribe('Phase 1 — v4.0.png real-model 50-turn hard gate', () => {
    test.describe.configure({ mode: 'serial' });
    test.setTimeout(4 * 60 * 60 * 1000);

    test.beforeAll(async () => {
        const env = requiredEnvironment();
        expect(validatePhase1LiveScenario()).toEqual([]);
        server = await startServer({ batchKey: 'livephase1', scenarioId: 'v4-real-50' });
        await server.stop();
        resetClonedV4Artifacts(server.dataRoot);
        configureIsolatedLiveBackend(server.dataRoot, env);
        await server.restart();
    });

    test.afterAll(async () => {
        if (server) await tearDownServer(server);
    });

    test('runs the complete acceptance matrix and writes a redacted report', async ({ page }, testInfo) => {
        const env = requiredEnvironment();
        const fixture = inspectFixture();
        const report = {
            schema: REPORT_SCHEMA,
            status: 'running',
            startedAt: new Date().toISOString(),
            completedAt: null,
            fixture,
            provider: {
                baseHost: env.baseHost,
                model: env.model,
                maxContext: env.maxContext,
                maxTokens: env.maxTokens,
                requestRetries: 2,
                turnRecoveryRetries: MAX_TURN_TRANSPORT_RETRIES,
            },
            persona: { name: env.personaName, descriptionSha256: sha256(env.persona), descriptionChars: env.persona.length },
            turns: [],
            actions: { edits: [], swipes: [], transportRetries: [], branch: null, restart: null, invalidOperation: null },
            worldInfoPreflight: null,
            worldInfo: null,
            worldState: null,
            toolRuntime: null,
            memory: null,
            requestInspector: null,
            finalChat: null,
            secretLeakFiles: [],
            error: null,
        };
        const worldInfoEvents = [];
        const requestInspectorSegments = [];
        mkdirSync(REPORT_DIR, { recursive: true });
        reportPath = resolve(REPORT_DIR, `phase1-v4-real-${Date.now()}.json`);

        try {
            expect(fixture).toMatchObject({
                decodedSha256: EXPECTED_CARD_SHA256,
                name: CHARACTER_NAME,
                spec: 'chara_card_v3',
                specVersion: '3.0',
                openings: 19,
                worldBookName: WORLD_BOOK_NAME,
                entries: 174,
                enabledEntries: 173,
                constantEntries: 33,
            });

            await awaitMainUI(page, server.baseURL);
            await importCharacterFile(page, { filePath: FIXTURE_PATH, expectedName: CHARACTER_NAME, timeoutMs: 60_000 });
            report.worldInfoPreflight = await acceptEmbeddedWorldBookPopup(page);
            await dismissAnyPopup(page);
            await selectCharacterByName(page, CHARACTER_NAME);

            expect(report.worldInfoPreflight).toMatchObject({
                worldKnown: true,
                savedEntryCount: 174,
                savedEnabledEntryCount: 173,
                savedConstantEntryCount: 33,
            });
            expect(report.worldInfoPreflight.matchedProbeComments).toEqual(expect.arrayContaining(['剑临城', '东海海域']));
            expect(report.worldInfoPreflight.matchedProbeComments.length).toBeGreaterThanOrEqual(2);
            expect(report.worldInfoPreflight.activatedConstantEntryCount).toBeGreaterThanOrEqual(3);
            expect(report.worldInfoPreflight.activatedProbabilityCheckedCount).toBeGreaterThanOrEqual(3);
            expect(report.worldInfoPreflight.activatedRecursionGuardCount).toBeGreaterThanOrEqual(3);

            const imported = await page.evaluate(async ({ characterName, worldBookName }) => {
                const ctx = window.Taverncraft.getContext();
                const worldInfo = await import('/scripts/world-info.js');
                const matches = ctx.characters.filter(character => character?.name === characterName);
                const active = ctx.characters[ctx.characterId];
                return {
                    matchCount: matches.length,
                    activeName: active?.name,
                    boundWorld: active?.data?.extensions?.world,
                    embeddedEntries: active?.data?.character_book?.entries?.length || 0,
                    worldKnown: Array.isArray(worldInfo.world_names) && worldInfo.world_names.includes(worldBookName),
                };
            }, { characterName: CHARACTER_NAME, worldBookName: WORLD_BOOK_NAME });
            expect(imported.matchCount).toBe(1);
            expect(imported.activeName).toBe(CHARACTER_NAME);
            expect(imported.embeddedEntries).toBe(174);
            expect(imported.boundWorld).toBe(WORLD_BOOK_NAME);
            expect(imported.worldKnown).toBe(true);

            await page.waitForFunction(() => Boolean(window.Taverncraft?.worldEngine), undefined, { timeout: 30_000 });
            await swipeRightOnLatest(page, { timeoutMs: 30_000 });
            await page.waitForFunction(async () => {
                const result = await window.Taverncraft.worldEngine.getState();
                return result?.ok && result?.state?.meta?.initialized && result?.state?.npc?.name === '沈慕微';
            }, undefined, { timeout: 30_000 });
            await enableLongMemoryThroughUi(page);
            await installEvidenceHooks(page);

            report.toolRuntime = await page.evaluate(async () => {
                const openai = await import('/scripts/openai.js');
                const ctx = window.Taverncraft.getContext();
                const names = ctx.ToolManager.tools
                    .map(tool => tool.toFunctionOpenAI?.()?.function?.name)
                    .filter(Boolean);
                return {
                    functionCallingEnabled: Boolean(openai.oai_settings.function_calling),
                    functionCallingSupported: Boolean(ctx.ToolManager.isToolCallingSupported()),
                    worldStateReadRegistered: names.includes('world_state_read'),
                    worldStateApplyRegistered: names.includes('world_state_apply'),
                };
            });
            expect(report.toolRuntime).toEqual({
                functionCallingEnabled: true,
                functionCallingSupported: true,
                worldStateReadRegistered: false,
                worldStateApplyRegistered: true,
            });

            const initialState = await getWorldStateEvidence(page);
            expect(initialState).toMatchObject({ initialized: true, npcName: '沈慕微' });
            const originalChatId = await page.evaluate(() => window.Taverncraft.getContext().getCurrentChatId?.());
            expect(originalChatId).toBeTruthy();

            for (const turn of PHASE1_LIVE_TURNS) {
                const beforeState = await getWorldStateEvidence(page);
                const generated = await generateTurnWithTransportRecovery(page, turn, report);
                const { reply, durationMs } = generated;
                if (turn.recallToken) {
                    expect(reply.text.trim().length, `turn ${turn.turn} returned an empty recall reply`)
                        .toBeGreaterThanOrEqual(turn.recallToken.length);
                } else {
                    expect(reply.text.trim().length, `turn ${turn.turn} returned an empty/too-short reply`).toBeGreaterThan(10);
                }
                const afterState = await getWorldStateEvidence(page);
                const wiBatches = await drainWorldInfoEvidence(page);
                const toolRequest = await latestToolRequestEvidence(page, env.model, turn.text);
                const recallMemory = turn.recallToken ? await memoryFactEvidence(page, turn.recallToken) : null;
                const persistedMainTurn = await page.evaluate(({ expectedTurn, expectedText }) => {
                    const ctx = window.Taverncraft.getContext();
                    const userMessages = ctx.chat.filter(message => message?.is_user);
                    return {
                        userCount: userMessages.length,
                        exactTextPresent: userMessages.some(message => String(message?.mes || '') === expectedText),
                        expectedTurn,
                    };
                }, { expectedTurn: turn.turn, expectedText: turn.text });
                for (const entries of wiBatches) worldInfoEvents.push({ turn: turn.turn, entries });

                const turnReport = {
                    turn: turn.turn,
                    userSha256: sha256(turn.text),
                    userChars: turn.text.length,
                    assistantSha256: sha256(reply.text),
                    assistantChars: reply.text.length,
                    durationMs,
                    stateHashBefore: beforeState.hash,
                    stateHashAfter: afterState.hash,
                    stateEventCount: afterState.eventCount,
                    worldInfoBatches: wiBatches.length,
                    toolRequest,
                    recallMemory,
                    persistedMainTurn,
                    recallToken: turn.recallToken,
                    recallPassed: turn.recallToken ? reply.text.includes(turn.recallToken) : null,
                };
                report.turns.push(turnReport);
                expect(persistedMainTurn.exactTextPresent, `turn ${turn.turn} was replaced before it reached the active chat history`).toBe(true);
                expect(persistedMainTurn.userCount, `main chat user-turn count drifted at turn ${turn.turn}`).toBe(turn.turn);
                if (turn.recallToken) {
                    expect(recallMemory, `turn ${turn.turn} had no exact persistent memory anchor`).toMatchObject({
                        available: true,
                        exactCount: expect.any(Number),
                    });
                    expect(recallMemory.exactCount, `turn ${turn.turn} had no exact persistent memory anchor`).toBeGreaterThan(0);
                    expect(recallMemory.alwaysInjectedCount, `turn ${turn.turn} memory anchor was not injected`).toBeGreaterThan(0);
                    expect(reply.text, `turn ${turn.turn} failed exact long-memory recall`).toContain(turn.recallToken);
                }
                if (turn.worldOperationProbe) {
                    expect(
                        afterState.eventCount,
                        `turn ${turn.turn} did not commit its required world-state operation; request=${JSON.stringify(toolRequest)}; engine=${JSON.stringify({ diagnostic: afterState.diagnostic, pending: afterState.pending, lifecycle: afterState.pendingLifecycle })}`,
                    ).toBeGreaterThan(beforeState.eventCount);
                }

                if (turn.turn === PHASE1_EDIT_TURNS[0]) {
                    const snapshot = await getChatSnapshot(page);
                    const userId = snapshot.messages.findLastIndex(message => message?.is_user);
                    const editedText = `${turn.text}\n（历史修订：守卫披着灰蓝斗篷。）`;
                    await editMessageViaUI(page, userId, editedText);
                    report.actions.edits.push({ turn: turn.turn, messageRole: 'user', messageId: userId, textSha256: sha256(editedText) });
                }
                if (turn.turn === PHASE1_EDIT_TURNS[1]) {
                    const editedText = `${reply.text}\n\n（历史修订标记：不改变既有事实。）`;
                    await editMessageViaUI(page, reply.replyId, editedText);
                    report.actions.edits.push({ turn: turn.turn, messageRole: 'assistant', messageId: reply.replyId, textSha256: sha256(editedText) });
                }

                if (PHASE1_SWIPE_TURNS.includes(turn.turn)) {
                    const variant = await swipeRightOnLatest(page, { timeoutMs: REQUEST_TIMEOUT_MS });
                    expect(variant.text.trim().length).toBeGreaterThan(10);
                    report.actions.swipes.push({ turn: turn.turn, assistantSha256: sha256(variant.text), assistantChars: variant.text.length });
                    const swipeWi = await drainWorldInfoEvidence(page);
                    for (const entries of swipeWi) worldInfoEvents.push({ turn: turn.turn, kind: 'swipe', entries });
                }

                if (turn.turn === PHASE1_BRANCH_TURN) {
                    const branchBaseState = await getWorldStateEvidence(page);
                    const mainLength = (await getChatSnapshot(page)).length;
                    const branchChatId = await branchFromMessageViaUI(page, reply.replyId, { timeoutMs: 60_000 });
                    expect(branchChatId).not.toBe(originalChatId);
                    const branchReply = await sendMessageAndAwaitReply(
                        page,
                        '这是验收分支：假设我们改走玄清宗，只推演这一条支线，不得改写原分支事实。',
                        { timeoutMs: REQUEST_TIMEOUT_MS },
                    );
                    await page.evaluate(async () => {
                        await window.Taverncraft.worldEngine.apply([
                            { op: 'set', path: '/flags/phase1BranchProbe', value: true },
                        ]);
                    });
                    const branchState = await getWorldStateEvidence(page);
                    expect(branchState.hash).not.toBe(branchBaseState.hash);
                    await openChatThroughUi(page, originalChatId, { expectedLength: mainLength });
                    const restoredMain = await getWorldStateEvidence(page);
                    expect(restoredMain.hash).toBe(branchBaseState.hash);
                    expect((await getChatSnapshot(page)).messages).toHaveLength(mainLength);
                    report.actions.branch = {
                        turn: turn.turn,
                        branchChatIdSha256: sha256(String(branchChatId)),
                        branchReplySha256: sha256(branchReply.text),
                        branchStateHash: branchState.hash,
                        mainStateHashRestored: restoredMain.hash,
                    };
                    await installEvidenceHooks(page);
                }

                if (turn.turn === PHASE1_RESTART_TURN) {
                    const beforeRestartState = await getWorldStateEvidence(page);
                    const beforeRestartChat = await getChatSnapshot(page);
                    const beforeRestartInspector = await requestInspectorEvidence(page, env.model, env.apiKey);
                    expect(beforeRestartInspector.secretLeakObserved).toBe(false);
                    requestInspectorSegments.push({
                        phase: 'before-restart',
                        evidence: beforeRestartInspector,
                    });
                    await server.restart();
                    await reloadAndAwait(page, server.baseURL);
                    await selectCharacterByName(page, CHARACTER_NAME);
                    const currentChatId = await page.evaluate(() => window.Taverncraft.getContext().getCurrentChatId?.());
                    if (currentChatId !== originalChatId) {
                        await openChatThroughUi(page, originalChatId, { expectedLength: beforeRestartChat.length });
                    }
                    await page.waitForFunction(() => Boolean(window.Taverncraft?.worldEngine), undefined, { timeout: 30_000 });
                    await installEvidenceHooks(page);
                    const afterRestartState = await getWorldStateEvidence(page);
                    const afterRestartChat = await getChatSnapshot(page);
                    expect(afterRestartState.hash).toBe(beforeRestartState.hash);
                    expect(afterRestartChat.messages).toHaveLength(beforeRestartChat.length);
                    report.actions.restart = {
                        turn: turn.turn,
                        stateHash: afterRestartState.hash,
                        chatLength: afterRestartChat.length,
                        characterRestored: true,
                    };
                }

                if (turn.turn === PHASE1_INVALID_OPERATION_TURN) {
                    expect(afterState.hash, 'illegal /__proto__ operation changed authoritative state').toBe(beforeState.hash);
                    report.actions.invalidOperation = {
                        turn: turn.turn,
                        stateHashBefore: beforeState.hash,
                        stateHashAfter: afterState.hash,
                        rejectedWithoutMutation: true,
                    };
                }
            }

            expect(report.turns).toHaveLength(PHASE1_LIVE_TURN_COUNT);
            expect(report.actions.edits).toHaveLength(2);
            expect(report.actions.swipes).toHaveLength(3);
            expect(report.actions.branch).toBeTruthy();
            expect(report.actions.restart).toBeTruthy();
            expect(report.actions.invalidOperation?.rejectedWithoutMutation).toBe(true);

            const finalChat = await getChatSnapshot(page);
            const mainUserTurns = finalChat.messages.filter(message => message?.is_user).length;
            const missingScenarioTurns = PHASE1_LIVE_TURNS
                .filter(turn => !finalChat.messages.some(message => message?.is_user && String(message?.mes || '').startsWith(turn.text)))
                .map(turn => turn.turn);
            report.finalChat = {
                length: finalChat.length,
                mainUserTurns,
                missingScenarioTurns,
            };
            expect(missingScenarioTurns).toEqual([]);
            expect(mainUserTurns).toBe(PHASE1_LIVE_TURN_COUNT);

            report.worldInfo = summarizeWorldInfo(worldInfoEvents);
            const expectedKeywordComments = ['沈慕微', '剑临城', '谢忘生', '药芷若', '姜昭昭', '东海海域'];
            const matchedKeywordComments = expectedKeywordComments.filter(comment => report.worldInfo.keywordEntries.includes(comment));
            expect(matchedKeywordComments.length, `world-book keyword evidence: ${JSON.stringify(report.worldInfo.keywordEntries)}`).toBeGreaterThanOrEqual(2);
            expect(report.worldInfo.constantEntryCount).toBeGreaterThanOrEqual(3);
            expect(report.worldInfo.probabilityCheckedCount).toBeGreaterThanOrEqual(3);
            expect(report.worldInfo.recursionGuardCheckedCount).toBeGreaterThanOrEqual(3);
            report.worldInfo.matchedKeywordComments = matchedKeywordComments;

            report.worldState = await getWorldStateEvidence(page);
            expect(report.worldState.eventCount, `world operation events: ${JSON.stringify(report.worldState)}`).toBeGreaterThanOrEqual(5);

            report.memory = await memoryEvidence(page);
            expect(report.memory.available).toBe(true);
            expect(report.memory.nodeCount).toBeGreaterThan(0);
            for (const fact of report.memory.facts) {
                expect(fact.hitCount, `Memory Graph has no sourced node for ${fact.token}`).toBeGreaterThan(0);
                expect(fact.sources.some(source => source.id)).toBe(true);
            }

            const afterRestartInspector = await requestInspectorEvidence(page, env.model, env.apiKey);
            requestInspectorSegments.push({
                phase: 'after-restart',
                evidence: afterRestartInspector,
            });
            report.requestInspector = mergeRequestInspectorEvidence(requestInspectorSegments);
            expect(report.requestInspector.relevant).toBeGreaterThanOrEqual(PHASE1_LIVE_TURN_COUNT);
            expect(report.requestInspector.invalidAttemptObserved).toBe(true);
            expect(report.requestInspector.worldBookLayerObserved).toBe(true);
            expect(report.requestInspector.secretLeakObserved).toBe(false);

            const bodyTextLeaksKey = await page.locator('body').innerText().then(text => text.includes(env.apiKey));
            expect(bodyTextLeaksKey).toBe(false);
            report.secretLeakFiles = scanIsolatedDataForSecret(server.dataRoot, env.apiKey);
            expect(report.secretLeakFiles).toEqual([]);

            const genericAiReplies = report.turns.filter(turn => !turn.recallToken && turn.assistantChars < 11).length;
            expect(genericAiReplies).toBe(0);
            report.status = 'passed';
        } catch (error) {
            report.status = 'failed';
            const safeMessage = String(error?.message || error).split(env.apiKey).join('[REDACTED]');
            report.error = {
                name: String(error?.name || 'Error'),
                message: safeMessage,
            };
            throw error;
        } finally {
            report.completedAt = new Date().toISOString();
            writeFileSync(reportPath, JSON.stringify(report, null, 2));
            await testInfo.attach('phase1-v4-real-acceptance-report', {
                path: reportPath,
                contentType: 'application/json',
            });
        }
    });
});
