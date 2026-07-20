// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

import { DEFAULT_POST_HISTORY_PROMPT } from './prompt.js';

export const POST_HISTORY_EXPORT_SCHEMA = 'world-engine-post-history-config-v1';
export const POST_HISTORY_SCOPE_ORDER = Object.freeze(['global', 'model', 'character', 'chat']);
export const POST_HISTORY_MODES = Object.freeze(['inherit', 'off', 'example', 'custom']);

const MAX_PROMPT_LENGTH = 100_000;

function cleanText(value, maxLength = MAX_PROMPT_LENGTH) {
    return String(value ?? '').slice(0, maxLength);
}

function isRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/**
 * Normalize current and legacy Post-History settings into one portable shape.
 * Legacy `{ enabled, prompt }` values are accepted so existing installations
 * migrate without silently enabling a previously disabled layer.
 */
export function normalizePostHistoryOverride(value, { fallbackMode = 'inherit' } = {}) {
    const source = isRecord(value) ? value : {};
    let mode = cleanText(source.mode, 32).toLowerCase();

    if (!POST_HISTORY_MODES.includes(mode)) {
        if (source.enabled === true) {
            mode = 'custom';
        } else if (source.enabled === false) {
            mode = 'off';
        } else {
            mode = POST_HISTORY_MODES.includes(fallbackMode) ? fallbackMode : 'inherit';
        }
    }

    return {
        mode,
        prompt: cleanText(source.prompt),
    };
}

/**
 * Resolve scopes from lowest to highest precedence. `inherit` is transparent;
 * the highest non-inherit value becomes the effective configuration.
 */
export function resolvePostHistoryConfiguration(scopes = {}) {
    const normalizedScopes = {};
    let selected = null;

    for (const scope of POST_HISTORY_SCOPE_ORDER) {
        const entry = isRecord(scopes?.[scope]) ? scopes[scope] : {};
        const configuration = normalizePostHistoryOverride(entry.configuration ?? entry);
        const label = cleanText(entry.label || scope, 256);
        normalizedScopes[scope] = { configuration, label };
        if (configuration.mode !== 'inherit') {
            selected = { scope, label, configuration };
        }
    }

    selected ??= {
        scope: 'builtin',
        label: 'Built-in Off',
        configuration: { mode: 'off', prompt: '' },
    };

    const mode = selected.configuration.mode;
    const prompt = mode === 'example'
        ? DEFAULT_POST_HISTORY_PROMPT
        : (mode === 'custom' ? selected.configuration.prompt : '');

    return {
        enabled: (mode === 'example' || mode === 'custom') && Boolean(prompt.trim()),
        mode,
        prompt,
        sourceScope: selected.scope,
        sourceLabel: selected.label,
        scopes: normalizedScopes,
    };
}

/**
 * Lightweight UI estimate only. Request Inspector reports the tokenizer-backed
 * value used during real prompt assembly.
 */
export function estimatePostHistoryTokens(text) {
    let ascii = 0;
    let nonAscii = 0;
    for (const character of String(text || '')) {
        if (character.codePointAt(0) <= 0x7f) ascii++;
        else nonAscii++;
    }
    return Math.ceil(ascii / 4 + nonAscii);
}

export function createPostHistoryExport({ scope, configuration, source = {} } = {}) {
    const normalizedScope = POST_HISTORY_SCOPE_ORDER.includes(scope) ? scope : 'global';
    const safeSource = isRecord(source) ? source : {};
    return {
        schema: POST_HISTORY_EXPORT_SCHEMA,
        version: 1,
        scope: normalizedScope,
        source: {
            label: cleanText(safeSource.label, 256),
            id: cleanText(safeSource.id, 512),
        },
        configuration: normalizePostHistoryOverride(configuration, { fallbackMode: 'off' }),
    };
}

export function parsePostHistoryExport(input) {
    let parsed = input;
    if (typeof input === 'string') {
        try {
            parsed = JSON.parse(input);
        } catch (error) {
            return { ok: false, error: `Invalid JSON: ${String(error?.message || error)}` };
        }
    }
    if (!isRecord(parsed) || parsed.schema !== POST_HISTORY_EXPORT_SCHEMA || Number(parsed.version) !== 1) {
        return { ok: false, error: `Expected ${POST_HISTORY_EXPORT_SCHEMA}.` };
    }
    if (!POST_HISTORY_SCOPE_ORDER.includes(parsed.scope)) {
        return { ok: false, error: 'The exported scope is invalid.' };
    }
    if (!isRecord(parsed.configuration) || !POST_HISTORY_MODES.includes(cleanText(parsed.configuration.mode, 32).toLowerCase())) {
        return { ok: false, error: 'The exported mode is invalid.' };
    }
    const configuration = normalizePostHistoryOverride(parsed.configuration);
    return {
        ok: true,
        value: createPostHistoryExport({
            scope: parsed.scope,
            configuration,
            source: parsed.source,
        }),
    };
}
