#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const assetDirectory = path.join(scriptDirectory, 'tavern-dependencies');

const extensions = [
    {
        name: 'Tavern Helper',
        directory: 'JS-Slash-Runner',
        repository: 'https://github.com/N0VI028/JS-Slash-Runner.git',
        branch: 'main',
    },
    {
        name: 'ST-Prompt-Template',
        directory: 'ST-Prompt-Template',
        repository: 'https://github.com/zonde306/ST-Prompt-Template.git',
        branch: 'main',
    },
];

const scriptAssets = [
    '01-mvu-magvarupdate.v1.0.0.json',
    '02-mvu-zod-schema-bridge.v1.0.0.json',
];

function usage() {
    return [
        'Install Tavern Helper, ST-Prompt-Template, MVU, and mvu_zod locally.',
        '',
        'Usage:',
        '  npm run tavern:deps:install',
        '  npm run tavern:deps:install -- --data-root /path/to/data --user default-user',
    ].join('\n');
}

function parseArguments(argumentsList) {
    const options = {
        dataRoot: path.join(repositoryRoot, 'data'),
        user: 'default-user',
    };

    for (let index = 0; index < argumentsList.length; index += 1) {
        const argument = argumentsList[index];

        if (argument === '--help' || argument === '-h') {
            console.log(usage());
            process.exit(0);
        }

        if (argument === '--data-root' || argument === '--user') {
            const value = argumentsList[index + 1];
            if (!value || value.startsWith('--')) {
                throw new Error(`Missing value for ${argument}`);
            }

            if (argument === '--data-root') {
                options.dataRoot = path.resolve(value);
            } else {
                options.user = value;
            }

            index += 1;
            continue;
        }

        throw new Error(`Unknown argument: ${argument}`);
    }

    if (
        options.user === '.'
        || options.user === '..'
        || options.user !== path.basename(options.user)
    ) {
        throw new Error('--user must be a single profile directory name');
    }

    return options;
}

async function pathExists(targetPath) {
    try {
        await stat(targetPath);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

async function runGit(argumentsList, workingDirectory) {
    const result = await execFileAsync('git', argumentsList, {
        cwd: workingDirectory,
        maxBuffer: 10 * 1024 * 1024,
    });
    return result.stdout.trim();
}

function normalizeRepositoryUrl(url) {
    return url.trim().replace(/\.git$/, '').replace(/\/$/, '').toLowerCase();
}

async function installExtension(extension, extensionsDirectory) {
    const targetDirectory = path.join(extensionsDirectory, extension.directory);

    if (!(await pathExists(targetDirectory))) {
        console.log(`Installing ${extension.name}...`);
        await runGit([
            'clone',
            '--depth', '1',
            '--branch', extension.branch,
            extension.repository,
            targetDirectory,
        ], extensionsDirectory);
    } else {
        if (!(await pathExists(path.join(targetDirectory, '.git')))) {
            throw new Error(`${extension.name} exists but is not a Git checkout: ${targetDirectory}`);
        }

        const status = await runGit(['status', '--porcelain'], targetDirectory);
        if (status) {
            throw new Error(`${extension.name} has local changes; update refused: ${targetDirectory}`);
        }

        const remote = await runGit(['remote', 'get-url', 'origin'], targetDirectory);
        if (normalizeRepositoryUrl(remote) !== normalizeRepositoryUrl(extension.repository)) {
            throw new Error(`${extension.name} uses an unexpected origin: ${remote}`);
        }

        const branch = await runGit(['branch', '--show-current'], targetDirectory);
        if (branch !== extension.branch) {
            throw new Error(`${extension.name} must be on ${extension.branch}; found ${branch || 'detached HEAD'}`);
        }

        console.log(`Updating ${extension.name}...`);
        await runGit(['pull', '--ff-only', 'origin', extension.branch], targetDirectory);
    }

    const manifestPath = path.join(targetDirectory, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    console.log(`Verified ${extension.name} ${manifest.version ?? '(version not declared)'}`);
}

function upsertScripts(currentScripts, desiredScripts) {
    const merged = [...currentScripts];

    for (const desiredScript of desiredScripts) {
        const matches = merged
            .map((script, index) => ({ script, index }))
            .filter(({ script }) => (
                script?.id === desiredScript.id || script?.name === desiredScript.name
            ));

        if (matches.length === 0) {
            merged.push(desiredScript);
            continue;
        }

        const insertionIndex = matches[0].index;
        merged[insertionIndex] = desiredScript;

        for (const match of matches.slice(1).reverse()) {
            merged.splice(match.index, 1);
        }
    }

    return merged;
}

async function installScripts(settingsPath) {
    if (!(await pathExists(settingsPath))) {
        throw new Error(`TavernCraft profile settings not found: ${settingsPath}`);
    }

    const originalText = await readFile(settingsPath, 'utf8');
    const settings = JSON.parse(originalText);
    const desiredScripts = await Promise.all(scriptAssets.map(async (fileName) => (
        JSON.parse(await readFile(path.join(assetDirectory, fileName), 'utf8'))
    )));

    settings.extension_settings ??= {};
    settings.extension_settings.tavern_helper ??= {};
    settings.extension_settings.tavern_helper.script ??= {};

    const scriptSettings = settings.extension_settings.tavern_helper.script;
    const enabled = scriptSettings.enabled && typeof scriptSettings.enabled === 'object'
        ? scriptSettings.enabled
        : {};
    enabled.global = true;
    scriptSettings.enabled = enabled;
    scriptSettings.scripts = upsertScripts(
        Array.isArray(scriptSettings.scripts) ? scriptSettings.scripts : [],
        desiredScripts,
    );

    const nextText = `${JSON.stringify(settings, null, 4)}\n`;
    const semanticallyUnchanged = JSON.stringify(JSON.parse(originalText)) === JSON.stringify(settings);

    if (semanticallyUnchanged) {
        console.log('Global MVU and mvu_zod scripts are already current.');
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${settingsPath}.tavern-deps-backup-${timestamp}`;
    const temporaryPath = `${settingsPath}.tavern-deps-${process.pid}.tmp`;

    await copyFile(settingsPath, backupPath);
    await writeFile(temporaryPath, nextText, 'utf8');
    await rename(temporaryPath, settingsPath);
    console.log(`Installed global MVU and mvu_zod scripts; backup: ${backupPath}`);
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const profileDirectory = path.join(options.dataRoot, options.user);
    const extensionsDirectory = path.join(profileDirectory, 'extensions');
    const settingsPath = path.join(profileDirectory, 'settings.json');

    await mkdir(extensionsDirectory, { recursive: true });

    for (const extension of extensions) {
        await installExtension(extension, extensionsDirectory);
    }

    await installScripts(settingsPath);
    console.log(`Tavern runtime dependencies are ready for ${profileDirectory}`);
}

main().catch((error) => {
    console.error(`Installation failed: ${error.message}`);
    process.exitCode = 1;
});
