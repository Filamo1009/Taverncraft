(function bootstrapTavernCraftUi() {
    const modeStorageKey = 'taverncraft.ui.mode';

    try {
        const url = new URL(globalThis.location.href);
        const base = document.querySelector('base');
        if (base && (url.pathname === '/play' || url.pathname === '/play/')) {
            // Keep fragment-only controls local when Cloudflare mounts the app at /play.
            // Otherwise <base href="/"> makes jQuery UI treat #tabs as remote URLs,
            // fetch the whole application again, and nest a duplicate UI inside a tab.
            base.setAttribute('href', url.pathname);
        }

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
