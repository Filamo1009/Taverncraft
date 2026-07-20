// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

const EXPLICIT_WORLD_STATE_REQUEST = /(?:世界状态|世界狀態|world[\s_-]*state)/iu;
const EXPLICIT_WORLD_STATE_ACTION = /(?:请|請|使用|调用|調用|更新|记录|記錄|提交|use|call|apply|update|record|persist)/iu;
const EXPECTED_SECURITY_REJECTION = /(?:__proto__|\bprototype\b|\bconstructor\b)|(?:(?:非法|无效|無效|不安全|invalid|unsafe).*(?:拒绝|拒絕|reject|不改变|不改變|no\s+change))/iu;

function messageText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(part => typeof part === 'string' ? part : String(part?.text || part?.content || '')).join(' ');
    }
    if (content && typeof content === 'object') return JSON.stringify(content);
    return '';
}

function parseToolResult(content) {
    if (content && typeof content === 'object' && !Array.isArray(content)) return content;
    const text = messageText(content).trim();
    if (!text) return null;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return /(?:"ok"\s*:\s*false|\bok\s*=\s*false\b)/iu.test(text) ? { ok: false } : null;
    }
}

function toolCalls(message, toolName) {
    return Array.isArray(message?.tool_calls)
        ? message.tool_calls.filter(call => call?.function?.name === toolName)
        : [];
}

export function getWorldStateApplyToolChoice(data, toolName = 'world_state_apply') {
    const messages = Array.isArray(data?.messages) ? data.messages : [];
    const lastUserIndex = messages.findLastIndex(message => message?.role === 'user');
    if (lastUserIndex < 0) return null;
    const userText = messageText(messages[lastUserIndex]?.content);
    const explicitlyRequestsWorldState = EXPLICIT_WORLD_STATE_REQUEST.test(userText)
        && EXPLICIT_WORLD_STATE_ACTION.test(userText);
    if (!explicitlyRequestsWorldState) return null;

    const forceChoice = { type: 'function', function: { name: toolName } };
    const tail = messages.slice(lastUserIndex + 1);
    const attempts = [];
    tail.forEach((message, index) => {
        for (const call of toolCalls(message, toolName)) attempts.push({ call, index });
    });
    if (attempts.length === 0) return forceChoice;
    if (attempts.length !== 1) return null;
    if (EXPECTED_SECURITY_REJECTION.test(userText)) return null;

    const attempt = attempts[0];
    const callId = String(attempt.call?.id || '');
    const followingToolMessages = tail.slice(attempt.index + 1).filter(message => message?.role === 'tool');
    const matchingResult = followingToolMessages.find(message => callId && String(message?.tool_call_id || message?.identifier || '') === callId)
        || followingToolMessages.at(-1);
    const result = parseToolResult(matchingResult?.content);
    return result?.ok === false ? forceChoice : null;
}
