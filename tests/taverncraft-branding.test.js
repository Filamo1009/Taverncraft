import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDirectory, '..');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

describe('Taverncraft public branding', () => {
    test('uses Taverncraft for package, PWA, web, and Electron surfaces', () => {
        const rootPackage = readJson('package.json');
        const electronPackage = readJson('src/electron/package.json');
        const manifest = readJson('public/manifest.json');

        expect(rootPackage.name).toBe('taverncraft');
        expect(rootPackage.displayName).toBe('Taverncraft 酒馆工坊');
        expect(rootPackage.bin).toMatchObject({
            taverncraft: './src/server-global.js',
            luker: './src/server-global.js',
        });
        expect(electronPackage.name).toBe('taverncraft-electron');
        expect(manifest).toMatchObject({
            name: 'Taverncraft 酒馆工坊',
            short_name: 'Taverncraft',
        });
        expect(readText('public/index.html')).toContain('<title>Taverncraft</title>');
        expect(readText('public/login.html')).toContain('<title>Taverncraft</title>');
    });

    test('keeps explicit compatibility aliases for existing integrations', () => {
        const client = readText('public/script.js');
        const characterEndpoint = readText('src/endpoints/characters.js');

        expect(client).toContain('globalThis.Taverncraft = lukerApi;');
        expect(client).toContain('globalThis.Luker = lukerApi;');
        expect(characterEndpoint).toContain("response.setHeader('X-Taverncraft-Export-Warning'");
        expect(characterEndpoint).toContain("response.setHeader('X-Luker-Export-Warning'");
    });
});
