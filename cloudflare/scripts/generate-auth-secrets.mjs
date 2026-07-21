import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { mkdir, open, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const DEFAULT_OUTPUT = path.join(
  homedir(),
  'Library',
  'Application Support',
  'TavernCraft',
  'cloudflare-auth-secrets.json',
);

async function readVisible(prompt) {
  const interface_ = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await interface_.question(prompt)).trim();
  } finally {
    interface_.close();
  }
}

async function readHidden(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('A local interactive terminal is required so the password is never echoed.');
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= ' ') value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}

async function writePrivateJson(target, value) {
  const parent = path.dirname(target);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.tmp`;
  const handle = await open(temporary, 'w', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' });
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
}

const email = await readVisible('Cloudflare login email: ');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Enter a valid email address.');
}

const password = await readHidden('Cloudflare login password (hidden): ');
if (password.length < 10) {
  throw new Error('Use a password with at least 10 characters.');
}

const confirmation = await readHidden('Confirm password (hidden): ');
if (password !== confirmation) {
  throw new Error('Passwords did not match.');
}

const salt = randomBytes(24);
const N = 32_768;
const r = 8;
const p = 1;
const derivedKey = await scrypt(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
const verifier = `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
const output = path.resolve(process.env.TAVERNCRAFT_SECRET_FILE || DEFAULT_OUTPUT);

await writePrivateJson(output, {
  LOGIN_EMAIL: email.toLowerCase(),
  LOGIN_PASSWORD_SCRYPT: verifier,
  SESSION_SIGNING_SECRET: randomBytes(48).toString('base64url'),
});

console.log(`Private Wrangler secret file created at: ${output}`);
console.log('The password itself was not stored. Keep this file outside Git and delete it after deployment if desired.');
