(() => {
    const BOOT_TIMEOUT_MS = 12_000;
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
    // The replacement keeps the release version and adds a one-off cache bypass.
    window.addEventListener('error', (event) => {
        retryAssetWithCacheBypass(event.target);
    }, true);

    window.setTimeout(() => {
        const loader = document.querySelector('[data-boot-loader]');
        const root = document.querySelector('#app');

        if (!loader || !root) {
            return;
        }

        root.innerHTML = `<main class="auth-stage" aria-label="Error al iniciar Hattitriki">
            <section class="auth-card">
                <img class="auth-crest" src="/hattitriki-app-icon.png" alt="">
                <h1>HATTITRIKI FC</h1>
                <p class="auth-description">La comprobación de la sesión está tardando demasiado.</p>
                <div class="auth-message" role="alert">Puedes reintentar o limpiar la sesión guardada en este navegador.</div>
                <div class="auth-form">
                    <button class="btn btn--wide" type="button" data-boot-action="retry">Reintentar</button>
                    <button class="btn btn--outline btn--wide" type="button" data-boot-action="reset">Limpiar sesión y reintentar</button>
                </div>
            </section>
        </main>`;

        root.querySelector('[data-boot-action="retry"]')?.addEventListener('click', () => {
            window.location.reload();
        });

        root.querySelector('[data-boot-action="reset"]')?.addEventListener('click', () => {
            for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
                const key = window.sessionStorage.key(index);

                if (key?.startsWith('sb-') && key.includes('-auth-token')) {
                    window.sessionStorage.removeItem(key);
                }
            }

            window.location.reload();
        });
    }, BOOT_TIMEOUT_MS);
})();
