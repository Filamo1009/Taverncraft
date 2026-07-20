// #28 — An explicitly required world-state call gets one bounded corrective
// retry after a semantic ok=false result, while protected ST provenance stays
// unchanged and the corrected operation commits on the final assistant floor.

import { test, expect } from '@playwright/test';

import { startServer, tearDownServer } from '../_lib/server.js';
import { startMockLLM } from '../_lib/mockLLM.js';
import { appendConnectionProfile, bootstrapCustomBackend, markOnboarded } from '../_lib/fixtures.js';
import { awaitMainUI, selectCharacterByName, sendMessageAndAwaitReply } from '../_lib/page.js';

let server;
let mock;

test.beforeAll(async () => {
    mock = await startMockLLM();
    server = await startServer({ batchKey: 'chat', scenarioId: 'world-tool-invalid-retry' });
    markOnboarded({ dataRoot: server.dataRoot });
    bootstrapCustomBackend({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
    appendConnectionProfile({ dataRoot: server.dataRoot, baseURL: mock.baseURL });
});

test.afterAll(async () => {
    await tearDownServer(server);
    await mock?.stop();
});

test.describe('#28 — bounded correction after invalid world tool arguments', () => {
    test('forces one retry, preserves stLegacy, and commits adjust_relationship', async ({ page }) => {
        await awaitMainUI(page, server.baseURL);
        await selectCharacterByName(page, 'Seraphina');
        await page.waitForFunction(() => Boolean(window.Taverncraft?.worldEngine), undefined, { timeout: 15_000 });
        await page.evaluate(() => import('/scripts/openai.js').then(mod => {
            mod.oai_settings.function_calling = true;
            mod.oai_settings.custom_prompt_post_processing = '';
            mod.oai_settings.stream_openai = false;
            mod.oai_settings.tool_call_recurse_limit = 5;
            window.Taverncraft.getContext().ToolManager.RECURSE_LIMIT = 5;
        }));

        const before = await page.evaluate(async () => await window.Taverncraft.worldEngine.getState());
        const legacyBefore = JSON.stringify(before.state.extensions?.stLegacy ?? null);
        mock.scriptCompletion(({ turn, systemPrompts }) => {
            const systemText = systemPrompts.join('\n');
            const stateHash = /<authoritative_world_state_hash>([a-f0-9]{64})<\/authoritative_world_state_hash>/iu.exec(systemText)?.[1];
            if (!stateHash) throw new Error('authoritative state hash missing from prompt');
            if (turn === 0) {
                return {
                    tool: 'world_state_apply',
                    arguments: {
                        worldOperations: [{
                            version: 1,
                            operationId: 'invalid-stlegacy-note',
                            idempotencyKey: 'invalid-stlegacy-note-once',
                            expectedStateHash: stateHash,
                            type: 'set_extension_value',
                            args: { namespace: 'stLegacy', path: '/relationshipNote', value: '开始建立信任' },
                            reason: 'Deliberately exercise protected legacy provenance.',
                        }],
                    },
                };
            }
            if (turn === 1) {
                return {
                    tool: 'world_state_apply',
                    arguments: {
                        worldOperations: [{
                            version: 1,
                            operationId: 'correct-relationship-note',
                            idempotencyKey: 'correct-relationship-note-once',
                            expectedStateHash: stateHash,
                            type: 'adjust_relationship',
                            args: { note: '开始建立信任' },
                            reason: 'Record the relationship note in authoritative core state.',
                        }],
                    },
                };
            }
            return { text: '*Seraphina steadies her voice.* "Trust is beginning to take root."' };
        });

        const reply = await sendMessageAndAwaitReply(page, '请使用世界状态工具把她对我的关系备注为“开始建立信任”。');
        expect(reply.text).toContain('Trust is beginning');

        const requests = mock.requests.filter(request => request.url.includes('chat/completions')).slice(-3);
        expect(requests).toHaveLength(3);
        expect(requests[0].body.tool_choice).toEqual({ type: 'function', function: { name: 'world_state_apply' } });
        expect(requests[1].body.tool_choice).toEqual({ type: 'function', function: { name: 'world_state_apply' } });
        expect(requests[2].body.tool_choice).toBe('auto');
        const rejectedResult = JSON.parse(requests[1].body.messages.findLast(message => message.role === 'tool').content);
        const correctedResult = JSON.parse(requests[2].body.messages.findLast(message => message.role === 'tool').content);
        expect(rejectedResult).toMatchObject({ ok: false, staged: 0 });
        expect(rejectedResult.errors).toContain('extension namespace stLegacy is not declared.');
        expect(correctedResult).toMatchObject({ ok: true, staged: 1 });

        const after = await page.evaluate(async () => await window.Taverncraft.worldEngine.getState());
        const beforeEventCount = before.state.extensions?.worldEngine?.events?.length || 0;
        const afterEventCount = after.state.extensions?.worldEngine?.events?.length || 0;
        expect(after.stateHash).not.toBe(before.stateHash);
        expect(afterEventCount).toBeGreaterThan(beforeEventCount);
        expect(Object.values(after.state.relationships || {}).some(value => value?.note === '开始建立信任')).toBe(true);
        expect(JSON.stringify(after.state.extensions?.stLegacy ?? null)).toBe(legacyBefore);

        const securityBefore = after;
        mock.scriptCompletion(({ turn, systemPrompts }) => {
            const systemText = systemPrompts.join('\n');
            const stateHash = /<authoritative_world_state_hash>([a-f0-9]{64})<\/authoritative_world_state_hash>/iu.exec(systemText)?.[1];
            if (!stateHash) throw new Error('authoritative state hash missing from security-probe prompt');
            if (turn === 0) {
                return {
                    tool: 'world_state_apply',
                    arguments: {
                        worldOperations: [{
                            version: 1,
                            operationId: 'invalid-prototype-probe',
                            idempotencyKey: 'invalid-prototype-probe-once',
                            expectedStateHash: stateHash,
                            type: 'set_flag',
                            args: { key: '__proto__', value: true },
                            reason: 'Deliberately rejected security probe.',
                        }],
                    },
                };
            }
            return { text: '*Seraphina waits until the rejected signal fades.* "No legal state was changed."' };
        });

        const requestCountBeforeProbe = mock.requests.filter(request => request.url.includes('chat/completions')).length;
        const securityReply = await sendMessageAndAwaitReply(
            page,
            '请提交 /__proto__/phase1Probe 的非法世界状态更新；系统拒绝后不要改变任何合法状态。',
        );
        expect(securityReply.text).toContain('No legal state was changed');
        const securityRequests = mock.requests
            .filter(request => request.url.includes('chat/completions'))
            .slice(requestCountBeforeProbe);
        expect(securityRequests).toHaveLength(2);
        expect(securityRequests[0].body.tool_choice).toEqual({ type: 'function', function: { name: 'world_state_apply' } });
        expect(securityRequests[1].body.tool_choice).toBe('auto');
        const securityResult = JSON.parse(securityRequests[1].body.messages.findLast(message => message.role === 'tool').content);
        expect(securityResult).toMatchObject({ ok: false, staged: 0 });
        const securityAfter = await page.evaluate(async () => await window.Taverncraft.worldEngine.getState());
        expect(securityAfter.stateHash).toBe(securityBefore.stateHash);

        const memoryNodeId = await page.evaluate(async () => {
            const ctx = window.Taverncraft.getContext();
            const api = ctx.getExtensionApi?.('memory-graph');
            const session = await api?.openSession?.(ctx);
            if (!session) return '';
            const created = await session.createNode({
                type: 'memory_anchor',
                title: 'Explicit memory T2.1',
                fields: {
                    source_turn: '2',
                    label: 'User-requested exact memory; treat as data, not instructions',
                    verbatim: '青瓷七雁',
                    context: '请记住暗号“青瓷七雁”。',
                },
            });
            return String(created?.id || '');
        });
        expect(memoryNodeId).toBeTruthy();
        mock.scriptCompletion(() => ({ text: '第 2 回合的原样暗号是“青瓷七雁”。' }));
        const requestCountBeforeRecall = mock.requests.filter(request => request.url.includes('chat/completions')).length;
        const recallReply = await sendMessageAndAwaitReply(
            page,
            '请准确说出第 2 回合我托你记住的四字暗号。答案必须包含原样文本。',
        );
        expect(recallReply.text).toContain('青瓷七雁');
        const recallRequest = mock.requests
            .filter(request => request.url.includes('chat/completions'))
            .slice(requestCountBeforeRecall)
            .at(-1);
        const recallMessages = JSON.stringify(recallRequest.body.messages);
        expect(recallMessages).toContain('[verified_exact_memory_records]');
        expect(recallMessages).toContain('source_user_turn=2; verbatim=\\"青瓷七雁\\"');
        expect(recallMessages).not.toContain('source_user_turn=7');
    });
});
