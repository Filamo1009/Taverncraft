import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const mainSource = fs.readFileSync(
    path.resolve(testDir, '../../public/scripts/extensions/world-engine/main.js'),
    'utf8',
);

describe('World Engine Memory Graph opt-in boundary', () => {
    test('does not enable Memory Graph during startup', () => {
        expect(mainSource).toContain('autoEnableMemoryGraph: false');
        const startup = mainSource.slice(mainSource.indexOf('jQuery(() => {'));
        expect(startup).not.toContain('enableMemoryGraphFromExplicitOptIn(context)');
    });

    test('enables Memory Graph only from its explicit checkbox event', () => {
        expect(mainSource).toContain('event?.target?.id === \'world_engine_auto_memory\' && autoEnableMemoryGraph');
        expect(mainSource).toContain('enableMemoryGraphFromExplicitOptIn(context);');
        expect(mainSource).toContain('Memory Graph 长记忆（会增加后台模型请求）');
    });

    test('explicit memories are synced only after the Memory Graph opt-in', () => {
        expect(mainSource).toContain('if (ensureSettings().autoEnableMemoryGraph)');
        expect(mainSource).toContain('syncExplicitMemoriesToMemoryGraph(context, Number(messageId))');
    });
});
