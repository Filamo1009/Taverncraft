// SPDX-License-Identifier: AGPL-3.0-or-later
// Build a credential-free, reproducible evidence bundle from a passed Phase 1 report.

import crypto from 'node:crypto';
import {
    copyFileSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';

import {
    PHASE1_EDIT_TURNS,
    PHASE1_LIVE_TURNS,
    PHASE1_SWIPE_TURNS,
} from './phase1-v4-scenario.js';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index], process.argv[index + 1]);
}

const reportPath = resolve(args.get('--report') || '');
const openingPath = resolve(args.get('--opening') || '');
const outDir = resolve(args.get('--out') || '');
if (!args.get('--report') || !args.get('--opening') || !args.get('--out')) {
    throw new Error('Usage: node export-phase1-v4-analysis.mjs --report <passed-report.json> --opening <chat.jsonl> --out <directory>');
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
if (report.status !== 'passed' || report.turns?.length !== PHASE1_LIVE_TURNS.length) {
    throw new Error('The selected report is not a passed 50-turn Phase 1 report.');
}

const openingRecords = readFileSync(openingPath, 'utf8')
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(line => JSON.parse(line));
const openingMessage = openingRecords.find(record => !record?.is_user && typeof record?.mes === 'string' && record.mes.length > 100);
if (!openingMessage) throw new Error('No retained long opening message was found.');

mkdirSync(outDir, { recursive: true });

const STATIC_PROMPT_CHARS_FROM_DRY_RUN = 18_737;
const OUTPUT_CAP = Number(report.provider?.maxTokens || 1_800);
const CONTEXT_CAP = Number(report.provider?.maxContext || 65_536);
const REQUEST_MULTIPLIER = Number(report.requestInspector?.relevant || 0) / report.turns.length;
const USER_EDIT_SUFFIX = '\n（历史修订：守卫披着灰蓝斗篷。）';
const ASSISTANT_EDIT_SUFFIX = '\n\n（历史修订标记：不改变既有事实。）';

// Current DeepSeek V4 Flash prices captured from the official documentation on 2026-07-20.
const PRICE = Object.freeze({
    cny: { inputCacheHit: 0.02, inputCacheMiss: 1, output: 2 },
    usd: { inputCacheHit: 0.0028, inputCacheMiss: 0.14, output: 0.28 },
});

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function round(value, digits = 0) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function countTextClasses(text) {
    let cjk = 0;
    let ascii = 0;
    let other = 0;
    for (const char of [...String(text)]) {
        if (/\p{Script=Han}/u.test(char)) cjk += 1;
        else if (char.codePointAt(0) <= 0x7f) ascii += 1;
        else other += 1;
    }
    return { cjk, ascii, other, chars: cjk + ascii + other };
}

function estimateKnownTextTokens(text) {
    const classes = countTextClasses(text);
    const point = classes.cjk * 0.6 + classes.ascii * 0.3 + classes.other * 0.6;
    return {
        ...classes,
        low: Math.max(1, Math.round(point * 0.8)),
        point: Math.max(1, Math.round(point)),
        high: Math.max(1, Math.round(point * 1.25)),
    };
}

function estimateUnknownChineseReplyTokens(chars) {
    return {
        low: Math.max(1, Math.round(chars * 0.45)),
        point: Math.max(1, Math.round(chars * 0.6)),
        high: Math.max(1, Math.round(chars * 0.8)),
    };
}

function money(tokens, perMillion) {
    return round((tokens / 1_000_000) * perMillion, 6);
}

function csvCell(value) {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows, columns) {
    return [columns.join(','), ...rows.map(row => columns.map(column => csvCell(row[column])).join(','))].join('\n') + '\n';
}

const swipeByTurn = new Map((report.actions?.swipes || []).map(item => [Number(item.turn), item]));
const reportByTurn = new Map(report.turns.map(item => [Number(item.turn), item]));

let historyLow = estimateUnknownChineseReplyTokens(openingMessage.mes.length).low;
let historyPoint = estimateUnknownChineseReplyTokens(openingMessage.mes.length).point;
let historyHigh = estimateUnknownChineseReplyTokens(openingMessage.mes.length).high;

const staticLow = Math.round(STATIC_PROMPT_CHARS_FROM_DRY_RUN * 0.3);
const staticPoint = Math.round(STATIC_PROMPT_CHARS_FROM_DRY_RUN * 0.45);
const staticHigh = Math.round(STATIC_PROMPT_CHARS_FROM_DRY_RUN * 0.6);
const rows = [];

for (const scenarioTurn of PHASE1_LIVE_TURNS) {
    const evidence = reportByTurn.get(scenarioTurn.turn);
    if (!evidence) throw new Error(`Missing report evidence for turn ${scenarioTurn.turn}`);

    const effectiveUserText = scenarioTurn.turn === PHASE1_EDIT_TURNS[0]
        ? `${scenarioTurn.text}${USER_EDIT_SUFFIX}`
        : scenarioTurn.text;
    const userEstimate = estimateKnownTextTokens(effectiveUserText);
    const initialAssistant = estimateUnknownChineseReplyTokens(Number(evidence.assistantChars || 0));
    const swipe = swipeByTurn.get(scenarioTurn.turn);
    const swipeAssistant = swipe ? estimateUnknownChineseReplyTokens(Number(swipe.assistantChars || 0)) : null;
    const knownGeneratedOutput = {
        low: initialAssistant.low + (swipeAssistant?.low || 0),
        point: initialAssistant.point + (swipeAssistant?.point || 0),
        high: initialAssistant.high + (swipeAssistant?.high || 0),
    };

    const promptHistoryLow = historyLow + userEstimate.low;
    const promptHistoryPoint = historyPoint + userEstimate.point;
    const promptHistoryHigh = historyHigh + userEstimate.high;
    const fullPromptLow = staticLow + promptHistoryLow;
    const fullPromptPoint = staticPoint + promptHistoryPoint;
    const fullPromptHigh = staticHigh + promptHistoryHigh;

    const mainCostCnyHit = money(fullPromptPoint, PRICE.cny.inputCacheHit) + money(knownGeneratedOutput.point, PRICE.cny.output);
    const mainCostCnyMiss = money(fullPromptPoint, PRICE.cny.inputCacheMiss) + money(knownGeneratedOutput.point, PRICE.cny.output);
    const mainCostUsdHit = money(fullPromptPoint, PRICE.usd.inputCacheHit) + money(knownGeneratedOutput.point, PRICE.usd.output);
    const mainCostUsdMiss = money(fullPromptPoint, PRICE.usd.inputCacheMiss) + money(knownGeneratedOutput.point, PRICE.usd.output);

    rows.push({
        turn: scenarioTurn.turn,
        user_text: scenarioTurn.text,
        user_chars: evidence.userChars,
        estimated_user_tokens: userEstimate.point,
        assistant_text_recoverable: false,
        assistant_sha256: evidence.assistantSha256,
        assistant_chars_initial: evidence.assistantChars,
        swipe_generated: Boolean(swipe),
        assistant_chars_swipe: swipe?.assistantChars || 0,
        estimated_known_output_tokens_low: knownGeneratedOutput.low,
        estimated_known_output_tokens_point: knownGeneratedOutput.point,
        estimated_known_output_tokens_high: knownGeneratedOutput.high,
        output_cap_tokens: OUTPUT_CAP,
        output_cap_utilization_pct_point: round((knownGeneratedOutput.point / OUTPUT_CAP) * 100, 2),
        estimated_visible_history_tokens_before_reply_point: promptHistoryPoint,
        estimated_full_main_prompt_tokens_low: fullPromptLow,
        estimated_full_main_prompt_tokens_point: fullPromptPoint,
        estimated_full_main_prompt_tokens_high: fullPromptHigh,
        context_cap_tokens: CONTEXT_CAP,
        context_utilization_pct_point: round((fullPromptPoint / CONTEXT_CAP) * 100, 2),
        duration_ms: evidence.durationMs,
        world_state_event_count_after: evidence.stateEventCount,
        world_info_batches: evidence.worldInfoBatches,
        exact_recall_token: evidence.recallToken || '',
        exact_recall_passed: evidence.recallPassed == null ? '' : evidence.recallPassed,
        world_operation_probe: scenarioTurn.worldOperationProbe,
        keyword_probe: scenarioTurn.keywordProbe,
        edit_probe: PHASE1_EDIT_TURNS.includes(scenarioTurn.turn),
        branch_probe: scenarioTurn.turn === 26,
        restart_probe: scenarioTurn.turn === 32,
        invalid_operation_probe: scenarioTurn.turn === 33,
        estimated_main_request_cost_cny_all_cache_hit: round(mainCostCnyHit, 6),
        estimated_main_request_cost_cny_all_cache_miss: round(mainCostCnyMiss, 6),
        estimated_main_request_cost_usd_all_cache_hit: round(mainCostUsdHit, 6),
        estimated_main_request_cost_usd_all_cache_miss: round(mainCostUsdMiss, 6),
        global_observed_request_multiplier: round(REQUEST_MULTIPLIER, 2),
        estimated_all_request_cost_cny_hit_heuristic: round(mainCostCnyHit * REQUEST_MULTIPLIER, 6),
        estimated_all_request_cost_cny_miss_heuristic: round(mainCostCnyMiss * REQUEST_MULTIPLIER, 6),
    });

    const selectedAssistantChars = swipe?.assistantChars || evidence.assistantChars;
    const selectedAssistantSuffix = scenarioTurn.turn === PHASE1_EDIT_TURNS[1] ? ASSISTANT_EDIT_SUFFIX : '';
    const selectedAssistant = estimateUnknownChineseReplyTokens(selectedAssistantChars + selectedAssistantSuffix.length);
    historyLow += userEstimate.low + selectedAssistant.low;
    historyPoint += userEstimate.point + selectedAssistant.point;
    historyHigh += userEstimate.high + selectedAssistant.high;
}

const csvColumns = [
    'turn', 'user_text', 'user_chars', 'estimated_user_tokens',
    'assistant_text_recoverable', 'assistant_sha256', 'assistant_chars_initial',
    'swipe_generated', 'assistant_chars_swipe',
    'estimated_known_output_tokens_low', 'estimated_known_output_tokens_point', 'estimated_known_output_tokens_high',
    'output_cap_tokens', 'output_cap_utilization_pct_point',
    'estimated_visible_history_tokens_before_reply_point',
    'estimated_full_main_prompt_tokens_low', 'estimated_full_main_prompt_tokens_point', 'estimated_full_main_prompt_tokens_high',
    'context_cap_tokens', 'context_utilization_pct_point', 'duration_ms',
    'world_state_event_count_after', 'world_info_batches', 'exact_recall_token', 'exact_recall_passed',
    'world_operation_probe', 'keyword_probe', 'edit_probe', 'branch_probe', 'restart_probe', 'invalid_operation_probe',
    'estimated_main_request_cost_cny_all_cache_hit', 'estimated_main_request_cost_cny_all_cache_miss',
    'estimated_main_request_cost_usd_all_cache_hit', 'estimated_main_request_cost_usd_all_cache_miss',
    'global_observed_request_multiplier', 'estimated_all_request_cost_cny_hit_heuristic', 'estimated_all_request_cost_cny_miss_heuristic',
];

const sum = key => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const average = key => sum(key) / rows.length;
const sorted = key => [...rows].sort((a, b) => Number(a[key]) - Number(b[key]));
const percentile = (key, p) => {
    const values = sorted(key).map(row => Number(row[key]));
    return values[Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * p)))];
};
const topOutput = [...rows].sort((a, b) => b.estimated_known_output_tokens_point - a.estimated_known_output_tokens_point).slice(0, 5);
const topContext = [...rows].sort((a, b) => b.estimated_full_main_prompt_tokens_point - a.estimated_full_main_prompt_tokens_point).slice(0, 5);
const topLatency = [...rows].sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 5);
const stageComparison = Array.from({ length: 5 }, (_, index) => {
    const start = index * 10 + 1;
    const end = start + 9;
    const stageRows = rows.filter(row => row.turn >= start && row.turn <= end);
    const stageAverage = key => stageRows.reduce((total, row) => total + Number(row[key] || 0), 0) / stageRows.length;
    return {
        turns: `${start}-${end}`,
        averageOutputTokensPoint: round(stageAverage('estimated_known_output_tokens_point'), 1),
        averageFullPromptTokensPoint: round(stageAverage('estimated_full_main_prompt_tokens_point'), 1),
        averageContextUtilizationPctPoint: round(stageAverage('context_utilization_pct_point'), 2),
        averageLatencyMs: round(stageAverage('duration_ms'), 1),
        mainCostCnyAllHit: round(stageRows.reduce((total, row) => total + row.estimated_main_request_cost_cny_all_cache_hit, 0), 4),
        mainCostCnyAllMiss: round(stageRows.reduce((total, row) => total + row.estimated_main_request_cost_cny_all_cache_miss, 0), 4),
    };
});

const summary = {
    schema: 'phase1-v4-dialogue-token-analysis-v1',
    generatedAt: new Date().toISOString(),
    source: {
        reportFile: basename(reportPath),
        reportSha256: sha256(readFileSync(reportPath)),
        reportStartedAt: report.startedAt,
        reportCompletedAt: report.completedAt,
        status: report.status,
        model: report.provider?.model,
        assistantTextRetention: 'not retained; only SHA-256 and character counts are available',
    },
    assumptions: {
        officialApproximation: '1 Chinese character ~= 0.6 token; 1 English character ~= 0.3 token',
        unknownAssistantLowPointHighTokensPerCharacter: [0.45, 0.6, 0.8],
        staticPromptCharsFromDocumentedDryRun: STATIC_PROMPT_CHARS_FROM_DRY_RUN,
        staticPromptTokenRange: [staticLow, staticPoint, staticHigh],
        observedRelevantRequests: report.requestInspector?.relevant,
        observedRequestsPerTurn: round(REQUEST_MULTIPLIER, 2),
        exclusions: ['unretained tool-call arguments/results', 'branch reply text', 'Memory Graph extraction output', 'provider cache hit/miss split', 'failed request billing outcome'],
    },
    totals: {
        turns: rows.length,
        userChars: sum('user_chars'),
        assistantCharsInitial: sum('assistant_chars_initial'),
        assistantCharsExtraSwipes: sum('assistant_chars_swipe'),
        knownOutputTokensLow: sum('estimated_known_output_tokens_low'),
        knownOutputTokensPoint: sum('estimated_known_output_tokens_point'),
        knownOutputTokensHigh: sum('estimated_known_output_tokens_high'),
        mainPromptTokensLow: sum('estimated_full_main_prompt_tokens_low'),
        mainPromptTokensPoint: sum('estimated_full_main_prompt_tokens_point'),
        mainPromptTokensHigh: sum('estimated_full_main_prompt_tokens_high'),
        estimatedMainRequestsCostCnyAllHit: round(sum('estimated_main_request_cost_cny_all_cache_hit'), 4),
        estimatedMainRequestsCostCnyAllMiss: round(sum('estimated_main_request_cost_cny_all_cache_miss'), 4),
        estimatedMainRequestsCostUsdAllHit: round(sum('estimated_main_request_cost_usd_all_cache_hit'), 4),
        estimatedMainRequestsCostUsdAllMiss: round(sum('estimated_main_request_cost_usd_all_cache_miss'), 4),
        heuristicAllRequestsCostCnyAllHit: round(sum('estimated_all_request_cost_cny_hit_heuristic'), 4),
        heuristicAllRequestsCostCnyAllMiss: round(sum('estimated_all_request_cost_cny_miss_heuristic'), 4),
    },
    distribution: {
        outputTokensPoint: { average: round(average('estimated_known_output_tokens_point'), 1), p50: percentile('estimated_known_output_tokens_point', 0.5), p90: percentile('estimated_known_output_tokens_point', 0.9) },
        fullPromptTokensPoint: { average: round(average('estimated_full_main_prompt_tokens_point'), 1), p50: percentile('estimated_full_main_prompt_tokens_point', 0.5), p90: percentile('estimated_full_main_prompt_tokens_point', 0.9) },
        latencyMs: { average: round(average('duration_ms'), 1), p50: percentile('duration_ms', 0.5), p90: percentile('duration_ms', 0.9) },
    },
    topOutputTurns: topOutput.map(row => ({ turn: row.turn, tokens: row.estimated_known_output_tokens_point, swipe: row.swipe_generated })),
    topContextTurns: topContext.map(row => ({ turn: row.turn, tokens: row.estimated_full_main_prompt_tokens_point, contextPct: row.context_utilization_pct_point })),
    topLatencyTurns: topLatency.map(row => ({ turn: row.turn, durationMs: row.duration_ms })),
    stageComparison,
};

const dialogue = [
    '# Phase 1 `v4.0.png` 可恢复对话文本',
    '',
    '> 重要：最终通过的隔离测试在 teardown 时删除完整聊天文件；脱敏报告只保留助手回复哈希和字符数。因此下面包含可逐字恢复的固定开场与 50 条用户输入，助手正文位置仅列证据，不能从哈希逆向还原。',
    '',
    '## 固定开场（保留自同一卡片、同一开场选择的本地测试记录）',
    '',
    openingMessage.mes,
    '',
    ...rows.flatMap(row => [
        `## 第 ${row.turn} 回合`,
        '',
        `**云舟（用户）**：${row.user_text}`,
        '',
        `**沈慕微（助手）**：〔正文未保留；初次回复 ${row.assistant_chars_initial} 字符；SHA-256 ${row.assistant_sha256}${row.swipe_generated ? `；本回合另生成 Swipe 版本 ${row.assistant_chars_swipe} 字符` : ''}〕`,
        '',
    ]),
].join('\n');

const analysis = `# Phase 1 50 回合 Token 消耗评估

## 结论先行

- 可见主回复加三次 Swipe 的**已知生成量下限**约为 ${summary.totals.knownOutputTokensPoint.toLocaleString('en-US')} tokens；区间 ${summary.totals.knownOutputTokensLow.toLocaleString('en-US')}–${summary.totals.knownOutputTokensHigh.toLocaleString('en-US')}。
- 50 次主回复请求的输入合计点估计约 ${summary.totals.mainPromptTokensPoint.toLocaleString('en-US')} tokens；区间 ${summary.totals.mainPromptTokensLow.toLocaleString('en-US')}–${summary.totals.mainPromptTokensHigh.toLocaleString('en-US')}。该值包含文档中 18,737 字符 Dry Run 作为静态提示基线和逐轮可见历史估算。
- Request Inspector 实际记录 ${report.requestInspector?.relevant} 个相关请求，即平均 ${round(REQUEST_MULTIPLIER, 2)} 个请求/用户回合。工具递归、Memory Graph、Swipe 和分支使真实总量高于 50 个主请求；由于旧报告没有保留各请求 usage，不能把这些附加请求精确分摊到每一回合。
- 按 2026-07-20 DeepSeek V4 Flash 官方价格，50 个主请求成本估计为：全部输入缓存命中约 ¥${summary.totals.estimatedMainRequestsCostCnyAllHit}，全部缓存未命中约 ¥${summary.totals.estimatedMainRequestsCostCnyAllMiss}；按全局 2.0× 请求数做粗略外推约为 ¥${summary.totals.heuristicAllRequestsCostCnyAllHit}–¥${summary.totals.heuristicAllRequestsCostCnyAllMiss}。这只是边界，不是账单。

## 每轮对比重点

- 输出估计：平均 ${summary.distribution.outputTokensPoint.average} tokens，P50 ${summary.distribution.outputTokensPoint.p50}，P90 ${summary.distribution.outputTokensPoint.p90}。
- 主请求上下文估计：平均 ${summary.distribution.fullPromptTokensPoint.average.toLocaleString('en-US')} tokens，P50 ${summary.distribution.fullPromptTokensPoint.p50.toLocaleString('en-US')}，P90 ${summary.distribution.fullPromptTokensPoint.p90.toLocaleString('en-US')}。
- 响应耗时：平均 ${round(summary.distribution.latencyMs.average / 1000, 2)} 秒，P50 ${round(summary.distribution.latencyMs.p50 / 1000, 2)} 秒，P90 ${round(summary.distribution.latencyMs.p90 / 1000, 2)} 秒。
- 第 18、30、42 回合发生 Swipe，CSV 的已知输出量包含初次回复和 Swipe 回复；历史输入只沿最终选中的 Swipe 版本继续累积。
- 第 26 回合另生成分支回复，但旧报告只保留其哈希；该部分未进入 token 下限。

## 分段对比

| 回合 | 平均已知输出 tokens | 平均主请求输入 tokens | 平均上下文占比 | 平均耗时 | 10 回合主请求成本：全命中 / 全未命中 |
|---|---:|---:|---:|---:|---:|
${summary.stageComparison.map(stage => `| ${stage.turns} | ${stage.averageOutputTokensPoint} | ${stage.averageFullPromptTokensPoint.toLocaleString('en-US')} | ${stage.averageContextUtilizationPctPoint}% | ${round(stage.averageLatencyMs / 1000, 2)} 秒 | ¥${stage.mainCostCnyAllHit} / ¥${stage.mainCostCnyAllMiss} |`).join('\n')}

## 估算方法与限制

1. DeepSeek 官方说明近似换算为：中文字符约 0.6 token、英文字符约 0.3 token；实际计费以响应中的 usage 为准。
2. 用户输入保留原文，因此按字符类别估算；助手正文没有保留，只能用字符数按 0.45/0.60/0.80 token/字符给出低/点/高区间。
3. 静态提示基线使用已记录的 18,737 字符 Dry Run；按英文到中文构成给出 5,621/8,432/11,242 tokens 的低/点/高基线。
4. \`prompt_cache_hit_tokens + prompt_cache_miss_tokens = prompt_tokens\`。旧报告没有保留三个 usage 字段，因此缓存成本只能列全命中与全未命中边界。
5. 表中的“全请求成本粗估”仅将每轮主请求成本乘以全局请求倍数 ${round(REQUEST_MULTIPLIER, 2)}，不代表工具递归请求与主请求拥有相同长度。

## 当前价格快照

DeepSeek V4 Flash（2026-07-20 官方页面）：输入缓存命中 ¥0.02/百万 tokens，输入缓存未命中 ¥1/百万，输出 ¥2/百万；美元价格分别为 $0.0028、$0.14、$0.28/百万 tokens。价格会变化，复核未来账单时应重新查看官方页面。

- https://api-docs.deepseek.com/zh-cn/quick_start/pricing
- https://api-docs.deepseek.com/quick_start/token_usage
- https://api-docs.deepseek.com/guides/kv_cache

## 下一次如何取得精确值

下一次测试应在 teardown 前导出：完整 JSONL、每个 Request Inspector detail 的 usage、请求 ID 到用户回合的映射，以及 Swipe/分支/工具递归的子请求关系。只有这些数据才能给出逐回合准确账单，而不是估算区间。
`;

const readme = `# Phase 1 对话与 Token 分析包

本包来自 2026-07-20 通过的 \`v4.0.png\` 50 回合真实模型验收。

文件说明：

- \`01-recoverable-dialogue.md\`：固定开场、50 条用户原文和每条助手回复的保留证据。
- \`02-per-turn-token-estimates.csv\`：逐回合 token、上下文占用、成本边界和验收标记。
- \`03-analysis.md\`：汇总、对比、价格与限制。
- \`04-analysis-summary.json\`：机器可读汇总。
- \`05-per-turn-evidence.json\`：机器可读逐回合数据。
- \`06-redacted-acceptance-report.json\`：原始脱敏硬门报告。
- \`SHA256SUMS.txt\`：包内文件校验值。

限制：测试为了防止角色正文、提示词和密钥进入 CI 附件，主动不保存助手全文；隔离聊天目录已按设计删除。因此本包不是完整双边逐字转录。若需助手全文与精确 provider usage，必须重新执行 50 回合并显式开启本地留档。
`;

writeFileSync(resolve(outDir, 'README.md'), readme);
writeFileSync(resolve(outDir, '01-recoverable-dialogue.md'), dialogue);
writeFileSync(resolve(outDir, '02-per-turn-token-estimates.csv'), toCsv(rows, csvColumns));
writeFileSync(resolve(outDir, '03-analysis.md'), analysis);
writeFileSync(resolve(outDir, '04-analysis-summary.json'), JSON.stringify(summary, null, 2));
writeFileSync(resolve(outDir, '05-per-turn-evidence.json'), JSON.stringify(rows, null, 2));
copyFileSync(reportPath, resolve(outDir, '06-redacted-acceptance-report.json'));

const outputFiles = [
    'README.md',
    '01-recoverable-dialogue.md',
    '02-per-turn-token-estimates.csv',
    '03-analysis.md',
    '04-analysis-summary.json',
    '05-per-turn-evidence.json',
    '06-redacted-acceptance-report.json',
];
const checksums = outputFiles.map(file => `${sha256(readFileSync(resolve(outDir, file)))}  ${file}`).join('\n') + '\n';
writeFileSync(resolve(outDir, 'SHA256SUMS.txt'), checksums);

console.log(JSON.stringify({ outDir, summary }, null, 2));
