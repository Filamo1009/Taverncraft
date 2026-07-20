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

    test('loads the redesign after the original application modules', () => {
        expect(index).toContain('css/taverncraft-modern.css');
        expect(init).toContain('import(\'./scripts/taverncraft-ui/main.js\')');
        expect(init.indexOf('import(\'./script.js\')')).toBeLessThan(init.indexOf('import(\'./scripts/taverncraft-ui/main.js\')'));
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
        '#extensionsMenu',
    ])('settings section %s reuses the original panel', selector => {
        expect(ui).toContain(`'${selector}'`);
    });

    test('retains an explicit classic UI escape hatch', () => {
        expect(ui).toContain('queryMode === \'classic\'');
        expect(ui).toContain('button.id = \'tc-enable-modern\'');
        expect(ui).toContain('globalThis.confirm(text(\'classicConfirm\'))');
        expect(css).toContain('#tc-enable-modern');
    });

    test('defines desktop, mobile, dark, light, and simplified settings states', () => {
        expect(ui).toContain('localStorage.getItem(SETTINGS_MODE_STORAGE_KEY) === \'advanced\' ? \'advanced\' : \'simple\'');
        expect(ui).toContain('localStorage.getItem(THEME_STORAGE_KEY) === \'light\' ? \'light\' : \'dark\'');
        expect(ui).toContain('globalThis.confirm(text(confirmationKey))');
        expect(ui).toContain('const isLightTheme = document.body.dataset.tcTheme === \'light\'');
        expect(css).toContain('data-tc-theme=\'light\'');
        expect(css).toContain('--SmartThemeBodyColor: var(--tc-text)');
        expect(css).toContain('data-tc-theme=\'light\'] .drawer-content.tc-active-native');
        expect(css).toContain('data-tc-settings-mode=\'simple\'');
        expect(css).toContain('@media (max-width: 768px)');
        expect(css).toContain('.tc-mobile-nav');
        expect(css).toContain('.tc-mobile-recents-open');
        expect(css).toContain('.tc-mobile-context-open');
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
});
