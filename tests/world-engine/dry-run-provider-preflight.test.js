import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const scriptSource = fs.readFileSync(path.resolve(testDir, '../../public/script.js'), 'utf8');

describe('Generate dry-run provider preflight', () => {
    test('offline prompt assembly bypasses Kobold and Horde provider-only guards', () => {
        expect(scriptSource).toContain("if (!dryRun && main_api == 'kobold' && kai_settings.streaming_kobold && !kai_flags.can_use_streaming)");
        expect(scriptSource).toContain('if (!dryRun && isHordeGenerationNotAllowed())');
        expect(scriptSource).toContain("if (!dryRun && main_api == 'koboldhorde' && (horde_settings.auto_adjust_context_length || horde_settings.auto_adjust_response_length))");
        expect(scriptSource).toContain("if (main_api == 'koboldhorde' && adjustedParams && horde_settings.auto_adjust_response_length)");
    });
});
