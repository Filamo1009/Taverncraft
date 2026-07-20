import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serverSource = fs.readFileSync(path.resolve(testDir, '../e2e/_lib/server.js'), 'utf8');

describe('E2E seed isolation for optional AI extensions', () => {
    test('fresh chat-flow clones do not inherit developer Memory Graph activation', () => {
        expect(serverSource).toContain('extensions.memory_graph.enabled = false;');
        expect(serverSource).toContain('extensions.world_engine.autoEnableMemoryGraph = false;');
        expect(serverSource).toContain('extensions.world_engine.memoryGraphConfigured = false;');
    });
});
