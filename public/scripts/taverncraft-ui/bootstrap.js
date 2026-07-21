(function normalizeTavernCraftUiMode() {
    const modeStorageKey = 'taverncraft.ui.mode';

    try {
        const url = new URL(globalThis.location.href);
        const requestedMode = url.searchParams.get('ui');
        if (requestedMode !== 'modern' && requestedMode !== 'classic') {
            return;
        }

        localStorage.setItem(modeStorageKey, requestedMode);
        url.searchParams.delete('ui');

        const normalizedUrl = `${url.pathname}${url.search}${url.hash}`;
        globalThis.history.replaceState(globalThis.history.state, '', normalizedUrl);
    } catch (error) {
        console.warn('Unable to normalize TavernCraft UI mode.', error);
    }
})();
