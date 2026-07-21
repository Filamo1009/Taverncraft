import {
    characters,
    eventSource,
    event_types,
    getCharacterDescription,
    getCharacterName,
    getThumbnailUrl,
    isCharacterFavorite,
    deleteCharacterChatByName,
    selectCharacterById,
    select_rm_characters,
    select_selected_character,
    this_chid,
    user_avatar,
    getUserAvatar,
} from '../../script.js';
import { deleteGroupChatByName, editGroup, select_group_chats } from '../group-chats.js';
import { fetchRecentChatsSnapshot, renameRecentChatByReference, toggleRecentChatPin } from '../welcome-screen.js';
import { getCurrentLocale } from '../i18n.js';

const MODE_STORAGE_KEY = 'taverncraft.ui.mode';
const THEME_STORAGE_KEY = 'taverncraft.ui.theme';
const CONTEXT_COLLAPSED_STORAGE_KEY = 'taverncraft.ui.contextCollapsed';

const dictionaries = {
    en: {
        brand: 'TavernCraft',
        chat: 'Chat',
        library: 'Library',
        persona: 'Persona',
        settings: 'Settings',
        searchChats: 'Search conversations...',
        pinned: 'Pinned',
        recent: 'Recent',
        noRecent: 'No recent conversations',
        pinChat: 'Pin conversation',
        unpinChat: 'Unpin conversation',
        renameChat: 'Rename conversation',
        deleteChat: 'Delete conversation',
        deleteChatConfirm: 'Delete this conversation? You can undo the deletion from the notification that follows.',
        deleteChatFailed: 'Conversation could not be deleted.',
        noCharacter: 'Choose a character to begin',
        online: 'Ready',
        offline: 'Connect a model to start chatting',
        unknownLocation: 'Location not set',
        regenerate: 'Regenerate',
        continue: 'Continue',
        impersonate: 'Impersonate',
        context: 'Context',
        characterContext: 'Character context',
        groupContext: 'Group context',
        worldInfo: 'World Info',
        worldEntries: 'active entries',
        worldEngine: 'World Engine',
        enabled: 'Enabled',
        disabled: 'Disabled',
        currentPersona: 'Current persona',
        switchPersona: 'Switch',
        manageWorld: 'Manage World Info',
        createCharacter: 'Create character',
        editCharacter: 'Edit character',
        importCharacter: 'Import character card',
        createGroup: 'Create group',
        characters: 'characters',
        all: 'All',
        favorites: 'Favorites',
        recentlyUsed: 'Recently used',
        tags: 'Tags',
        saveCharacter: 'Save character',
        back: 'Back',
        createPersona: 'Create persona',
        connection: 'Connection & model',
        generation: 'Generation',
        prompts: 'Prompts & presets',
        world: 'World Info',
        appearance: 'Appearance',
        background: 'Backgrounds',
        extensions: 'Advanced tools',
        modernAppearance: 'TavernCraft interface',
        modernAppearanceDescription: 'Modern interface theme and compatibility controls.',
        importWorld: 'Import World Info',
        newWorld: 'New World Info',
        manageMembers: 'Manage members',
        inviteCharacter: 'Invite character',
        participantMuted: 'Muted',
        participantActive: 'Active',
        lightTheme: 'Use light theme',
        darkTheme: 'Use dark theme',
        lightThemeConfirm: 'Switch to the light theme? TavernCraft will remember this choice for your next visit.',
        darkThemeConfirm: 'Switch to the dark theme? TavernCraft will remember this choice for your next visit.',
        classicUi: 'Classic UI',
        classicConfirm: 'Switch to the classic interface? The page will reload and the modern layout will be disabled.',
        modernUi: 'Use modern UI',
        openSidebar: 'Open conversations',
        hideContext: 'Hide context panel',
        showContext: 'Show context panel',
        preview: 'Live preview',
        previewEmpty: 'Your character greeting will appear here.',
        loading: 'Loading...',
        groupMembers: 'Group members',
        noDescription: 'No description yet.',
    },
    'zh-cn': {
        brand: '酒馆工坊',
        chat: '聊天',
        library: '角色库',
        persona: '人设',
        settings: '设置',
        searchChats: '搜索会话…',
        pinned: '已置顶',
        recent: '最近',
        noRecent: '暂无最近会话',
        pinChat: '置顶对话',
        unpinChat: '取消置顶',
        renameChat: '重命名对话',
        deleteChat: '删除对话',
        deleteChatConfirm: '确定要删除这条对话吗？删除后可通过随后出现的通知撤销。',
        deleteChatFailed: '对话删除失败。',
        noCharacter: '选择一个角色开始游玩',
        online: '已就绪',
        offline: '请先连接模型',
        unknownLocation: '地点未设置',
        regenerate: '重新生成',
        continue: '续写',
        impersonate: '代入扮演',
        context: '上下文',
        characterContext: '角色上下文',
        groupContext: '群聊上下文',
        worldInfo: '世界书',
        worldEntries: '条启用条目',
        worldEngine: '世界引擎',
        enabled: '已启用',
        disabled: '未启用',
        currentPersona: '当前人设',
        switchPersona: '切换',
        manageWorld: '管理世界书',
        createCharacter: '创建角色',
        editCharacter: '编辑角色',
        importCharacter: '导入角色卡',
        createGroup: '创建群聊',
        characters: '个角色',
        all: '全部',
        favorites: '收藏',
        recentlyUsed: '最近使用',
        tags: '标签',
        saveCharacter: '保存角色',
        back: '返回',
        createPersona: '新建人设',
        connection: '连接与模型',
        generation: '生成参数',
        prompts: '提示词与预设',
        world: '世界书',
        appearance: '界面与体验',
        background: '背景',
        extensions: '高级工具',
        modernAppearance: '酒馆工坊界面',
        modernAppearanceDescription: '新版界面的主题与兼容模式设置。',
        importWorld: '导入世界书',
        newWorld: '新建世界书',
        manageMembers: '管理成员',
        inviteCharacter: '邀请角色加入',
        participantMuted: '已静音',
        participantActive: '参与回复',
        lightTheme: '切换浅色主题',
        darkTheme: '切换深色主题',
        lightThemeConfirm: '确定要切换到浅色主题吗？系统会记住此选择，下次打开时继续使用浅色主题。',
        darkThemeConfirm: '确定要切换到深色主题吗？系统会记住此选择，下次打开时继续使用深色主题。',
        classicUi: '经典界面',
        classicConfirm: '确定要切换到经典界面吗？页面将重新加载并停用新版界面。',
        modernUi: '使用新版界面',
        openSidebar: '打开会话列表',
        hideContext: '收起上下文面板',
        showContext: '展开上下文面板',
        preview: '实时预览',
        previewEmpty: '角色开场白会显示在这里。',
        loading: '正在载入…',
        groupMembers: '群聊成员',
        noDescription: '暂时没有角色简介。',
    },
    'zh-tw': {
        brand: '酒館工坊',
        chat: '聊天',
        library: '角色庫',
        persona: '人設',
        settings: '設定',
        searchChats: '搜尋會話…',
        pinned: '已置頂',
        recent: '最近',
        noRecent: '暫無最近會話',
        pinChat: '置頂對話',
        unpinChat: '取消置頂',
        renameChat: '重新命名對話',
        deleteChat: '刪除對話',
        deleteChatConfirm: '確定要刪除這條對話嗎？刪除後可透過隨後出現的通知復原。',
        deleteChatFailed: '對話刪除失敗。',
        noCharacter: '選擇一個角色開始遊玩',
        online: '已就緒',
        offline: '請先連接模型',
        unknownLocation: '地點未設定',
        regenerate: '重新生成',
        continue: '續寫',
        impersonate: '代入扮演',
        context: '上下文',
        characterContext: '角色上下文',
        groupContext: '群聊上下文',
        worldInfo: '世界書',
        worldEntries: '條啟用條目',
        worldEngine: '世界引擎',
        enabled: '已啟用',
        disabled: '未啟用',
        currentPersona: '目前人設',
        switchPersona: '切換',
        manageWorld: '管理世界書',
        createCharacter: '建立角色',
        editCharacter: '編輯角色',
        importCharacter: '匯入角色卡',
        createGroup: '建立群聊',
        characters: '個角色',
        all: '全部',
        favorites: '收藏',
        recentlyUsed: '最近使用',
        tags: '標籤',
        saveCharacter: '儲存角色',
        back: '返回',
        createPersona: '新增人設',
        connection: '連接與模型',
        generation: '生成參數',
        prompts: '提示詞與預設',
        world: '世界書',
        appearance: '介面與體驗',
        background: '背景',
        extensions: '進階工具',
        modernAppearance: '酒館工坊介面',
        modernAppearanceDescription: '新版介面的主題與相容模式設定。',
        importWorld: '匯入世界書',
        newWorld: '新增世界書',
        manageMembers: '管理成員',
        inviteCharacter: '邀請角色加入',
        participantMuted: '已靜音',
        participantActive: '參與回覆',
        lightTheme: '切換淺色主題',
        darkTheme: '切換深色主題',
        lightThemeConfirm: '確定要切換到淺色主題嗎？系統會記住此選擇，下次開啟時繼續使用淺色主題。',
        darkThemeConfirm: '確定要切換到深色主題嗎？系統會記住此選擇，下次開啟時繼續使用深色主題。',
        classicUi: '經典介面',
        classicConfirm: '確定要切換到經典介面嗎？頁面將重新載入並停用新版介面。',
        modernUi: '使用新版介面',
        openSidebar: '開啟會話列表',
        hideContext: '收起上下文面板',
        showContext: '展開上下文面板',
        preview: '即時預覽',
        previewEmpty: '角色開場白會顯示在這裡。',
        loading: '正在載入…',
        groupMembers: '群聊成員',
        noDescription: '暫時沒有角色簡介。',
    },
};

const currentLocale = getCurrentLocale();
const dictionaryKey = currentLocale.startsWith('zh-tw') ? 'zh-tw' : currentLocale.startsWith('zh') ? 'zh-cn' : 'en';
const dictionary = dictionaries[dictionaryKey];
const state = {
    view: 'chat',
    settingsSection: 'connection',
    libraryFilter: 'all',
    recentChats: [],
    recentSearch: '',
    contextCollapsed: localStorage.getItem(CONTEXT_COLLAPSED_STORAGE_KEY) === 'true',
    recentRenderToken: 0,
    chatRenderToken: 0,
};

const settingsPanels = {
    connection: '#rm_api_block',
    generation: '#left-nav-panel',
    prompts: '#AdvancedFormatting',
    persona: '#PersonaManagement',
    world: '#WorldInfo',
    appearance: '#user-settings-block',
    background: '#Backgrounds',
    extensions: '#rm_extensions_block',
};

function text(key) {
    return dictionary[key] || dictionaries.en[key] || key;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll('\'', '&#039;');
}

function stripMarkup(value) {
    const holder = document.createElement('div');
    holder.innerHTML = String(value ?? '');
    return (holder.textContent || '').replace(/\s+/g, ' ').trim();
}

function getContext() {
    return globalThis.Taverncraft?.getContext?.() || null;
}

function getCharacterAvatar(character) {
    if (!character?.avatar || character.avatar === 'none') {
        return '/favicon.ico';
    }
    return getThumbnailUrl('avatar', character.avatar);
}

function getGroupAvatar(group) {
    if (group?.avatar_url) {
        return group.avatar_url;
    }
    const firstMember = group?.members?.map(avatar => characters.find(character => character.avatar === avatar)).find(Boolean);
    return firstMember ? getCharacterAvatar(firstMember) : '/favicon.ico';
}

function removeUiQuery(url = new URL(globalThis.location.href)) {
    url.searchParams.delete('ui');
    return url;
}

function requestClassicUi() {
    if (!globalThis.confirm(text('classicConfirm'))) {
        return false;
    }
    localStorage.setItem(MODE_STORAGE_KEY, 'classic');
    globalThis.location.href = removeUiQuery().toString();
    return true;
}

function mountClassicSwitcher() {
    const button = document.createElement('button');
    button.id = 'tc-enable-modern';
    button.type = 'button';
    button.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i><span>${escapeHtml(text('modernUi'))}</span>`;
    button.addEventListener('click', () => {
        localStorage.setItem(MODE_STORAGE_KEY, 'modern');
        globalThis.location.href = removeUiQuery().toString();
    });
    document.body.append(button);
}

function shouldUseClassicUi() {
    const queryMode = new URLSearchParams(globalThis.location.search).get('ui');
    if (queryMode === 'modern') {
        localStorage.setItem(MODE_STORAGE_KEY, 'modern');
        return false;
    }
    if (queryMode === 'classic') {
        return true;
    }
    return localStorage.getItem(MODE_STORAGE_KEY) === 'classic';
}

function navButton(view, icon, label) {
    return `<button type="button" class="tc-nav-button" data-tc-route="${view}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${escapeHtml(label)}</span></button>`;
}

function settingsButton(section, icon, label) {
    const panelId = settingsPanels[section].slice(1);
    return `<button type="button" id="tc-settings-tab-${section}" role="tab" aria-selected="false" aria-controls="${escapeHtml(panelId)}" tabindex="-1" data-tc-settings-section="${section}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${escapeHtml(label)}</span></button>`;
}

function createShell() {
    const isLightTheme = document.body.dataset.tcTheme === 'light';
    const themeToggleLabel = text(isLightTheme ? 'darkTheme' : 'lightTheme');
    const themeToggleIcon = isLightTheme ? 'fa-moon' : 'fa-sun';
    const shell = document.createElement('div');
    shell.id = 'tc-modern-shell';
    shell.innerHTML = `
        <nav class="tc-rail" aria-label="${escapeHtml(text('brand'))}">
            <button type="button" class="tc-brand" data-tc-route="chat" aria-label="${escapeHtml(text('brand'))}"><i class="fa-solid fa-dice-d20" aria-hidden="true"></i></button>
            <div class="tc-rail-nav">
                ${navButton('chat', 'fa-comments', text('chat'))}
                ${navButton('library', 'fa-table-cells-large', text('library'))}
                ${navButton('settings', 'fa-gear', text('settings'))}
            </div>
            <div class="tc-rail-footer">
                <button type="button" id="tc-theme-toggle" class="tc-nav-button" aria-label="${escapeHtml(themeToggleLabel)}" title="${escapeHtml(themeToggleLabel)}"><i class="fa-solid ${themeToggleIcon}" aria-hidden="true"></i></button>
                <button type="button" id="tc-classic-toggle" class="tc-nav-button" aria-label="${escapeHtml(text('classicUi'))}" title="${escapeHtml(text('classicUi'))}"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></button>
            </div>
        </nav>
        <aside id="tc-recents" class="tc-recents" aria-label="${escapeHtml(text('recent'))}">
            <div class="tc-sidebar-heading"><div><span class="tc-kicker">TavernCraft</span><h1>${escapeHtml(text('brand'))}</h1></div><button type="button" class="tc-icon-button" data-tc-action="new-chat" aria-label="${escapeHtml(text('createCharacter'))}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button></div>
            <label class="tc-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input id="tc-recent-search" type="search" placeholder="${escapeHtml(text('searchChats'))}" autocomplete="off"></label>
            <div id="tc-recent-list" class="tc-recent-list"><div class="tc-loading">${escapeHtml(text('loading'))}</div></div>
        </aside>
        <header id="tc-chat-header" class="tc-chat-header"></header>
        <aside id="tc-context-panel" class="tc-context-panel"></aside>
        <button type="button" id="tc-context-toggle" class="tc-context-toggle" aria-label="${escapeHtml(text('hideContext'))}"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
        <header id="tc-view-header" class="tc-view-header"></header>
        <nav id="tc-settings-nav" class="tc-settings-nav" role="tablist" aria-label="${escapeHtml(text('settings'))}">
            ${settingsButton('connection', 'fa-plug', text('connection'))}
            ${settingsButton('generation', 'fa-sliders', text('generation'))}
            ${settingsButton('persona', 'fa-user', text('persona'))}
            ${settingsButton('appearance', 'fa-palette', text('appearance'))}
            ${settingsButton('background', 'fa-panorama', text('background'))}
            ${settingsButton('prompts', 'fa-message', text('prompts'))}
            ${settingsButton('world', 'fa-book-atlas', text('world'))}
            ${settingsButton('extensions', 'fa-cubes', text('extensions'))}
        </nav>
        <nav class="tc-mobile-nav" aria-label="${escapeHtml(text('brand'))}">
            ${navButton('chat', 'fa-comments', text('chat'))}
            ${navButton('library', 'fa-table-cells-large', text('library'))}
            ${navButton('settings', 'fa-gear', text('settings'))}
        </nav>
    `;
    document.body.append(shell);
}

function bindShell() {
    const shell = document.querySelector('#tc-modern-shell');
    shell?.addEventListener('click', event => {
        const routeButton = event.target.closest('[data-tc-route]');
        if (routeButton) {
            const nextView = routeButton.dataset.tcRoute;
            if (nextView === 'chat' && state.view === 'chat' && globalThis.innerWidth <= 768) {
                document.body.classList.toggle('tc-mobile-recents-open');
            } else {
                navigate(nextView);
            }
            return;
        }

        const settingsButton = event.target.closest('[data-tc-settings-section]');
        if (settingsButton) {
            selectSettingsSection(settingsButton.dataset.tcSettingsSection);
            return;
        }

        const actionButton = event.target.closest('[data-tc-action]');
        if (actionButton) {
            void runAction(actionButton.dataset.tcAction, actionButton);
        }
    });

    document.querySelector('#tc-recent-search')?.addEventListener('input', event => {
        state.recentSearch = String(event.target.value || '').trim().toLowerCase();
        renderRecentChats();
    });

    document.querySelector('#tc-theme-toggle')?.addEventListener('click', toggleTheme);
    document.querySelector('#tc-classic-toggle')?.addEventListener('click', requestClassicUi);
    document.querySelector('#tc-context-toggle')?.addEventListener('click', toggleContextPanel);
    document.querySelector('#tc-settings-nav')?.addEventListener('keydown', handleSettingsTabKeydown);
}

function handleSettingsTabKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        return;
    }
    const tabs = [...document.querySelectorAll('#tc-settings-nav [role="tab"]')];
    const currentIndex = tabs.indexOf(event.target.closest('[role="tab"]'));
    if (currentIndex < 0 || !tabs.length) {
        return;
    }
    event.preventDefault();
    const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
            ? tabs.length - 1
            : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    nextTab.focus();
    selectSettingsSection(nextTab.dataset.tcSettingsSection);
}

function configureSettingsPanels() {
    for (const [section, selector] of Object.entries(settingsPanels)) {
        const panel = document.querySelector(selector);
        if (!panel) {
            continue;
        }
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', `tc-settings-tab-${section}`);
        panel.setAttribute('aria-hidden', 'true');
    }
}

function activateNativePanel(selector) {
    document.querySelectorAll('.drawer-content.tc-active-native').forEach(panel => {
        panel.classList.remove('tc-active-native');
        panel.setAttribute('aria-hidden', 'true');
    });
    const panel = document.querySelector(selector);
    if (!panel) {
        return;
    }
    panel.classList.remove('closedDrawer');
    panel.classList.add('openDrawer', 'tc-active-native');
    panel.setAttribute('aria-hidden', 'false');
}

function clearNativePanels() {
    document.querySelectorAll('.drawer-content.tc-active-native').forEach(panel => {
        panel.classList.remove('tc-active-native');
        panel.setAttribute('aria-hidden', 'true');
    });
}

function navigate(view) {
    if (!['chat', 'library', 'settings', 'world', 'creator', 'group'].includes(view)) {
        return;
    }
    state.view = view;
    document.body.dataset.tcView = view;
    document.body.classList.remove('tc-mobile-recents-open', 'tc-mobile-context-open');

    if (view === 'chat') {
        clearNativePanels();
    } else if (view === 'library' || view === 'creator' || view === 'group') {
        activateNativePanel('#right-nav-panel');
        if (view === 'library') {
            select_rm_characters();
            ensureLibraryControls();
        }
    } else if (view === 'world') {
        activateNativePanel('#WorldInfo');
    } else if (view === 'settings') {
        selectSettingsSection(state.settingsSection, { updateView: false });
    }

    renderViewHeader();
    updateNavigationState();
    if (view === 'creator') {
        ensureCreatorPreview();
    }
}

function updateNavigationState() {
    const activeRoute = ['creator', 'group'].includes(state.view) ? 'library' : state.view === 'world' ? 'settings' : state.view;
    document.querySelectorAll('[data-tc-route]').forEach(button => {
        const isActive = button.dataset.tcRoute === activeRoute;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-current', isActive ? 'page' : 'false');
    });
    document.querySelectorAll('[data-tc-settings-section]').forEach(button => {
        const isActive = button.dataset.tcSettingsSection === state.settingsSection;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', String(isActive));
        button.tabIndex = isActive ? 0 : -1;
    });
}

function selectSettingsSection(section, { updateView = true } = {}) {
    if (!settingsPanels[section]) {
        return;
    }
    state.settingsSection = section;
    if (updateView) {
        state.view = 'settings';
        document.body.dataset.tcView = 'settings';
    }
    activateNativePanel(settingsPanels[section]);
    updateNavigationState();
    document.querySelector(`[data-tc-settings-section="${section}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function viewHeaderAction(action, icon, label, variant = '') {
    return `<button type="button" class="tc-header-action ${variant}" data-tc-action="${action}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${escapeHtml(label)}</span></button>`;
}

function renderViewHeader() {
    const header = document.querySelector('#tc-view-header');
    if (!header || state.view === 'chat') {
        if (header) {
            header.innerHTML = '';
        }
        return;
    }

    let title = text(state.view);
    let subtitle = '';
    let actions = '';
    if (state.view === 'library') {
        title = text('library');
        subtitle = `${characters.length} ${text('characters')}`;
        actions = viewHeaderAction('import-character', 'fa-file-import', text('importCharacter'))
            + viewHeaderAction('create-group', 'fa-users', text('createGroup'))
            + viewHeaderAction('create-character', 'fa-plus', text('createCharacter'), 'primary');
    } else if (state.view === 'creator') {
        title = text('createCharacter');
        actions = viewHeaderAction('back-library', 'fa-arrow-left', text('back'))
            + viewHeaderAction('save-character', 'fa-floppy-disk', text('saveCharacter'), 'primary');
    } else if (state.view === 'group') {
        title = text('manageMembers');
        actions = viewHeaderAction('back-library', 'fa-arrow-left', text('back'));
    } else if (state.view === 'settings') {
        title = text('settings');
    } else if (state.view === 'world') {
        title = text('worldInfo');
        actions = viewHeaderAction('import-world', 'fa-file-import', text('importWorld'))
            + viewHeaderAction('new-world', 'fa-plus', text('newWorld'), 'primary');
    }

    header.innerHTML = `<div><span class="tc-kicker">TavernCraft</span><div class="tc-view-title-row"><h1>${escapeHtml(title)}</h1>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ''}</div></div><div class="tc-view-actions">${actions}</div>`;
}

async function runAction(action, button) {
    const nativeActions = {
        'create-character': '#rm_button_create',
        'import-character': '#character_import_button',
        'create-group': '#rm_button_group_chats',
        'create-persona': '#create_dummy_persona',
        'import-world': '#world_import_button',
        'new-world': '#world_create_button',
        regenerate: '#option_regenerate',
        continue: '#option_continue',
        impersonate: '#option_impersonate',
    };
    if (nativeActions[action]) {
        document.querySelector(nativeActions[action])?.click();
        if (action === 'create-character') {
            setTimeout(() => navigate('creator'), 0);
        } else if (action === 'create-group') {
            setTimeout(() => navigate('group'), 0);
        }
        return;
    }

    if (action === 'new-chat') {
        navigate('library');
    } else if (action === 'back-library') {
        document.querySelector(state.view === 'group' ? '#rm_button_back_from_group' : '#rm_button_back')?.click();
        setTimeout(() => navigate('library'), 0);
    } else if (action === 'save-character') {
        document.querySelector('#form_create')?.requestSubmit();
    } else if (action === 'manage-world') {
        navigate('world');
    } else if (action === 'switch-persona') {
        selectSettingsSection('persona');
    } else if (action === 'toggle-mobile-recents') {
        document.body.classList.toggle('tc-mobile-recents-open');
    } else if (action === 'toggle-mobile-context') {
        document.body.classList.toggle('tc-mobile-context-open');
    } else if (action === 'manage-group') {
        openCurrentGroupManager();
    } else if (action === 'edit-character') {
        editCurrentCharacter();
    } else if (action === 'toggle-group-member') {
        await toggleGroupMember(button.dataset.avatar);
    } else if (action === 'open-recent') {
        await openRecentChat(Number(button.dataset.recentIndex));
    } else if (action === 'pin-recent') {
        await pinRecentChat(Number(button.dataset.recentIndex));
    } else if (action === 'rename-recent') {
        await renameRecentChat(Number(button.dataset.recentIndex));
    } else if (action === 'delete-recent') {
        await deleteRecentChat(Number(button.dataset.recentIndex));
    }
}

function toggleTheme() {
    const nextTheme = document.body.dataset.tcTheme === 'light' ? 'dark' : 'light';
    const confirmationKey = nextTheme === 'light' ? 'lightThemeConfirm' : 'darkThemeConfirm';
    if (!globalThis.confirm(text(confirmationKey))) {
        return false;
    }
    document.body.dataset.tcTheme = nextTheme;
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    syncThemeButtons();
    return true;
}

function syncThemeButtons() {
    const isLight = document.body.dataset.tcTheme === 'light';
    const label = text(isLight ? 'darkTheme' : 'lightTheme');
    for (const button of document.querySelectorAll('#tc-theme-toggle, #tc-settings-theme-toggle')) {
        button.innerHTML = button.id === 'tc-theme-toggle'
            ? `<i class="fa-solid ${isLight ? 'fa-moon' : 'fa-sun'}" aria-hidden="true"></i>`
            : `<i class="fa-solid ${isLight ? 'fa-moon' : 'fa-sun'}" aria-hidden="true"></i><span>${escapeHtml(label)}</span>`;
        button.title = label;
        button.setAttribute('aria-label', label);
    }
}

function ensureAppearanceUtilities() {
    const panel = document.querySelector('#user-settings-block');
    if (!panel || document.querySelector('#tc-interface-utilities')) {
        return;
    }
    const utilities = document.createElement('section');
    utilities.id = 'tc-interface-utilities';
    utilities.className = 'tc-interface-utilities';
    utilities.setAttribute('aria-labelledby', 'tc-interface-utilities-title');
    utilities.innerHTML = `
        <div>
            <h3 id="tc-interface-utilities-title">${escapeHtml(text('modernAppearance'))}</h3>
            <p>${escapeHtml(text('modernAppearanceDescription'))}</p>
        </div>
        <div class="tc-interface-utility-actions">
            <button type="button" id="tc-settings-theme-toggle"></button>
            <button type="button" id="tc-settings-classic-toggle"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span>${escapeHtml(text('classicUi'))}</span></button>
        </div>`;
    panel.prepend(utilities);
    utilities.querySelector('#tc-settings-theme-toggle')?.addEventListener('click', toggleTheme);
    utilities.querySelector('#tc-settings-classic-toggle')?.addEventListener('click', requestClassicUi);
    syncThemeButtons();
}

function toggleContextPanel() {
    state.contextCollapsed = !state.contextCollapsed;
    localStorage.setItem(CONTEXT_COLLAPSED_STORAGE_KEY, String(state.contextCollapsed));
    syncContextPanel();
}

function syncContextPanel() {
    document.body.classList.toggle('tc-context-collapsed', state.contextCollapsed);
    const button = document.querySelector('#tc-context-toggle');
    if (button) {
        const label = state.contextCollapsed ? text('showContext') : text('hideContext');
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = `<i class="fa-solid ${state.contextCollapsed ? 'fa-chevron-left' : 'fa-chevron-right'}" aria-hidden="true"></i>`;
    }
}

function editCurrentCharacter() {
    const characterId = Number(this_chid);
    if (!Number.isInteger(characterId) || !characters[characterId]) {
        return;
    }
    select_selected_character(characterId);
    navigate('creator');
}

function ensureQuickActions() {
    const sendForm = document.querySelector('#send_form');
    if (!sendForm || document.querySelector('#tc-quick-actions')) {
        return;
    }
    const quickActions = document.createElement('div');
    quickActions.id = 'tc-quick-actions';
    quickActions.className = 'tc-quick-actions';
    quickActions.innerHTML = `
        <button type="button" data-tc-action="regenerate"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i>${escapeHtml(text('regenerate'))}</button>
        <button type="button" data-tc-action="continue"><i class="fa-solid fa-forward" aria-hidden="true"></i>${escapeHtml(text('continue'))}</button>
        <button type="button" data-tc-action="impersonate"><i class="fa-solid fa-masks-theater" aria-hidden="true"></i>${escapeHtml(text('impersonate'))}</button>
        <button type="button" class="tc-persona-chip" data-tc-action="switch-persona"><i class="fa-solid fa-user" aria-hidden="true"></i><span>${escapeHtml(text('currentPersona'))}</span></button>
    `;
    sendForm.before(quickActions);
    quickActions.addEventListener('click', event => {
        const button = event.target.closest('[data-tc-action]');
        if (button) {
            void runAction(button.dataset.tcAction, button);
        }
    });
}

function formatRecentDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
        return '';
    }
    return date.toLocaleDateString(currentLocale, { month: 'short', day: 'numeric' });
}

async function refreshRecentChats() {
    const token = ++state.recentRenderToken;
    const snapshot = await fetchRecentChatsSnapshot().catch(() => []);
    if (token !== state.recentRenderToken) {
        return;
    }
    state.recentChats = Array.isArray(snapshot) ? snapshot : [];
    renderRecentChats();
}

function recentChatViewModel(chat, index) {
    const context = getContext();
    const group = context?.groups?.find(item => String(item.id) === String(chat.group));
    const character = characters.find(item => item.avatar === chat.avatar);
    return {
        index,
        raw: chat,
        group,
        character,
        name: group?.name || (character ? getCharacterName(character) : chat.char_name) || chat.chat_name || text('chat'),
        avatar: group ? getGroupAvatar(group) : character ? getCharacterAvatar(character) : chat.char_thumbnail || '/favicon.ico',
        message: stripMarkup(chat.mes) || chat.chat_name || '',
        date: chat.date_short || formatRecentDate(chat.last_mes),
        pinned: Boolean(chat.pinned),
    };
}

function renderRecentSection(title, items) {
    if (!items.length) {
        return '';
    }
    return `<section class="tc-recent-section"><h2>${escapeHtml(title)}</h2>${items.map(item => `
        <div class="tc-recent-row${item.pinned ? ' pinned' : ''}">
            <button type="button" class="tc-recent-open" data-tc-action="open-recent" data-recent-index="${item.index}">
                <img src="${escapeHtml(item.avatar)}" alt="">
                <span class="tc-recent-copy"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.message)}</span></span>
                <time>${escapeHtml(item.date)}</time>
            </button>
            <div class="tc-recent-actions">
                <button type="button" class="tc-recent-pin${item.pinned ? ' active' : ''}" data-tc-action="pin-recent" data-recent-index="${item.index}" aria-pressed="${String(item.pinned)}" aria-label="${escapeHtml(text(item.pinned ? 'unpinChat' : 'pinChat'))}" title="${escapeHtml(text(item.pinned ? 'unpinChat' : 'pinChat'))}"><i class="fa-solid fa-thumbtack" aria-hidden="true"></i></button>
                <button type="button" class="tc-recent-rename" data-tc-action="rename-recent" data-recent-index="${item.index}" aria-label="${escapeHtml(text('renameChat'))}" title="${escapeHtml(text('renameChat'))}"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></button>
                <button type="button" class="tc-recent-delete" data-tc-action="delete-recent" data-recent-index="${item.index}" aria-label="${escapeHtml(text('deleteChat'))}" title="${escapeHtml(text('deleteChat'))}"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button>
            </div>
        </div>`).join('')}</section>`;
}

function renderRecentChats() {
    const list = document.querySelector('#tc-recent-list');
    if (!list) {
        return;
    }
    const models = state.recentChats.map(recentChatViewModel).filter(item => {
        if (!state.recentSearch) {
            return true;
        }
        return `${item.name} ${item.message}`.toLowerCase().includes(state.recentSearch);
    });
    const pinned = models.filter(item => item.pinned);
    const recent = models.filter(item => !item.pinned);
    const markup = renderRecentSection(text('pinned'), pinned) + renderRecentSection(text('recent'), recent);
    list.innerHTML = markup || `<div class="tc-empty-state"><i class="fa-solid fa-comments" aria-hidden="true"></i><span>${escapeHtml(text('noRecent'))}</span></div>`;
}

async function openRecentChat(index) {
    const item = state.recentChats[index];
    if (!item) {
        return;
    }
    const context = getContext();
    if (item.group) {
        const chatId = String(item.file_name || '').replace(/\.jsonl$/i, '');
        await context?.openGroupChat?.(String(item.group), chatId);
    } else {
        const characterIndex = characters.findIndex(character => character.avatar === item.avatar);
        if (characterIndex >= 0) {
            await selectCharacterById(String(characterIndex), { switchMenu: false });
            await getContext()?.openCharacterChat?.(item.file_name);
        }
    }
    navigate('chat');
}

async function pinRecentChat(index) {
    const item = state.recentChats[index];
    if (!item) {
        return false;
    }
    const pinned = toggleRecentChatPin(item);
    if (pinned === null) {
        return false;
    }
    await refreshRecentChats();
    return true;
}

async function renameRecentChat(index) {
    const item = state.recentChats[index];
    if (!item) {
        return false;
    }
    const renamed = await renameRecentChatByReference(item);
    if (renamed) {
        await refreshRecentChats();
    }
    return renamed;
}

async function deleteRecentChat(index) {
    const item = state.recentChats[index];
    if (!item || !globalThis.confirm(text('deleteChatConfirm'))) {
        return false;
    }
    const fileName = String(item.file_name || '').trim().replace(/\.jsonl$/i, '');
    if (!fileName) {
        globalThis.toastr?.error?.(text('deleteChatFailed'));
        return false;
    }
    let deleted = false;
    if (item.group) {
        deleted = Boolean(await deleteGroupChatByName(String(item.group), fileName));
    } else {
        const characterIndex = characters.findIndex(character => character.avatar === item.avatar);
        if (characterIndex >= 0) {
            deleted = Boolean(await deleteCharacterChatByName(String(characterIndex), fileName));
        }
    }
    if (!deleted) {
        globalThis.toastr?.error?.(text('deleteChatFailed'));
        return false;
    }
    await refreshRecentChats();
    await renderChatChrome();
    return true;
}

function currentEntity() {
    const context = getContext();
    const group = context?.groupId ? context.groups.find(item => String(item.id) === String(context.groupId)) : null;
    const character = !group && Number.isInteger(Number(context?.characterId)) ? characters[Number(context.characterId)] : null;
    return { context, group, character };
}

function currentPersonaAvatar() {
    try {
        return getUserAvatar(user_avatar) || '/favicon.ico';
    } catch {
        return '/favicon.ico';
    }
}

async function renderChatChrome() {
    const header = document.querySelector('#tc-chat-header');
    const panel = document.querySelector('#tc-context-panel');
    if (!header || !panel) {
        return;
    }
    const token = ++state.chatRenderToken;
    const { context, group, character } = currentEntity();
    const entity = group || character;
    const name = group?.name || (character ? getCharacterName(character) : text('noCharacter'));
    const avatar = group ? getGroupAvatar(group) : character ? getCharacterAvatar(character) : '/favicon.ico';
    const connected = context?.onlineStatus && context.onlineStatus !== 'no_connection';
    let location = text('unknownLocation');
    let worldEnabled = false;
    if (character && globalThis.Taverncraft?.worldEngine) {
        try {
            const [worldState, worldSettings] = await Promise.all([
                globalThis.Taverncraft.worldEngine.getState(),
                Promise.resolve(globalThis.Taverncraft.worldEngine.getSettings()),
            ]);
            location = String(worldState?.location?.current || '').trim() || location;
            worldEnabled = Boolean(worldSettings?.enabled);
        } catch {
            worldEnabled = false;
        }
    }
    if (token !== state.chatRenderToken) {
        return;
    }

    header.innerHTML = `
        <button type="button" class="tc-mobile-header-button" data-tc-action="toggle-mobile-recents" aria-label="${escapeHtml(text('openSidebar'))}"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
        <img src="${escapeHtml(avatar)}" alt="">
        <div class="tc-chat-title"><strong>${escapeHtml(name)}</strong><span><i class="tc-presence ${connected ? 'online' : ''}"></i>${escapeHtml(group ? text('groupMembers') : location)}</span></div>
        <div class="tc-chat-header-actions">
            <button type="button" data-tc-action="regenerate" aria-label="${escapeHtml(text('regenerate'))}" title="${escapeHtml(text('regenerate'))}"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i></button>
            <button type="button" data-tc-action="toggle-mobile-context" aria-label="${escapeHtml(text('context'))}" title="${escapeHtml(text('context'))}"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></button>
        </div>`;

    if (!entity) {
        panel.innerHTML = `<div class="tc-context-empty"><i class="fa-solid fa-address-card" aria-hidden="true"></i><h2>${escapeHtml(text('noCharacter'))}</h2><button type="button" class="tc-header-action primary" data-tc-route="library">${escapeHtml(text('library'))}</button></div>`;
        hydrateMessageAvatars();
        return;
    }

    if (group) {
        panel.innerHTML = renderGroupContext(group);
    } else {
        const description = stripMarkup(getCharacterDescription(character)) || text('noDescription');
        const tags = Array.isArray(character?.data?.tags) ? character.data.tags : [];
        const activeWorldCount = document.querySelectorAll('#world_info option:checked').length;
        panel.innerHTML = `
            <div class="tc-context-portrait"><img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}"></div>
            <div class="tc-context-body">
                <span class="tc-kicker">${escapeHtml(text('characterContext'))}</span>
                <h2>${escapeHtml(name)}</h2>
                <p>${escapeHtml(description)}</p>
                ${tags.length ? `<div class="tc-tag-list">${tags.slice(0, 6).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                <button type="button" class="tc-context-card" data-tc-action="manage-world"><span><i class="fa-solid fa-book-atlas" aria-hidden="true"></i><span><strong>${escapeHtml(text('worldInfo'))}</strong><small>${activeWorldCount} ${escapeHtml(text('worldEntries'))}</small></span></span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
                <div class="tc-context-card static"><span><i class="fa-solid fa-compass" aria-hidden="true"></i><span><strong>${escapeHtml(text('worldEngine'))}</strong><small>${escapeHtml(worldEnabled ? text('enabled') : text('disabled'))} · ${escapeHtml(location)}</small></span></span></div>
                <button type="button" class="tc-persona-row" data-tc-action="switch-persona"><img src="${escapeHtml(currentPersonaAvatar())}" alt=""><span><small>${escapeHtml(text('currentPersona'))}</small><strong>${escapeHtml(context?.name1 || '')}</strong></span><span>${escapeHtml(text('switchPersona'))}</span></button>
                <button type="button" class="tc-header-action wide" data-tc-action="edit-character"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>${escapeHtml(text('editCharacter'))}</button>
            </div>`;
    }
    hydrateMessageAvatars();
}

function hydrateMessageAvatars() {
    const { group, character } = currentEntity();
    const personaAvatar = currentPersonaAvatar();
    document.querySelectorAll('#chat .mes .avatar img').forEach(image => {
        if (image.getAttribute('src')) {
            return;
        }
        const message = image.closest('.mes');
        if (message?.getAttribute('is_user') === 'true') {
            image.src = personaAvatar;
            return;
        }
        let messageCharacter = character;
        if (group) {
            const messageName = message?.getAttribute('ch_name') || '';
            messageCharacter = characters.find(item => getCharacterName(item) === messageName) || null;
        }
        image.src = messageCharacter ? getCharacterAvatar(messageCharacter) : getGroupAvatar(group);
    });
}

function renderGroupContext(group) {
    const disabledMembers = Array.isArray(group.disabled_members) ? group.disabled_members : [];
    const members = (group.members || []).map(avatar => characters.find(character => character.avatar === avatar)).filter(Boolean);
    const memberMarkup = members.map(character => {
        const muted = disabledMembers.includes(character.avatar);
        return `<button type="button" class="tc-member-row" data-tc-action="toggle-group-member" data-avatar="${escapeHtml(character.avatar)}"><img src="${escapeHtml(getCharacterAvatar(character))}" alt=""><span><strong>${escapeHtml(getCharacterName(character))}</strong><small>${escapeHtml(muted ? text('participantMuted') : text('participantActive'))}</small></span><i class="fa-solid ${muted ? 'fa-toggle-off' : 'fa-toggle-on'}" aria-hidden="true"></i></button>`;
    }).join('');
    return `
        <div class="tc-context-body tc-group-context">
            <span class="tc-kicker">${escapeHtml(text('groupContext'))}</span>
            <h2>${escapeHtml(group.name || text('chat'))}</h2>
            <p>${members.length} ${escapeHtml(text('characters'))}</p>
            <div class="tc-member-list">${memberMarkup}</div>
            <button type="button" class="tc-header-action primary wide" data-tc-action="manage-group"><i class="fa-solid fa-user-plus" aria-hidden="true"></i>${escapeHtml(text('inviteCharacter'))}</button>
        </div>`;
}

async function toggleGroupMember(avatar) {
    const { context, group } = currentEntity();
    if (!group || !avatar) {
        return;
    }
    group.disabled_members = Array.isArray(group.disabled_members) ? group.disabled_members : [];
    const index = group.disabled_members.indexOf(avatar);
    if (index >= 0) {
        group.disabled_members.splice(index, 1);
    } else {
        group.disabled_members.push(avatar);
    }
    await editGroup(group.id, true, false);
    await context?.eventSource?.emit?.(context.eventTypes.GROUP_UPDATED);
    await renderChatChrome();
}

function openCurrentGroupManager() {
    const { group } = currentEntity();
    if (!group) {
        return;
    }
    activateNativePanel('#right-nav-panel');
    select_group_chats(group.id, false);
    navigate('group');
}

function ensureLibraryControls() {
    const characterBlock = document.querySelector('#rm_characters_block');
    if (!characterBlock || document.querySelector('#tc-library-filters')) {
        return;
    }
    const controls = document.createElement('div');
    controls.id = 'tc-library-filters';
    controls.className = 'tc-library-filters';
    controls.innerHTML = ['all', 'favorites', 'recentlyUsed', 'tags'].map(filter => `<button type="button" data-tc-library-filter="${filter}" class="${filter === state.libraryFilter ? 'active' : ''}">${escapeHtml(text(filter))}</button>`).join('');
    characterBlock.prepend(controls);
    controls.addEventListener('click', event => {
        const button = event.target.closest('[data-tc-library-filter]');
        if (!button) {
            return;
        }
        state.libraryFilter = button.dataset.tcLibraryFilter;
        controls.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        applyLibraryFilter();
    });
    applyLibraryFilter();
}

function applyLibraryFilter() {
    const showTags = state.libraryFilter === 'tags';
    document.querySelectorAll('#rm_characters_block .rm_tag_controls').forEach(element => element.classList.toggle('tc-force-visible', showTags));
    document.querySelectorAll('#rm_print_characters_block .character_select').forEach(card => {
        const character = characters[Number(card.getAttribute('chid'))];
        let visible = true;
        if (state.libraryFilter === 'favorites') {
            visible = Boolean(character && isCharacterFavorite(character));
        } else if (state.libraryFilter === 'recentlyUsed') {
            visible = Boolean(Number(character?.date_last_chat) > 0);
        }
        card.classList.toggle('tc-filter-hidden', !visible);
    });
    document.querySelectorAll('#rm_print_characters_block .group_select').forEach(card => {
        const groupId = card.getAttribute('data-grid');
        const group = getContext()?.groups?.find(item => String(item.id) === String(groupId));
        let visible = true;
        if (state.libraryFilter === 'favorites') {
            visible = Boolean(group?.fav);
        } else if (state.libraryFilter === 'recentlyUsed') {
            visible = Boolean(Number(group?.date_last_chat) > 0);
        }
        card.classList.toggle('tc-filter-hidden', !visible);
    });
}

function ensureCreatorPreview() {
    const createBlock = document.querySelector('#rm_ch_create_block');
    if (!createBlock) {
        return;
    }
    if (!document.querySelector('#tc-character-preview')) {
        const preview = document.createElement('aside');
        preview.id = 'tc-character-preview';
        preview.className = 'tc-character-preview';
        createBlock.append(preview);
        for (const selector of ['#character_name_pole', '#description_textarea', '#firstmessage_textarea', '#tags_textarea', '#add_avatar_button']) {
            document.querySelector(selector)?.addEventListener('input', updateCreatorPreview);
            document.querySelector(selector)?.addEventListener('change', updateCreatorPreview);
        }
    }
    updateCreatorPreview();
    setTimeout(updateCreatorPreview, 250);
}

function updateCreatorPreview() {
    const preview = document.querySelector('#tc-character-preview');
    if (!preview) {
        return;
    }
    const name = document.querySelector('#character_name_pole')?.value || text('createCharacter');
    const description = document.querySelector('#description_textarea')?.value || text('noDescription');
    const greeting = document.querySelector('#firstmessage_textarea')?.value || text('previewEmpty');
    const avatar = document.querySelector('#avatar_load_preview')?.src || '/favicon.ico';
    const tags = String(document.querySelector('#tags_textarea')?.value || '').split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 5);
    preview.innerHTML = `<span class="tc-kicker">${escapeHtml(text('preview'))}</span><div class="tc-preview-profile"><img src="${escapeHtml(avatar)}" alt=""><div><h2>${escapeHtml(name)}</h2><p>${escapeHtml(description)}</p></div></div>${tags.length ? `<div class="tc-tag-list">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}<div class="tc-preview-message"><img src="${escapeHtml(avatar)}" alt=""><div><strong>${escapeHtml(name)}</strong><p>${escapeHtml(greeting)}</p></div></div>`;
}

function observeNativeUi() {
    const characterList = document.querySelector('#rm_print_characters_block');
    if (characterList) {
        const libraryObserver = new MutationObserver(() => {
            if (state.view === 'library') {
                applyLibraryFilter();
                renderViewHeader();
            }
        });
        libraryObserver.observe(characterList, { childList: true, subtree: true });
    }

    const chat = document.querySelector('#chat');
    if (chat) {
        const chatObserver = new MutationObserver(hydrateMessageAvatars);
        chatObserver.observe(chat, { childList: true, subtree: true });
    }

    const creator = document.querySelector('#rm_ch_create_block');
    if (creator) {
        const creatorObserver = new MutationObserver(() => {
            const isVisible = creator.style.display !== 'none' && !creator.classList.contains('displayNone');
            if (isVisible && ['library', 'creator'].includes(state.view)) {
                navigate('creator');
            } else if (!isVisible && state.view === 'creator') {
                navigate('library');
            }
        });
        creatorObserver.observe(creator, { attributes: true, attributeFilter: ['class', 'style'] });
    }
}

function bindApplicationEvents() {
    const refreshChatEvents = [
        event_types.CHAT_CHANGED,
        event_types.CHAT_LOADED,
        event_types.CHAT_CREATED,
        event_types.CHAT_RENAMED,
        event_types.CHAT_DELETED,
        event_types.MESSAGE_SENT,
        event_types.MESSAGE_RECEIVED,
        event_types.MESSAGE_UPDATED,
    ];
    refreshChatEvents.forEach(eventName => eventSource.on(eventName, () => {
        if ([event_types.CHAT_CHANGED, event_types.CHAT_LOADED, event_types.CHAT_CREATED].includes(eventName)) {
            navigate('chat');
        }
        void renderChatChrome();
        if ([event_types.CHAT_CHANGED, event_types.CHAT_LOADED, event_types.CHAT_CREATED, event_types.CHAT_RENAMED, event_types.CHAT_DELETED].includes(eventName)) {
            void refreshRecentChats();
        }
    }));

    const entityEvents = [
        event_types.CHARACTER_PAGE_LOADED,
        event_types.CHARACTER_EDITED,
        event_types.CHARACTER_IMPORTED,
        event_types.CHARACTER_DELETED,
        event_types.GROUP_UPDATED,
        event_types.PERSONA_CHANGED,
        event_types.PERSONA_UPDATED,
        event_types.WORLDINFO_UPDATED,
        event_types.WORLD_INFO_ACTIVATED,
        event_types.ONLINE_STATUS_CHANGED,
        event_types.SETTINGS_UPDATED,
    ];
    entityEvents.forEach(eventName => eventSource.on(eventName, () => {
        void renderChatChrome();
        if ([event_types.CHARACTER_PAGE_LOADED, event_types.CHARACTER_EDITED, event_types.CHARACTER_IMPORTED, event_types.CHARACTER_DELETED, event_types.GROUP_UPDATED].includes(eventName)) {
            void refreshRecentChats();
        }
    }));
    eventSource.on(event_types.OPEN_CHARACTER_LIBRARY, () => navigate('library'));
    eventSource.on(event_types.CHARACTER_EDITOR_OPENED, () => navigate('creator'));
}

function installPublicUiApi() {
    globalThis.Taverncraft.ui = {
        navigate,
        refresh: async () => {
            await Promise.all([refreshRecentChats(), renderChatChrome()]);
        },
        getState: () => ({
            view: state.view,
            theme: document.body.dataset.tcTheme,
            settingsSection: state.settingsSection,
        }),
        useClassic: requestClassicUi,
        editCurrentCharacter,
        openCurrentGroupManager,
    };
}

function initializeModernUi() {
    if (shouldUseClassicUi()) {
        mountClassicSwitcher();
        return;
    }
    localStorage.setItem(MODE_STORAGE_KEY, 'modern');
    document.body.classList.add('tc-modern-ui');
    document.body.dataset.tcTheme = localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
    document.body.classList.toggle('tc-context-collapsed', state.contextCollapsed);
    createShell();
    bindShell();
    configureSettingsPanels();
    ensureAppearanceUtilities();
    bindApplicationEvents();
    observeNativeUi();
    ensureQuickActions();
    ensureLibraryControls();
    installPublicUiApi();
    navigate(this_chid === undefined && !getContext()?.groupId ? 'library' : 'chat');
    void refreshRecentChats();
    void renderChatChrome();
    syncContextPanel();
}

eventSource.on(event_types.APP_READY, initializeModernUi);
