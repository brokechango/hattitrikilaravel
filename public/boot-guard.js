(() => {
    const BOOT_TIMEOUT_MS = 12_000;

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
