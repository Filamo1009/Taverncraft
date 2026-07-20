// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

import { createEmptyWorldState, isPlainObject } from './schema.js';

const INITVAR_OPEN = '<initvar>';
const INITVAR_CLOSE = '</initvar>';

export function extractLegacyInitvar(text) {
    const source = String(text ?? '');
    const start = source.indexOf(INITVAR_OPEN);
    if (start < 0) {
        return null;
    }
    const end = source.indexOf(INITVAR_CLOSE, start + INITVAR_OPEN.length);
    if (end < 0 || source.indexOf(INITVAR_OPEN, start + INITVAR_OPEN.length) >= 0) {
        return null;
    }
    return source.slice(start + INITVAR_OPEN.length, end).trim();
}

/**
 * Finds an initvar only in each message's currently selected content.
 * Inactive opening swipes are alternative timelines and must never seed the
 * authoritative state for the active branch.
 *
 * @param {Array<object>} messages Chat messages in floor order.
 * @returns {{floor:number,text:string}|null}
 */
export function findActiveLegacyInitvarCandidate(messages) {
    const sourceMessages = Array.isArray(messages) ? messages : [];
    for (let floor = 0; floor < sourceMessages.length; floor++) {
        const message = sourceMessages[floor];
        if (!message || message.is_user) {
            continue;
        }
        const activeSwipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
        const candidates = [String(message.mes || '')];
        if (Array.isArray(message.swipes) && message.swipes[activeSwipeId] !== undefined) {
            candidates.push(String(message.swipes[activeSwipeId] || ''));
        }
        const text = Array.from(new Set(candidates))
            .find(value => value.includes(INITVAR_OPEN) && value.includes(INITVAR_CLOSE));
        if (text) {
            return { floor, text };
        }
    }
    return null;
}

/**
 * Infers the NPC used before an ST compatibility state is available.
 * A GameStart world card represents the setting itself, so its card name must
 * not masquerade as an in-world NPC while the player is still choosing a start.
 * Cards may opt in to an explicit NPC through extensions.world_engine.primaryNpc.
 */
export function inferSeedNpcName(character, fallbackName = '') {
    const explicitNpc = String(character?.data?.extensions?.world_engine?.primaryNpc || '').trim();
    if (explicitNpc) {
        return explicitNpc;
    }
    const isWorldStartCard = String(character?.data?.first_mes || '').trim() === '【GameStart】'
        && Boolean(character?.data?.character_book);
    return isWorldStartCard ? '' : String(fallbackName || character?.name || '').trim();
}

function firstObjectEntry(value) {
    if (!isPlainObject(value)) {
        return ['', null];
    }
    return Object.entries(value).find(([, item]) => isPlainObject(item)) || ['', null];
}

function normalizeCharacterList(value) {
    if (Array.isArray(value)) {
        return value.map(item => String(item || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(/[、,，]/u).map(item => item.trim()).filter(Boolean);
    }
    return [];
}

export function mapLegacyInitvarToWorldState(parsed, options = {}) {
    if (!isPlainObject(parsed)) {
        throw new Error('Legacy initvar YAML must decode to an object.');
    }
    const playerState = isPlainObject(parsed['主角状态']) ? parsed['主角状态'] : {};
    const world = isPlainObject(parsed['世界系统']) ? parsed['世界系统'] : {};
    const social = isPlainObject(parsed['人际交往']) ? parsed['人际交往'] : {};
    const contacts = isPlainObject(social['当前接触人物']) ? social['当前接触人物'] : {};
    const knownPeople = isPlainObject(social['结识道友录']) ? social['结识道友录'] : {};
    const [contactName, contactState] = firstObjectEntry(contacts);
    const [firstKnownName] = firstObjectEntry(knownPeople);
    const fallbackNpcName = String(options.npcName || '').trim();
    // A world-simulation card name is not necessarily an in-world NPC. When
    // the opening has no active contact, prefer a real character from its
    // social registry before falling back to the card name. Ordinary ST cards
    // without a social registry retain the classic card-name fallback.
    const npcName = String(contactName || firstKnownName || fallbackNpcName || '').trim();
    const npcRecord = npcName && isPlainObject(knownPeople[npcName]) ? knownPeople[npcName] : {};
    const location = String(world['当前地址'] || world['具体地点'] || '').trim();
    const inventory = isPlainObject(playerState['个人背包']) ? playerState['个人背包'] : {};
    const cultivation = isPlainObject(playerState['修为']) ? playerState['修为'] : {};
    const wallet = isPlainObject(playerState['灵石钱包']) ? playerState['灵石钱包'] : {};
    const state = createEmptyWorldState({
        clock: {
            label: String(world['当前时间'] || '').trim(),
        },
        location: {
            current: location,
            region: String(world['大区域'] || '').trim(),
            area: String(world['子区域'] || world['具体地点'] || '').trim(),
            known: location ? [location] : [],
            presentCharacters: normalizeCharacterList(world['在场角色']),
        },
        player: {
            name: String(options.playerName || '').trim(),
            location,
            status: {
                cultivation,
                wallet,
                description: String(cultivation['当前状态描述'] || '').trim(),
            },
            inventory,
        },
        npc: {
            id: npcName ? `npc:${npcName}` : 'npc',
            name: npcName,
            location: String(npcRecord['当前所在地'] || location).trim(),
            status: isPlainObject(contactState) ? contactState : {},
            knowledge: { facts: [] },
        },
        relationships: npcName ? {
            [npcName]: {
                score: Number(npcRecord['好感度数值']) || 0,
                stage: String(npcRecord['好感度阶段'] || '').trim(),
                label: String(npcRecord['关系标签'] || '').trim(),
                recent: Array.isArray(npcRecord['最近互动记录']) ? npcRecord['最近互动记录'] : [],
            },
        } : {},
        tasks: isPlainObject(world['委托板']) ? world['委托板'] : {},
        flags: {},
        extensions: {
            stLegacy: parsed,
            cardSystems: {
                fortune: world['今日运势'] ?? {},
                forum: world['修仙八卦论坛'] ?? {},
                secrets: world['修仙秘闻'] ?? {},
                auction: world['随身拍卖行'] ?? {},
                latestMessage: social['最新传讯'] ?? {},
            },
        },
        meta: {
            initialized: true,
            source: 'st-initvar-yaml',
        },
    });
    return state;
}

export function importLegacyInitvar(text, parseYaml, options = {}) {
    const yamlText = extractLegacyInitvar(text);
    if (!yamlText) {
        return { ok: false, state: null, error: 'No single complete <initvar> block was found.' };
    }
    if (typeof parseYaml !== 'function') {
        return { ok: false, state: null, error: 'No YAML parser is available.' };
    }
    try {
        const parsed = parseYaml(yamlText);
        return { ok: true, state: mapLegacyInitvarToWorldState(parsed, options), error: '' };
    } catch (error) {
        return { ok: false, state: null, error: String(error?.message || error) };
    }
}
