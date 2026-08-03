import { prefersReducedMotion } from './motion';

let navigationId = 0;
let contentRevision = 0;
let motionModule = null;
let navigationInProgress = false;
let motionSetupQueued = false;
let dirtyForm = null;

async function importSupabaseCallback() {
    const parameters = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const accessToken = parameters.get('access_token');
    const refreshToken = parameters.get('refresh_token');
    const type = parameters.get('type');

    if (!accessToken || !refreshToken || !['invite', 'recovery'].includes(type)) return;

    history.replaceState({}, '', `${location.pathname}${location.search}`);
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

    try {
        const response = await fetch('/auth/supabase/callback', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken,
            },
            body: JSON.stringify({
                access_token: accessToken,
                refresh_token: refreshToken,
                type,
            }),
        });

        if (!response.ok) throw new Error('Supabase callback import failed.');
        location.replace(`/?auth_flow=${encodeURIComponent(type)}`);
    } catch {
        location.replace('/?auth_error=callback');
    }
}

async function setupMotion(routeChanged = false) {
    const root = document.querySelector('#app');
    if (!root) return;

    motionModule ??= await import('./app-motion');
    if (routeChanged || navigationId === 0) navigationId += 1;
    motionModule.setupAppMotion(root, {
        navigationId,
        contentRevision,
        reduceMotion: prefersReducedMotion(),
        skipVisibleReveal: navigationId > 1,
    });
}

function scheduleMotionSetup() {
    if (motionSetupQueued || navigationInProgress) return;

    motionSetupQueued = true;
    queueMicrotask(() => {
        motionSetupQueued = false;
        contentRevision += 1;
        void setupMotion(false);
    });
}

document.addEventListener('input', (event) => {
    const form = event.target.closest?.('form[data-unsaved-guard]');
    if (form) dirtyForm = form;
}, true);

document.addEventListener('change', (event) => {
    const form = event.target.closest?.('form[data-unsaved-guard]');
    if (form) dirtyForm = form;
}, true);

document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[wire\\:navigate]');
    if (!link || !dirtyForm || !document.contains(dirtyForm)) return;

    if (!window.confirm('Tienes cambios sin guardar. ¿Quieres salir de esta pantalla?')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
    }

    dirtyForm = null;
}, true);

window.addEventListener('beforeunload', (event) => {
    if (!dirtyForm || !document.contains(dirtyForm)) return;
    event.preventDefault();
    event.returnValue = '';
});

document.addEventListener('livewire:init', () => {
    globalThis.Livewire?.hook('morph.updating', () => {
        if (!navigationInProgress) motionModule?.cleanupAppMotion();
    });
    globalThis.Livewire?.hook('morph.updated', scheduleMotionSetup);
});

document.addEventListener('livewire:navigating', () => {
    navigationInProgress = true;
    motionModule?.cleanupAppMotion();
});

document.addEventListener('livewire:navigated', () => {
    navigationInProgress = false;
    dirtyForm = null;
    contentRevision = 0;
    void setupMotion(true);
});

void importSupabaseCallback();
