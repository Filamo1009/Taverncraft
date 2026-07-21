import { test, expect } from '@playwright/test';
import { startServer, tearDownServer } from '../_lib/server.js';
import { markOnboarded } from '../_lib/fixtures.js';

let server;

async function openApplication(page, url) {
    await page.goto(url);
    const gate = page.locator('#userList .userSelect:last-child');
    if (await gate.isVisible({ timeout: 2000 }).catch(() => false)) {
        await gate.click();
    }
    await page.waitForFunction(() => document.getElementById('preloader') === null, { timeout: 60_000 });
    await page.waitForFunction(() => Boolean(window.Taverncraft?.getContext), { timeout: 30_000 });
}

test.beforeAll(async () => {
    server = await startServer({ batchKey: 'regression', scenarioId: 'taverncraft-modern-parity' });
    markOnboarded({ dataRoot: server.dataRoot });
});

test.afterAll(async () => {
    await tearDownServer(server);
});

test.describe('#126 — TavernCraft modern/classic parity', () => {
    test('forced modes normalize early and never duplicate the application DOM', async ({ page }) => {
        await openApplication(page, `${server.baseURL}/?ui=modern`);
        await page.locator('#tc-modern-shell').waitFor({ state: 'attached' });

        expect(new URL(page.url()).searchParams.has('ui')).toBe(false);
        await expect(page.locator('#top-settings-holder')).toHaveCount(1);
        await expect(page.locator('#right-nav-panel')).toHaveCount(1);
        await expect(page.locator('#PersonaManagement')).toHaveCount(1);
        await expect(page.locator('#Backgrounds')).toHaveCount(1);

        await openApplication(page, `${server.baseURL}/?ui=classic`);
        await page.locator('#tc-enable-modern').waitFor({ state: 'visible' });
        expect(new URL(page.url()).searchParams.has('ui')).toBe(false);
        await expect(page.locator('#tc-modern-shell')).toHaveCount(0);
        await expect(page.locator('#top-settings-holder')).toHaveCount(1);
        await expect(page.locator('#right-nav-panel')).toHaveCount(1);
        await expect(page.locator('#PersonaManagement')).toHaveCount(1);

        await openApplication(page, `${server.baseURL}/?ui=modern`);
        await page.locator('#tc-modern-shell').waitFor({ state: 'attached' });
        expect(new URL(page.url()).searchParams.has('ui')).toBe(false);
        await expect(page.locator('#top-settings-holder')).toHaveCount(1);
        await expect(page.locator('#right-nav-panel')).toHaveCount(1);
    });

    test('all settings, library tools, and mobile compatibility controls are reachable', async ({ page }) => {
        await openApplication(page, `${server.baseURL}/?ui=modern`);
        await page.locator('#tc-modern-shell').waitFor({ state: 'attached' });

        const primaryRoutes = page.locator('.tc-rail-nav [data-tc-route]');
        await expect(primaryRoutes).toHaveCount(3);
        await expect(page.locator('#right-nav-panel.tc-active-native')).toBeVisible();
        expect(await page.locator('#rm_print_characters_block .character_select, #rm_print_characters_block .group_select').count()).toBeGreaterThan(0);
        expect(await page.locator('#rm_print_characters_block .character_select:visible, #rm_print_characters_block .group_select:visible').count()).toBeGreaterThan(0);
        await expect(page.locator('#CharListButtonAndHotSwaps')).toBeVisible();

        await page.locator('.tc-rail-nav [data-tc-route="settings"]').click();
        await expect(page.locator('#tc-settings-nav [role="tab"]')).toHaveCount(8);

        const mappings = {
            connection: '#rm_api_block',
            generation: '#left-nav-panel',
            persona: '#PersonaManagement',
            appearance: '#user-settings-block',
            background: '#Backgrounds',
            prompts: '#AdvancedFormatting',
            world: '#WorldInfo',
            extensions: '#rm_extensions_block',
        };

        for (const [section, selector] of Object.entries(mappings)) {
            const tab = page.locator(`#tc-settings-nav [data-tc-settings-section="${section}"]`);
            await tab.click();
            await expect(tab).toHaveAttribute('aria-selected', 'true');
            await expect(page.locator(selector)).toBeVisible();
            await expect(page.locator(selector)).toHaveAttribute('aria-hidden', 'false');
        }

        await expect(page.locator('#rm_extensions_block #world_engine_enabled')).toBeAttached();
        await expect(page.locator('#bg_menu_content .bg_example, #bg_menu_content [data-bgfile], #bg_menu_content img')).not.toHaveCount(0);
        expect(await page.locator('#bg1').evaluate(el => getComputedStyle(el).display)).not.toBe('none');

        await page.locator('#tc-settings-nav [data-tc-settings-section="appearance"]').click();
        await expect(page.locator('#tc-settings-theme-toggle')).toBeVisible();
        await expect(page.locator('#tc-settings-classic-toggle')).toBeVisible();

        await page.locator('.tc-rail-nav [data-tc-route="library"]').click();
        await page.locator('[data-tc-action="create-character"]').click();
        await expect(page.locator('#rm_ch_create_block')).toBeVisible();
        await expect(page.locator('#rm_PinAndTabs')).toBeVisible();

        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.tc-mobile-nav [data-tc-route="settings"]').click();
        await expect(page.locator('.tc-mobile-nav [data-tc-route]')).toHaveCount(3);
        const mobileSettingsNav = page.locator('#tc-settings-nav');
        expect(await mobileSettingsNav.evaluate(el => getComputedStyle(el).maskImage)).not.toBe('none');
        const mobileAppearanceTab = page.locator('#tc-settings-nav [data-tc-settings-section="appearance"]');
        await mobileAppearanceTab.click();
        await expect(page.locator('#tc-settings-theme-toggle')).toBeVisible();
        await expect(page.locator('#tc-settings-classic-toggle')).toBeVisible();
        await mobileAppearanceTab.press('ArrowRight');
        await expect(page.locator('#tc-settings-nav [data-tc-settings-section="background"]')).toHaveAttribute('aria-selected', 'true');

        await page.locator('#tc-settings-nav [data-tc-settings-section="connection"]').click();
        const mobileOverflow = await page.locator('#rm_api_block').evaluate(el => ({
            overflowX: getComputedStyle(el).overflowX,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            overflowSources: Array.from(el.querySelectorAll('*'))
                .filter(child => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 1)
                .map(child => ({
                    tag: child.tagName,
                    id: child.id,
                    className: String(child.className),
                    right: Math.round(child.getBoundingClientRect().right),
                    width: Math.round(child.getBoundingClientRect().width),
                }))
                .slice(0, 10),
        }));
        expect(mobileOverflow.bodyOverflow).toBe(false);
        expect(mobileOverflow.overflowX).toBe('hidden');
        expect(
            mobileOverflow.scrollWidth,
            `Connection settings overflow: ${JSON.stringify(mobileOverflow.overflowSources)}`,
        ).toBeLessThanOrEqual(mobileOverflow.clientWidth + 1);
    });
});
