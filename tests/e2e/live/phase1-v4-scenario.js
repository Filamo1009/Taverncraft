// SPDX-License-Identifier: AGPL-3.0-or-later
// Deterministic scenario manifest for the Phase 1 real-model acceptance run.

export const PHASE1_LIVE_TURN_COUNT = 50;

export const PHASE1_LIVE_FACTS = Object.freeze([
    { introducedTurn: 2, recallTurn: 35, token: '青瓷七雁' },
    { introducedTurn: 7, recallTurn: 40, token: '落梅三钱' },
    { introducedTurn: 14, recallTurn: 47, token: '东堤蓝灯三' },
]);

export const PHASE1_WORLD_OPERATION_TURNS = Object.freeze([3, 9, 15, 21, 28]);
export const PHASE1_KEYWORD_TURNS = Object.freeze([1, 4, 8, 12, 16, 20]);
export const PHASE1_EDIT_TURNS = Object.freeze([10, 24]);
export const PHASE1_SWIPE_TURNS = Object.freeze([18, 30, 42]);
export const PHASE1_BRANCH_TURN = 26;
export const PHASE1_RESTART_TURN = 32;
export const PHASE1_INVALID_OPERATION_TURN = 33;

export function mergeRequestInspectorEvidence(segments) {
    const safeSegments = Array.isArray(segments) ? segments.filter(Boolean) : [];
    const requestsById = new Map();
    for (const segment of safeSegments) {
        for (const request of segment.evidence?.requests || []) {
            const id = String(request?.id || '');
            if (!id) continue;
            requestsById.set(id, { ...request, phase: segment.phase });
        }
    }
    const requests = [...requestsById.values()];
    return {
        total: safeSegments.reduce((sum, segment) => sum + Number(segment.evidence?.total || 0), 0),
        relevant: requests.length,
        completed: requests.filter(request => request.status === 'completed' || request.status === 'success').length,
        failed: requests.filter(request => request.status === 'failed' || request.status === 'error').length,
        invalidAttemptObserved: safeSegments.some(segment => segment.evidence?.invalidAttemptObserved),
        worldBookLayerObserved: safeSegments.some(segment => segment.evidence?.worldBookLayerObserved),
        secretLeakObserved: safeSegments.some(segment => segment.evidence?.secretLeakObserved),
        segments: safeSegments.map(segment => ({
            phase: segment.phase,
            total: segment.evidence?.total || 0,
            relevant: segment.evidence?.relevant || 0,
            completed: segment.evidence?.completed || 0,
            failed: segment.evidence?.failed || 0,
        })),
        requests,
    };
}

const TURN_TEXT = [
    '我在天剑宗祖师祠堂醒来，先询问沈慕微此刻的处境与小寒山的规矩。请保持沉浸式剧情。',
    '我把只属于我们这段旅程的暗号“青瓷七雁”告诉沈慕微，请她记住，但在我再次询问前不要主动复述。',
    '我拾起案边的青纹玉简并贴身收好。请使用可用的世界状态工具正式记录物品“青纹玉简”，不要只在正文叙述。',
    '我提议下山去剑临城西城的桂花糕铺，并询问修士坊市今晚是否仍开门。',
    '沿石阶下山时，我观察沈慕微的神色，询问她为何愿意同行。',
    '我在山门前停下，确认路线、距离与是否需要准备灵石路费。',
    '我提醒她：谢忘生曾欠我“落梅三钱”，这是三枚刻落梅纹的铜钱。请记住，在我再次询问前不要主动复述。',
    '途中谈起玄清宗后山试验药田与谢忘生，问那里的悟道场是否真的安全。',
    '我们抵达剑临城西门。请使用世界状态工具把玩家与当前 NPC 的地点更新为“剑临城·西城门”。',
    '我改口说先不进桂花糕铺，转而观察西城门守卫与来往商队。',
    '我向沈慕微打听无情道弟子江念最近是否回过月微居。',
    '我们走进修士坊市，我询问一枚普通疗伤丹与传送阵路费的合理价格。',
    '我提议去丹霞谷百草城寻找药芷若，请沈慕微判断炼丹师是否会接这桩委托。',
    '我与她约定：若抵达潮音港，就在“东堤蓝灯三”会合，也就是东堤第三盏蓝灯。请记住，在我再次询问前不要主动复述。',
    '沈慕微替我挡开拥挤的人流，我真诚道谢。请用世界状态工具把她对我的关系备注为“开始建立信任”。',
    '我询问承安皇朝长公主姜昭昭与听风楼最近在追查什么消息。',
    '我们在醉仙楼短暂歇脚，我请她描述窗外剑临城的夜色与人声。',
    '我对她上一段回应仍有疑问，请从另一个角度重述眼前线索，保持人物性格与已发生事实。',
    '我检查青纹玉简有无暗纹，并询问它可能属于哪个宗门。',
    '我展开苍玄界地图，询问从剑临城前往东海潮音港的路线、距离与跨域传送选择。',
    '我决定把“查明青纹玉简来历”作为当前任务。请使用世界状态工具新增并激活这项任务。',
    '我询问若经过太虚观，萧天衍的观星台是否愿意替陌生人推演来历。',
    '我留意沈慕微是否回避某些问题，并温和地追问她与玉简是否早有渊源。',
    '我在坊市买下一包桂花糕，分她一半，继续向传送阵方向走。',
    '我请她总结目前最可信的三条线索，但不要替我做最终选择。',
    '我在传送阵前停下，问她若此刻改走玄清宗支线，会带来什么不同后果。',
    '我确认仍沿主线前往潮音港，请她留意是否有人跟踪我们。',
    '我发现青纹玉简边缘浮出一枚潮纹。请使用世界状态工具设置标记“jadeSlipTideMarkSeen”为 true。',
    '我询问潮纹是否与沧溟海阙、海图司或潮听澜有关。',
    '我对她的推断提出另一种解释，请生成一个不同但不推翻既有事实的版本。',
    '传送前我清点物品、任务和当前位置，请她指出任何互相矛盾之处。',
    '阵光亮起前，我握紧青纹玉简，请她记住我们是从剑临城西城门一路查到这里。',
    '进行一次安全容错检查：请先尝试提交路径“/__proto__/phase1Probe”的非法世界状态更新；系统拒绝后继续正常叙事，不要改变任何合法状态。',
    '阵光散去后，我确认我们是否已经靠近东海，以及沈慕微是否仍在身边。',
    '不要查阅我刚才的原话：请准确说出第 2 回合我托你记住的四字暗号。答案必须包含原样文本。',
    '我询问潮音港飞舟港与海贸区的夜间规矩，准备寻找落脚处。',
    '我观察港口潮位、船灯和守卫布置，判断是否适合公开展示青纹玉简。',
    '我请沈慕微复盘从祖师祠堂到潮音港之间，我们关系发生了哪些可信变化。',
    '我听见远处有人谈论归墟潮眼与海底古仙宫，问她这是否可能与潮纹有关。',
    '请准确说出第 7 回合那笔旧债的记忆代号，答案必须包含原样文本，并说明它代表什么。',
    '我提出去鲛珠礁市打听玉简，请她评估鲛人海市的交易风险。',
    '我对上一段计划不满意，请给出另一种行动方案，同时保留目前世界状态与任务。',
    '我询问若请潮听澜或海图司介入，会不会惊动沧溟海阙内部的人。',
    '我决定先隐藏玉简，只以潮纹拓印试探消息，并请沈慕微配合。',
    '我让她检查当前任务是否仍是“查明青纹玉简来历”，以及我们是否遗漏任何关键约定。',
    '海风变强，我带她走向约定的东堤，沿途观察第三盏灯是否与其他灯颜色不同。',
    '请准确说出第 14 回合约定的会合记忆代号，答案必须包含原样文本，并解释具体地点。',
    '我在第三盏蓝灯下等待，询问沈慕微是否察觉有人比我们更早到过。',
    '我请她把青纹玉简、潮纹、三条长期约定与当前任务串成一份不自相矛盾的调查摘要。',
    '这是第 50 回合：我暂不揭开来客身份，请沈慕微给出下一幕的两个合理选择，并保持角色、世界设定、Persona 与权威世界状态一致。',
];

export const PHASE1_LIVE_TURNS = Object.freeze(TURN_TEXT.map((text, index) => Object.freeze({
    turn: index + 1,
    text,
    keywordProbe: PHASE1_KEYWORD_TURNS.includes(index + 1),
    worldOperationProbe: PHASE1_WORLD_OPERATION_TURNS.includes(index + 1),
    recallToken: PHASE1_LIVE_FACTS.find(fact => fact.recallTurn === index + 1)?.token || null,
})));

export function validatePhase1LiveScenario() {
    const errors = [];
    if (PHASE1_LIVE_TURNS.length !== PHASE1_LIVE_TURN_COUNT) {
        errors.push(`expected ${PHASE1_LIVE_TURN_COUNT} turns, got ${PHASE1_LIVE_TURNS.length}`);
    }
    if (!PHASE1_LIVE_TURNS.every((turn, index) => turn.turn === index + 1 && turn.text.trim())) {
        errors.push('turn numbering/text is invalid');
    }
    if (PHASE1_KEYWORD_TURNS.length < 5) errors.push('fewer than five keyword probes');
    if (PHASE1_WORLD_OPERATION_TURNS.length < 5) errors.push('fewer than five world-operation probes');
    if (PHASE1_EDIT_TURNS.length < 2) errors.push('fewer than two edit probes');
    if (PHASE1_SWIPE_TURNS.length < 3) errors.push('fewer than three swipe probes');
    for (const fact of PHASE1_LIVE_FACTS) {
        if (fact.recallTurn - fact.introducedTurn < 30) {
            errors.push(`fact ${fact.token} is recalled fewer than 30 turns later`);
        }
        const recall = PHASE1_LIVE_TURNS[fact.recallTurn - 1];
        if (!recall?.text.includes(fact.token) && recall?.recallToken !== fact.token) {
            errors.push(`fact ${fact.token} has no recall assertion`);
        }
    }
    return errors;
}
