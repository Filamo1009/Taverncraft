import { createRequire } from 'node:module';

import { describe, expect, test } from '@jest/globals';

const require = createRequire(import.meta.url);

describe('security dependency compatibility overrides', () => {
    test('onnx-proto remains ABI-compatible with patched protobufjs', () => {
        const { onnx } = require('onnx-proto');
        const protobufVersion = require('protobufjs/package.json').version;
        const [major, minor, patch] = protobufVersion.split('.').map(Number);
        expect([major, minor, patch]).toEqual(expect.arrayContaining([
            expect.any(Number),
            expect.any(Number),
            expect.any(Number),
        ]));
        expect(major > 7 || (major === 7 && (minor > 6 || (minor === 6 && patch >= 3)))).toBe(true);

        const model = {
            irVersion: 8,
            producerName: 'luker-security-compatibility-test',
            graph: { name: 'empty-graph', node: [], input: [], output: [], initializer: [] },
            opsetImport: [{ version: 18 }],
        };
        expect(onnx.ModelProto.verify(model)).toBeNull();
        const encoded = onnx.ModelProto.encode(onnx.ModelProto.create(model)).finish();
        const decoded = onnx.ModelProto.toObject(onnx.ModelProto.decode(encoded), { longs: Number });
        expect(decoded).toMatchObject({
            irVersion: 8,
            producerName: 'luker-security-compatibility-test',
            graph: { name: 'empty-graph' },
        });
    });
});
