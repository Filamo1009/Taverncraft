// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 FunnyCups (https://github.com/funnycups)

void import('./main.js').catch((error) => {
    console.error('[world_engine] Failed to initialize', error);
    document.documentElement.dataset.worldEngineError = String(error?.stack || error?.message || error);
});
