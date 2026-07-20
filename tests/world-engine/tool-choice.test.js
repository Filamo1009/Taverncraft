import { describe, expect, test } from '@jest/globals';

import { getWorldStateApplyToolChoice } from '../../public/scripts/extensions/world-engine/tool-choice.js';

const FORCED = { type: 'function', function: { name: 'world_state_apply' } };

function requestWithTail(...tail) {
    return {
        messages: [
            { role: 'user', content: '请使用世界状态工具记录这次关系变化。' },
            ...tail,
        ],
    };
}

describe('World Engine per-request tool choice', () => {
    test('forces the first explicit world-state request', () => {
        expect(getWorldStateApplyToolChoice(requestWithTail())).toEqual(FORCED);
    });

    test('forces exactly one correction after an ok=false tool result', () => {
        const firstFailure = requestWithTail(
            {
                role: 'assistant',
                tool_calls: [{ id: 'call-1', function: { name: 'world_state_apply', arguments: '{}' } }],
            },
            {
                role: 'tool',
                tool_call_id: 'call-1',
                content: JSON.stringify({ ok: false, staged: 0, errors: ['extension namespace stLegacy is not declared.'] }),
            },
        );
        expect(getWorldStateApplyToolChoice(firstFailure)).toEqual(FORCED);

        firstFailure.messages.push(
            {
                role: 'assistant',
                tool_calls: [{ id: 'call-2', function: { name: 'world_state_apply', arguments: '{}' } }],
            },
            { role: 'tool', tool_call_id: 'call-2', content: JSON.stringify({ ok: false, staged: 0 }) },
        );
        expect(getWorldStateApplyToolChoice(firstFailure)).toBeNull();
    });

    test('does not retry a successful call or force unrelated dialogue', () => {
        expect(getWorldStateApplyToolChoice(requestWithTail(
            {
                role: 'assistant',
                tool_calls: [{ id: 'call-1', function: { name: 'world_state_apply', arguments: '{}' } }],
            },
            { role: 'tool', tool_call_id: 'call-1', content: { ok: true, staged: 1 } },
        ))).toBeNull();
        expect(getWorldStateApplyToolChoice({
            messages: [{ role: 'user', content: '继续描述港口的风景。' }],
        })).toBeNull();
    });

    test('does not correct an explicitly rejected security probe into a legal mutation', () => {
        const request = {
            messages: [
                {
                    role: 'user',
                    content: '请提交 /__proto__/phase1Probe 的非法世界状态更新；系统拒绝后不要改变任何合法状态。',
                },
                {
                    role: 'assistant',
                    tool_calls: [{ id: 'security-call', function: { name: 'world_state_apply', arguments: '{}' } }],
                },
                {
                    role: 'tool',
                    tool_call_id: 'security-call',
                    content: JSON.stringify({ ok: false, staged: 0, errors: ['unsafe path'] }),
                },
            ],
        };
        expect(getWorldStateApplyToolChoice(request)).toBeNull();
    });
});
