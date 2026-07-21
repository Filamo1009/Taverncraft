/* eslint-disable playwright/no-standalone-expect */
import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, '..');
const readProjectFile = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

describe('TavernCraft modern UI integration contract', () => {
    const index = readProjectFile('public/index.html');
    const init = readProjectFile('public/init.js');
    const ui = readProjectFile('public/scripts/taverncraft-ui/main.js');
    const css = readProjectFile('public/css/taverncraft-modern.css');
    const bootstrap = readProjectFile('public/scripts/taverncraft-ui/bootstrap.js');

    test('loads the redesign after the original application modules', () => {
        expect(index).toContain('css/taverncraft-modern.css');
        expect(init).toContain('import(\'./scripts/taverncraft-ui/main.js\')');
        expect(init.indexOf('import(\'./script.js\')')).toBeLessThan(init.indexOf('import(\'./scripts/taverncraft-ui/main.js\')'));
    });

    test('normalizes forced UI mode before the application and background tabs initialize', () => {
        expect(index).toContain('scripts/taverncraft-ui/bootstrap.js');
        expect(index.indexOf('scripts/taverncraft-ui/bootstrap.js')).toBeLessThan(index.indexOf('<meta charset="utf-8">'));
        expect(bootstrap).toContain('requestedMode !== \'modern\' && requestedMode !== \'classic\'');
        expect(bootstrap).toContain('url.searchParams.delete(\'ui\')');
        expect(bootstrap).toContain('history.replaceState');
    });

    test.each([
        ['create character', '#rm_button_create'],
        ['import character', '#character_import_button'],
        ['create group', '#rm_button_group_chats'],
        ['create persona', '#create_dummy_persona'],
        ['import world info', '#world_import_button'],
        ['create world info', '#world_create_button'],
        ['regenerate', '#option_regenerate'],
        ['continue', '#option_continue'],
        ['impersonate', '#option_impersonate'],
    ])('%s delegates to the original control', (_label, selector) => {
        expect(ui).toContain(`'${selector}'`);
    });

    test.each([
        '#rm_api_block',
        '#left-nav-panel',
        '#AdvancedFormatting',
        '#PersonaManagement',
        '#WorldInfo',
        '#user-settings-block',
        '#Backgrounds',
        '#rm_extensions_block',
    ])('settings section %s reuses the original panel', selector => {
        expect(ui).toContain(`'${selector}'`);
    });

    test('does not confuse the composer wand menu with extension settings', () => {
        expect(ui).not.toContain('extensions: \'#extensionsMenu\'');
        expect(ui).toContain('extensions: \'#rm_extensions_block\'');
    });

    test('retains an explicit classic UI escape hatch', () => {
        expect(ui).toContain('queryMode === \'classic\'');
        expect(ui).toContain('button.id = \'tc-enable-modern\'');
        expect(ui).toContain('globalThis.confirm(text(\'classicConfirm\'))');
        expect(css).toContain('#tc-enable-modern');
    });

    test('defines desktop, mobile, dark, light, and unified settings states', () => {
        expect(ui).toContain('localStorage.getItem(THEME_STORAGE_KEY) === \'light\' ? \'light\' : \'dark\'');
        expect(ui).toContain('globalThis.confirm(text(confirmationKey))');
        expect(ui).toContain('const isLightTheme = document.body.dataset.tcTheme === \'light\'');
        expect(css).toContain('data-tc-theme=\'light\'');
        expect(css).toContain('--SmartThemeBodyColor: var(--tc-text)');
        expect(css).toContain('data-tc-theme=\'light\'] .drawer-content.tc-active-native');
        expect(ui).not.toContain('SETTINGS_MODE_STORAGE_KEY');
        expect(ui).not.toContain('data-tc-advanced');
        expect(css).not.toContain('data-tc-settings-mode');
        expect(css).toContain('@media (max-width: 768px)');
        expect(css).toContain('.tc-mobile-nav');
        expect(css).toContain('.tc-mobile-recents-open');
        expect(css).toContain('.tc-mobile-context-open');
        expect(css).toContain('mask-image: linear-gradient');
        expect(css).not.toMatch(/body\.tc-modern-ui #bg1,\s*body\.tc-modern-ui #top-bar/);
    });

    test('keeps persona management inside settings and exposes only three primary routes', () => {
        expect(ui.match(/navButton\('persona'/g)).toBeNull();
        expect(ui).toContain('selectSettingsSection(\'persona\')');
        expect(ui).toContain('settingsButton(\'persona\'');
        expect(ui).toContain('settingsButton(\'background\'');
        expect(ui).toContain('[\'chat\', \'library\', \'settings\', \'world\', \'creator\', \'group\']');
    });

    test('exposes accessible settings tabs and mobile-compatible interface controls', () => {
        expect(ui).toContain('role="tablist"');
        expect(ui).toContain('role="tab"');
        expect(ui).toContain('button.setAttribute(\'aria-selected\', String(isActive))');
        expect(ui).toContain('handleSettingsTabKeydown');
        expect(ui).toContain('tc-settings-theme-toggle');
        expect(ui).toContain('tc-settings-classic-toggle');
        expect(css).toContain('.tc-interface-utilities');
    });

    test('restores hot swaps and selected-character token tools in their matching views', () => {
        expect(css).toContain('data-tc-view=\'library\'] #right-nav-panel.tc-active-native > #CharListButtonAndHotSwaps');
        expect(css).toContain('data-tc-view=\'creator\'] #right-nav-panel.tc-active-native > #rm_PinAndTabs');
    });

    test('mounts after app readiness and restores the native character library directly', () => {
        expect(ui).toContain('eventSource.on(event_types.APP_READY, initializeModernUi)');
        expect(ui).toContain('select_rm_characters();');
        expect(ui).not.toContain('document.querySelector(\'#rm_button_characters\')?.click()');
    });

    test('keeps message hover actions legible in both themes', () => {
        expect(css).toContain('body.tc-modern-ui .mes_buttons .mes_button');
        expect(css).toContain('color: var(--tc-text-soft)');
        expect(css).toContain('background: color-mix(in srgb, var(--tc-surface) 94%, transparent)');
    });

    test('exposes recent conversation deletion through the original chat APIs', () => {
        expect(ui).toContain('data-tc-action="delete-recent"');
        expect(ui).toContain('deleteCharacterChatByName');
        expect(ui).toContain('deleteGroupChatByName');
        expect(ui).toContain('globalThis.confirm(text(\'deleteChatConfirm\'))');
        expect(css).toContain('.tc-recent-delete');
    });

    test('exposes recent conversation pinning and renaming through the original chat layer', () => {
        expect(ui).toContain('data-tc-action="pin-recent"');
        expect(ui).toContain('data-tc-action="rename-recent"');
        expect(ui).toContain('toggleRecentChatPin');
        expect(ui).toContain('renameRecentChatByReference');
        expect(css).toContain('.tc-recent-pin');
        expect(css).toContain('.tc-recent-rename');
    });
});
