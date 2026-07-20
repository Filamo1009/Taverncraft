// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Prompt-layer diagnostics for Request Inspector.
 *
 * This module deliberately keeps snapshots in a WeakMap instead of adding
 * enumerable properties to the messages array. The diagnostic payload is
 * therefore opt-in at the request boundary and can never become an upstream
 * provider field by accident.
 */

const snapshotsByMessages = new WeakMap();
const PREVIEW_LIMIT = 4096;

const PROMPT_LABELS = Object.freeze({
    main: 'Main / System Prompt',
    worldInfoBefore: 'World Book (before)',
    worldInfoAfter: 'World Book (after)',
    charDescription: 'Character Description',
    charPersonality: 'Character Personality',
    scenario: 'Scenario',
    personaDescription: 'Persona',
    dialogueExamples: 'Dialogue Examples',
    chatHistory: 'Chat History',
    vectorsMemory: 'Long Memory',
    vectorsDataBank: 'Data Bank Memory',
    smartContext: 'Smart Context',
    authorsNote: 'Author\'s Note',
    jailbreak: 'Post-History / Jailbreak',
    nsfw: 'NSFW Prompt',
    controlPrompts: 'Control Prompts',
    quietPrompt: 'Quiet Prompt',
    impersonate: 'Impersonation Prompt',
});

function asFiniteInteger(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : fallback;
}

function contentToText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map(part => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (part?.type === 'image_url' || part?.type === 'image') return '[image]';
        if (part?.type === 'video_url') return '[video]';
        if (part?.type === 'audio_url') return '[audio]';
        return '';
    }).join('\n');
}

function previewText(text) {
    const value = String(text || '');
    return {
        preview: value.slice(0, PREVIEW_LIMIT),
        previewTruncated: value.length > PREVIEW_LIMIT,
        charLength: value.length,
    };
}

function getCategory(identifier, collection) {
    const id = String(identifier || '');
    const parent = String(collection || '');
    if (parent === 'chatHistory' || /^chatHistory-/.test(id)) return 'chat_history';
    if (parent === 'dialogueExamples' || /^dialogueExamples/.test(id)) return 'dialogue_examples';
    if (/^worldInfo(Before|After)/.test(parent) || /^worldInfo(Before|After)/.test(id)) return 'world_book';
    if (['charDescription', 'charPersonality', 'scenario'].includes(parent) || ['charDescription', 'charPersonality', 'scenario'].includes(id)) return 'character_card';
    if (parent === 'personaDescription' || id === 'personaDescription') return 'persona';
    if (/vectors|memory|smartContext/i.test(`${parent} ${id}`)) return 'memory';
    if (/jailbreak|post.?history|nsfw/i.test(`${parent} ${id}`)) return 'post_history';
    if (/world_engine_authoritative_state/i.test(`${parent} ${id}`)) return 'world_state';
    if (parent === 'controlPrompts') return 'control';
    return 'prompt';
}

function labelFor(identifier, collection) {
    const id = String(identifier || '');
    const parent = String(collection || '');
    if (PROMPT_LABELS[id]) return PROMPT_LABELS[id];
    if (PROMPT_LABELS[parent]) return PROMPT_LABELS[parent];
    if (/^worldInfoBefore-/.test(id)) return 'World Book Entry (before)';
    if (/^worldInfoAfter-/.test(id)) return 'World Book Entry (after)';
    if (/^chatHistory-/.test(id)) return 'Chat Message';
    return id || parent || 'Prompt Layer';
}

function flattenMessageTree(root) {
    const layers = [];
    let messageIndex = 0;

    function visit(node, collection = 'root', path = []) {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node.collection)) {
            const nextCollection = String(node.identifier || collection || 'root');
            const nextPath = nextCollection === 'root' ? path : [...path, nextCollection];
            for (const child of node.collection) visit(child, nextCollection, nextPath);
            return;
        }

        const text = contentToText(node.content);
        const identifier = String(node.identifier || '');
        const meta = previewText(text);
        layers.push({
            order: layers.length,
            messageIndex: messageIndex++,
            identifier,
            label: labelFor(identifier, collection),
            collection: String(collection || 'root'),
            path: path.map(String),
            category: getCategory(identifier, collection),
            role: String(node.role || 'system'),
            estimatedTokens: Math.max(0, asFiniteInteger(typeof node.getTokens === 'function' ? node.getTokens() : node.tokens)),
            ...meta,
        });
    }

    visit(root);
    return layers;
}

function roleName(role) {
    switch (Number(role)) {
        case 1: return 'user';
        case 2: return 'assistant';
        default: return 'system';
    }
}

function buildInChatExtensionLayers(extensionPrompts, layers, substitute) {
    if (!extensionPrompts || typeof extensionPrompts !== 'object') return [];
    const result = [];
    const finalTexts = layers.map(layer => String(layer.preview || ''));

    for (const key of Object.keys(extensionPrompts).sort()) {
        const prompt = extensionPrompts[key];
        if (!prompt || Number(prompt.position) !== 1 || !prompt.value) continue;
        let content = String(prompt.value);
        try {
            content = typeof substitute === 'function' ? String(substitute(content)) : content;
        } catch {
            // Diagnostics must never break generation. Preserve the raw value.
        }
        content = content.trim();
        if (!content) continue;

        const needle = content.slice(0, Math.min(content.length, PREVIEW_LIMIT));
        const messageIndex = finalTexts.findIndex(text => text.includes(needle));
        const category = /world_engine_authoritative_state/i.test(key)
            ? 'world_state'
            : (/world_engine_post_history|jailbreak|post.?history/i.test(key) ? 'post_history' : 'extension');
        const diagnostics = prompt.diagnostics && typeof prompt.diagnostics === 'object'
            ? prompt.diagnostics
            : {};
        result.push({
            order: result.length,
            messageIndex,
            identifier: String(key),
            label: key === 'world_engine_authoritative_state'
                ? 'World Engine Authoritative State'
                : (key === 'world_engine_post_history' ? 'World Engine Post-History' : String(key)),
            category,
            role: roleName(prompt.role),
            position: 'in_chat',
            depth: Math.max(0, asFiniteInteger(prompt.depth)),
            sourceScope: String(diagnostics.sourceScope || '').slice(0, 64),
            sourceLabel: String(diagnostics.sourceLabel || '').slice(0, 256),
            configurationMode: String(diagnostics.configurationMode || '').slice(0, 32),
            ...previewText(content),
        });
    }
    return result;
}

/**
 * Create a serializable prompt-layer snapshot before optional system-message
 * squashing destroys individual identifiers.
 */
export function createPromptLayerSnapshot({
    messageTree,
    finalMessages = [],
    sourceMessages = [],
    extensionPrompts = {},
    contextTokens = 0,
    completionReserve = 0,
    remainingTokens = 0,
    substitute = null,
} = {}) {
    const layers = flattenMessageTree(messageTree);
    const sourceHistoryMessages = Array.isArray(sourceMessages)
        ? sourceMessages.filter(message => ['user', 'assistant', 'tool'].includes(String(message?.role || ''))).length
        : 0;
    const includedHistoryMessages = layers.filter(layer => layer.category === 'chat_history' && ['user', 'assistant', 'tool'].includes(layer.role)).length;
    const omittedHistoryMessages = Math.max(0, sourceHistoryMessages - includedHistoryMessages);
    const promptBudget = Math.max(0, asFiniteInteger(contextTokens) - asFiniteInteger(completionReserve));
    const estimatedPromptTokens = layers.reduce((sum, layer) => sum + layer.estimatedTokens, 0);

    return {
        version: 1,
        assembly: {
            contextTokens: Math.max(0, asFiniteInteger(contextTokens)),
            completionReserve: Math.max(0, asFiniteInteger(completionReserve)),
            promptBudget,
            estimatedPromptTokens,
            remainingTokens: asFiniteInteger(remainingTokens),
            sourceHistoryMessages,
            includedHistoryMessages,
            omittedHistoryMessages,
            preSquashMessageCount: layers.length,
            finalMessageCount: Array.isArray(finalMessages) ? finalMessages.length : layers.length,
            squashedSystemMessages: false,
        },
        truncation: {
            applied: omittedHistoryMessages > 0,
            omittedHistoryMessages,
            reason: omittedHistoryMessages > 0 ? 'context_budget' : '',
        },
        layers,
        inChatExtensions: buildInChatExtensionLayers(extensionPrompts, layers, substitute),
    };
}

export function finalizePromptLayerSnapshot(snapshot, finalMessages, { squashedSystemMessages = false } = {}) {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    snapshot.assembly.finalMessageCount = Array.isArray(finalMessages)
        ? finalMessages.length
        : snapshot.assembly.preSquashMessageCount;
    snapshot.assembly.squashedSystemMessages = Boolean(squashedSystemMessages);
    return snapshot;
}

export function rememberPromptLayerSnapshot(messages, snapshot) {
    if (!Array.isArray(messages) || !snapshot) return;
    snapshotsByMessages.set(messages, snapshot);
}

export function getPromptLayerSnapshot(messages) {
    return Array.isArray(messages) ? snapshotsByMessages.get(messages) || null : null;
}
