import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../..');

describe('chat interaction race guards', () => {
    test('merge and split controls bind before their popup becomes visible', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'public/scripts/chat-merge-split.js'), 'utf8');

        expect(source).toMatch(/const resultPromise = popup\.show\(\);\s+bindMergeDialogBehavior\(popup\.dlg\.querySelector\('\.cms-dialog'\)/);
        expect(source).toMatch(/const resultPromise = popup\.show\(\);\s+bindSplitDialogBehavior\(popup\.dlg\.querySelector\('\.cms-dialog-split'\)/);
        expect(source).not.toMatch(/onOpen:\s*\(\)\s*=>\s*bindMergeDialogBehavior/);
        expect(source).not.toMatch(/onOpen:\s*\(\)\s*=>\s*bindSplitDialogBehavior/);
    });

    test('a send click during abort cleanup is coalesced instead of dropped', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'public/script.js'), 'utf8');

        expect(source).toContain('let queuedSendButtonClick = false;');
        expect(source).toContain('if (userInputGenerateMutex.isBusy)');
        expect(source).toContain('queuedSendButtonClick = true;');
        expect(source).toMatch(/while \(queuedSendButtonClick && String\(\$\('#send_textarea'\)\.val\(\) \?\? ''\)\.length > 0\)/);
    });
});
