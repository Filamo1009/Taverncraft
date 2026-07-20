// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

const PREVIEW_LIMIT = 8_000;

function contentText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map(part => typeof part === 'string' ? part : String(part?.text || '')).join('\n');
}

export function flattenDryRunPrompt(prompt) {
    if (typeof prompt === 'string') return prompt;
    if (!Array.isArray(prompt)) return '';
    return prompt.map((message, index) => {
        const role = String(message?.role || 'message');
        return `[${index}:${role}]\n${contentText(message?.content)}`;
    }).join('\n\n');
}

export function createDryRunReport({ worldInfo = {}, generationData = {}, state = null } = {}) {
    const before = Array.isArray(worldInfo?.worldInfoBeforeEntries) ? worldInfo.worldInfoBeforeEntries.map(String) : [];
    const after = Array.isArray(worldInfo?.worldInfoAfterEntries) ? worldInfo.worldInfoAfterEntries.map(String) : [];
    const depth = Array.isArray(worldInfo?.worldInfoDepth)
        ? worldInfo.worldInfoDepth.flatMap(bucket => Array.isArray(bucket?.entries) ? bucket.entries.map(String) : [])
        : [];
    const authorBefore = Array.isArray(worldInfo?.anBefore) ? worldInfo.anBefore.map(String) : [];
    const authorAfter = Array.isArray(worldInfo?.anAfter) ? worldInfo.anAfter.map(String) : [];
    const examples = Array.isArray(worldInfo?.worldInfoExamples) ? worldInfo.worldInfoExamples : [];
    const outlets = worldInfo?.outletEntries && typeof worldInfo.outletEntries === 'object'
        ? Object.values(worldInfo.outletEntries).flatMap(entries => Array.isArray(entries) ? entries.map(String) : [])
        : [];
    const activatedEntries = Array.isArray(worldInfo?.activatedEntries) ? worldInfo.activatedEntries : [];
    const routedCount = before.length + after.length + depth.length + authorBefore.length + authorAfter.length + examples.length + outlets.length;
    const promptText = flattenDryRunPrompt(generationData?.prompt);
    return {
        version: 1,
        worldBook: {
            beforeCount: before.length,
            afterCount: after.length,
            depthCount: depth.length,
            authorNoteCount: authorBefore.length + authorAfter.length,
            exampleCount: examples.length,
            outletCount: outlets.length,
            totalCount: activatedEntries.length || routedCount,
            beforePreview: before.slice(0, 20).map(value => value.slice(0, 500)),
            afterPreview: after.slice(0, 20).map(value => value.slice(0, 500)),
            depthPreview: depth.slice(0, 20).map(value => value.slice(0, 500)),
            activatedPreview: activatedEntries.slice(0, 30).map(entry => ({
                world: String(entry?.world || ''),
                uid: Number.isFinite(Number(entry?.uid)) ? Number(entry.uid) : null,
                comment: String(entry?.comment || ''),
                position: Number.isFinite(Number(entry?.position)) ? Number(entry.position) : null,
            })),
            loadError: String(worldInfo?.diagnostics?.loadError || ''),
        },
        prompt: {
            kind: Array.isArray(generationData?.prompt) ? 'messages' : typeof generationData?.prompt,
            charLength: promptText.length,
            preview: promptText.slice(0, PREVIEW_LIMIT),
            previewTruncated: promptText.length > PREVIEW_LIMIT,
        },
        state: state ? {
            turn: Number(state.clock?.turn) || 0,
            time: String(state.clock?.label || ''),
            location: String(state.location?.current || ''),
            npc: String(state.npc?.name || ''),
        } : null,
    };
}
