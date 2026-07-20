import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const scriptSource = fs.readFileSync(path.resolve(testDir, '../../public/script.js'), 'utf8');
const bookmarksSource = fs.readFileSync(path.resolve(testDir, '../../public/scripts/bookmarks.js'), 'utf8');

describe('Character chat id normalization', () => {
    test('keeps internal chat ids extensionless when history rows are opened', () => {
        expect(scriptSource).toContain("const normalizedFileName = String(file_name || '').trim().replace(/\\.jsonl$/i, '');");
        expect(scriptSource).toContain('characters[chidSnapshot].chat = normalizedFileName;');
        expect(bookmarksSource).toContain("const fileName = String(rawFileName || '').replace(/\\.jsonl$/i, '');");
    });

    test('never appends jsonl to an already suffixed export name', () => {
        expect(scriptSource).toContain("const filename = String(displayedFilename || '').replace(/\\.jsonl$/i, '');");
        expect(scriptSource).toContain('file: `${filename}.jsonl`');
    });
});
