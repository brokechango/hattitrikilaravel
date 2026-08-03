(() => {
    const RECOVERY_PARAMETER = 'asset-recovery';

    const isViteAsset = (element) => {
        if (! (element instanceof HTMLElement)) {
            return false;
        }

        const source = element instanceof HTMLLinkElement ? element.href : element.src;

        if (! source) {
            return false;
        }

        try {
            const url = new URL(source, window.location.href);

            return url.origin === window.location.origin
                && url.pathname.startsWith('/build/assets/');
        } catch {
            return false;
        }
    };

    const retryAssetWithCacheBypass = (element) => {
        if (! isViteAsset(element) || element.dataset.assetRecoveryAttempted === 'true') {
            return;
        }

        element.dataset.assetRecoveryAttempted = 'true';

        const attribute = element instanceof HTMLLinkElement ? 'href' : 'src';
        const retryUrl = new URL(element.getAttribute(attribute), window.location.href);
        retryUrl.searchParams.set(RECOVERY_PARAMETER, Date.now().toString());

        const replacement = document.createElement(element.tagName.toLowerCase());
        for (const { name, value } of element.attributes) {
            replacement.setAttribute(name, value);
        }
        replacement.dataset.assetRecoveryAttempted = 'true';
        replacement.setAttribute(attribute, retryUrl.toString());

        if (element instanceof HTMLLinkElement && element.rel === 'stylesheet') {
            replacement.addEventListener('load', () => element.remove(), { once: true });
        }

        element.after(replacement);
    };

    // Recover old tabs whose clean asset URL was poisoned by an HTML cache entry.
    window.addEventListener('error', (event) => {
        retryAssetWithCacheBypass(event.target);
    }, true);
})();
