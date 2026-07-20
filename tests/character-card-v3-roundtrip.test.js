import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from '@jest/globals';
import extract from 'png-chunks-extract';
import PNGtext from 'png-chunk-text';

import { read, write } from '../src/character-card-parser.js';
import { TavernCardValidator } from '../src/validator/TavernCardValidator.js';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultFixturePath = path.resolve(testDirectory, '..', '..', 'v4.0.png');
const fixturePath = process.env.WORLD_ENGINE_TEST_CARD || defaultFixturePath;
const hasRealFixture = fs.existsSync(fixturePath);

function decodeCharacterChunks(image) {
    return Object.fromEntries(
        extract(new Uint8Array(image))
            .filter(chunk => chunk.name === 'tEXt')
            .map(chunk => PNGtext.decode(chunk.data))
            .filter(chunk => ['chara', 'ccv3'].includes(chunk.keyword.toLowerCase()))
            .map(chunk => [
                chunk.keyword.toLowerCase(),
                JSON.parse(Buffer.from(chunk.text, 'base64').toString('utf8')),
            ]),
    );
}

describe('Character Card V3 PNG round-trip', () => {
    test('preserves unknown V3 fields and extensions in both metadata chunks', () => {
        const sourceImage = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            'base64',
        );
        const sourceCard = {
            spec: 'chara_card_v3',
            spec_version: '3.0',
            unknown_root: { future: true },
            data: {
                name: 'Round-trip fixture',
                extensions: {
                    future_extension: {
                        nested: ['keep', { value: 42 }],
                    },
                },
                character_book: {
                    name: 'Embedded lore',
                    extensions: { future_book_field: 'keep' },
                    entries: [{
                        id: 1,
                        keys: ['keyword'],
                        content: 'Lore entry',
                        extensions: { future_entry_field: { keep: true } },
                    }],
                },
            },
        };

        const writtenImage = write(sourceImage, JSON.stringify(sourceCard));
        const readCard = JSON.parse(read(writtenImage));
        const chunks = decodeCharacterChunks(writtenImage);

        expect(new TavernCardValidator(readCard).validate()).toBe(3);
        expect(readCard).toStrictEqual(sourceCard);
        expect(chunks.ccv3).toStrictEqual(sourceCard);
        expect(chunks.chara).toStrictEqual(sourceCard);
    });
});

const describeRealFixture = hasRealFixture ? describe : describe.skip;

describeRealFixture('v4.0.png acceptance fixture', () => {
    test('imports the real V3 card with the expected embedded world book', () => {
        const image = fs.readFileSync(fixturePath);
        const chunks = decodeCharacterChunks(image);
        const decodedJson = read(image);
        const card = JSON.parse(decodedJson);
        const entries = card.data.character_book.entries;

        expect(image.readUInt32BE(16)).toBe(512);
        expect(image.readUInt32BE(20)).toBe(768);
        expect(crypto.createHash('sha256').update(decodedJson).digest('hex')).toBe('e031e7062ee7e9f140c72cecd0156625443a87391f4ee8400d2902893d804c8f');
        expect(new TavernCardValidator(card).validate()).toBe(3);
        expect(card.spec).toBe('chara_card_v3');
        expect(card.spec_version).toBe('3.0');
        expect(card.data.name).toBe('苍玄界');
        expect(card.data.alternate_greetings).toHaveLength(18);
        expect(entries).toHaveLength(174);
        expect(entries.filter(entry => entry.enabled !== false)).toHaveLength(173);
        expect(entries.filter(entry => entry.constant === true)).toHaveLength(33);
        expect(card.data.extensions).toEqual(expect.objectContaining({
            regex_scripts: expect.any(Array),
            tavern_helper: expect.any(Object),
            world: expect.any(String),
        }));
        expect(chunks.ccv3).toStrictEqual(chunks.chara);
    });

    test('preserves every V3 JSON value after PNG write and read', () => {
        const sourceImage = fs.readFileSync(fixturePath);
        const sourceCard = JSON.parse(read(sourceImage));
        const writtenImage = write(sourceImage, JSON.stringify(sourceCard));
        const roundTrippedCard = JSON.parse(read(writtenImage));
        const chunks = decodeCharacterChunks(writtenImage);

        expect(roundTrippedCard).toStrictEqual(sourceCard);
        expect(chunks.ccv3).toStrictEqual(sourceCard);
        expect(chunks.chara).toStrictEqual(sourceCard);
    });
});
