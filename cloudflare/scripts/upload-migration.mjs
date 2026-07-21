import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const [snapshotArgument, bucket, prefix = 'staging'] = process.argv.slice(2);
if (!snapshotArgument || !bucket) {
  throw new Error('Usage: npm run migration:upload -- /absolute/snapshot/path <r2-bucket> [prefix]');
}
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
  throw new Error('Invalid R2 bucket name.');
}
if (!/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(prefix) || prefix.includes('..')) {
  throw new Error('Invalid R2 object prefix.');
}

const snapshotDirectory = path.resolve(snapshotArgument);
const manifestPath = path.join(snapshotDirectory, 'migration-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
  throw new Error('Unsupported or malformed migration manifest.');
}

const wrangler = path.resolve(import.meta.dirname, '..', 'node_modules', '.bin', 'wrangler');

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

function uploadOnce(filePath, objectKey) {
  return new Promise((resolve, reject) => {
    const child = spawn(wrangler, ['r2', 'object', 'put', `${bucket}/${objectKey}`, '--file', filePath, '--remote'], {
      cwd: path.resolve(import.meta.dirname, '..'),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Upload failed for ${objectKey} (${signal || `exit ${code}`}): ${stderr.trim()}`));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function upload(filePath, objectKey) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await uploadOnce(filePath, objectKey);
      return;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      const backoffMs = 500 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      console.warn(`Retrying ${objectKey} after upload attempt ${attempt}/${maxAttempts} failed...`);
      await delay(backoffMs);
    }
  }
}

const queue = [];
for (const record of manifest.files) {
  if (typeof record.path !== 'string' || record.path.includes('..') || path.isAbsolute(record.path)) {
    throw new Error('Manifest contains an unsafe path.');
  }
  const filePath = path.resolve(snapshotDirectory, record.path);
  if (!filePath.startsWith(`${snapshotDirectory}${path.sep}`)) throw new Error('Manifest path escaped the snapshot directory.');
  const fileStat = await stat(filePath);
  if (!fileStat.isFile() || fileStat.size !== record.size || await sha256(filePath) !== record.sha256) {
    throw new Error(`Snapshot integrity check failed: ${record.path}`);
  }
  queue.push({ filePath, objectKey: `${prefix}/${record.path.split(path.sep).join('/')}` });
}

console.log(`Uploading ${queue.length} verified files to R2 bucket ${bucket} under ${prefix}/ ...`);
let completed = 0;
const concurrency = Math.min(4, queue.length || 1);
const workers = Array.from({ length: concurrency }, async () => {
  while (queue.length > 0) {
    const item = queue.shift();
    await upload(item.filePath, item.objectKey);
    completed += 1;
    if (completed % 25 === 0 || completed === manifest.fileCount) {
      console.log(`Uploaded ${completed}/${manifest.fileCount}`);
    }
  }
});
await Promise.all(workers);

await upload(manifestPath, `${prefix}/migration-manifest.json`);
console.log('Upload complete. The manifest was uploaded last as the completion marker.');
