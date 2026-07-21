import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, open, readFile, readdir, rename, rm, utimes } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const cloudflareDirectory = path.resolve(import.meta.dirname, '..');
const repositoryDirectory = path.resolve(cloudflareDirectory, '..');
const sourceDirectory = path.join(repositoryDirectory, 'data');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const privateRoot = path.join(homedir(), 'Library', 'Application Support', 'TavernCraft');
const backupDirectory = path.join(privateRoot, 'backups');
const outputDirectory = path.join(privateRoot, 'migrations', timestamp);
const stagedDataDirectory = path.join(outputDirectory, 'data');
const manifestPath = path.join(outputDirectory, 'migration-manifest.json');
const archivePath = path.join(backupDirectory, `taverncraft-data-${timestamp}.tar.gz`);

const excludedNames = new Set([
  '.DS_Store',
  'cookie-secret.txt',
  'secrets.json',
  'content.log',
]);
const excludedDirectories = new Set([
  '_cache',
  '_uploads',
  '_webpack',
  'diagnostic-reports',
  'thumbnails',
]);
const credentialPatterns = [
  ['OpenAI-style API key', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ['Hugging Face token', /\bhf_[A-Za-z0-9]{20,}\b/g],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['Bearer token', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*\b/g],
];

function shouldExclude(relativePath, directoryEntry) {
  const segments = relativePath.split(path.sep);
  if (excludedNames.has(directoryEntry.name)) return true;
  if (directoryEntry.isDirectory() && segments.some((segment) => excludedDirectories.has(segment))) return true;
  if (directoryEntry.isFile() && (directoryEntry.name.endsWith('.log') || directoryEntry.name.endsWith('.lock'))) return true;
  return false;
}

async function serverIsRunning() {
  try {
    await fetch('http://127.0.0.1:8000/', { signal: AbortSignal.timeout(1_500), redirect: 'manual' });
    return true;
  } catch {
    return false;
  }
}

function run(command, arguments_, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal || `exit ${code}`}).`));
    });
  });
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function copySanitized(currentSource, currentDestination, relativeBase, records, findings) {
  await mkdir(currentDestination, { recursive: true, mode: 0o700 });
  const entries = await readdir(currentSource, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.join(relativeBase, entry.name);
    if (shouldExclude(relativePath, entry)) continue;

    const sourcePath = path.join(currentSource, entry.name);
    const destinationPath = path.join(currentDestination, entry.name);
    const stat = await lstat(sourcePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to migrate symbolic link: ${relativePath}`);
    }
    if (stat.isDirectory()) {
      await copySanitized(sourcePath, destinationPath, relativePath, records, findings);
      continue;
    }
    if (!stat.isFile()) continue;

    await copyFile(sourcePath, destinationPath);
    await chmod(destinationPath, 0o600);
    await utimes(destinationPath, stat.atime, stat.mtime);

    const contentHash = await sha256(destinationPath);
    const manifestRelativePath = path.posix.join('data', ...relativePath.split(path.sep));
    records.push({ path: manifestRelativePath, size: stat.size, sha256: contentHash });

    if (stat.size <= 2 * 1024 * 1024) {
      const buffer = await readFile(destinationPath);
      if (!buffer.includes(0)) {
        const text = buffer.toString('utf8');
        for (const [label, pattern] of credentialPatterns) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) findings.push({ path: manifestRelativePath, detector: label });
        }
      }
    }
  }
}

async function writePrivateJson(target, value) {
  const temporary = `${target}.${process.pid}.tmp`;
  const handle = await open(temporary, 'w', 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
}

if (await serverIsRunning()) {
  throw new Error('TavernCraft is still running on 127.0.0.1:8000. Stop it before taking a consistent migration snapshot.');
}
if (!(await lstat(sourceDirectory).catch(() => null))?.isDirectory()) {
  throw new Error(`Data directory not found: ${sourceDirectory}`);
}

await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
await mkdir(outputDirectory, { recursive: true, mode: 0o700 });

try {
  console.log('Creating a private local backup before sanitization...');
  await run('tar', ['-czf', archivePath, '-C', repositoryDirectory, 'data']);
  await chmod(archivePath, 0o600);

  const files = [];
  const findings = [];
  await copySanitized(sourceDirectory, stagedDataDirectory, '', files, findings);
  files.sort((a, b) => a.path.localeCompare(b.path));

  if (findings.length > 0) {
    const findingSummary = findings.map((finding) => `${finding.path} (${finding.detector})`).join('\n');
    throw new Error(`Possible credentials remain in the sanitized snapshot. Nothing is ready to upload:\n${findingSummary}`);
  }

  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    source: 'TavernCraft local data',
    excludes: {
      credentials: ['**/secrets.json', '**/cookie-secret.txt'],
      regenerable: [...excludedDirectories].sort(),
      logs: ['**/*.log', '**/*.lock'],
    },
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    files,
  };
  await writePrivateJson(manifestPath, manifest);

  console.log(`Private full backup: ${archivePath}`);
  console.log(`Sanitized upload snapshot: ${outputDirectory}`);
  console.log(`Files ready: ${manifest.fileCount}; bytes: ${manifest.totalBytes}`);
  console.log('Review migration-manifest.json, then pass this directory to npm run migration:upload.');
} catch (error) {
  await rm(outputDirectory, { recursive: true, force: true });
  throw error;
}
