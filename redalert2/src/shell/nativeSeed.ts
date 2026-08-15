import { StorageKey } from '../LocalPrefs';
import { GameResSource } from '../engine/gameRes/GameResSource';

declare global {
    interface Window {
        __RA2_SHELL__?: { platform: string; version: string; thermalState?: string };
    }
}

interface SeedManifest {
    files: { path: string; size: number }[];
}

const DEBUG_NET_ALLOWED = !!(import.meta as any).env?.DEV
    || !!(import.meta as any).env?.VITE_DEBUG_NET_FORCE;

export function installShellDebugLog(): void {
    if (!isNativeShell() || !DEBUG_NET_ALLOWED)
        return;
    const host = (import.meta as any).env?.VITE_DEBUG_LOG_HOST;
    if (!host)
        return;
    const endpoint = `http://${host}:4100/log`;
    const safeArg = (a: unknown): string => {
        if (a instanceof Error)
            return `${a.name}: ${a.message}\n${a.stack ?? '(no stack)'}`;
        if (a === null || a === undefined)
            return String(a);
        if (typeof a !== 'object')
            return String(a).slice(0, 2000);
        if (ArrayBuffer.isView(a) || a instanceof ArrayBuffer)
            return `[binary ${(a as any).byteLength ?? '?'}b]`;
        try {
            return JSON.stringify(a).slice(0, 2000);
        }
        catch {
            return Object.prototype.toString.call(a);
        }
    };
    const post = (level: string, args: unknown[]) => {
        try {
            const text = args.map(safeArg).join(' ').slice(0, 4000);
            void fetch(endpoint, { method: 'POST', body: `[${level}] ${text}` }).catch(() => { });
        }
        catch { }
    };
    for (const level of ['log', 'warn', 'error'] as const) {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]) => {
            original(...args);
            post(level, args);
        };
    }
    window.addEventListener('error', (e) => post('uncaught', [e.message, e.filename, e.lineno, (e.error?.stack ?? '')]));
    window.addEventListener('unhandledrejection', (e) => post('unhandledrejection', [e.reason]));
}

export function installShellRepl(): void {
    if (!isNativeShell() || !DEBUG_NET_ALLOWED)
        return;
    if (!(import.meta as any).env?.VITE_DEBUG_REPL)
        return;
    const host = (import.meta as any).env?.VITE_DEBUG_LOG_HOST || '127.0.0.1';
    console.log(`[repl] polling http://${host}:4100/cmd`);
    let logged = false;
    const poll = async () => {
        try {
            const response = await fetch(`http://${host}:4100/cmd`, { method: 'POST', body: 'poll' });
            if (!logged) {
                logged = true;
                console.log(`[repl] first poll status ${response.status}`);
            }
            if (response.status === 200) {
                const { id, code } = await response.json();
                let result: string;
                try {
                    // eslint-disable-next-line no-eval
                    result = String(await (0, eval)(code));
                }
                catch (error: any) {
                    result = `EVALERR: ${error?.message ?? error}\n${error?.stack ?? ''}`;
                }
                await fetch(`http://${host}:4100/result?id=${encodeURIComponent(id)}`, {
                    method: 'POST',
                    body: result.slice(0, 500000),
                }).catch(() => { });
            }
        }
        catch (error: any) {
            if (!logged) {
                logged = true;
                console.warn(`[repl] poll failed: ${error?.message ?? error}`);
            }
        }
        setTimeout(poll, 2000);
    };
    poll();
}

export function isNativeShell(): boolean {
    if (window.__RA2_SHELL__)
        return true;
    return new URLSearchParams(window.location.search).has('shell');
}

export function getShellPlatform(): string | undefined {
    return window.__RA2_SHELL__?.platform;
}

export async function seedGameResFromShell(): Promise<void> {
    if (!isNativeShell())
        return;
    let overlay: ReturnType<typeof createSeedOverlay> | undefined;
    let wroteFiles = 0;
    try {
        wroteFiles = await runSeed((text) => {
            overlay ??= createSeedOverlay();
            overlay.setText(text);
        });
    }
    finally {
        overlay?.remove();
    }
    if (wroteFiles > 0 && !sessionStorage.getItem('shellSeedReloaded')) {
        sessionStorage.setItem('shellSeedReloaded', '1');
        console.log(`[nativeSeed] Fresh seed wrote ${wroteFiles} files; reloading once to reset memory high-water`);
        window.location.reload();
        await new Promise(() => { });
    }
}

function createSeedOverlay(): { setText: (text: string) => void; remove: () => void } {
    const el = document.createElement('div');
    el.style.cssText =
        'position:fixed;inset:0;background:#000;color:#c00;display:flex;' +
        'align-items:center;justify-content:center;z-index:99999;' +
        'font:16px monospace;text-align:center;';
    el.textContent = 'Preparing game files...';
    document.body.appendChild(el);
    return {
        setText: (text) => { el.textContent = text; },
        remove: () => el.remove(),
    };
}

async function runSeed(onProgress: (text: string) => void): Promise<number> {
    const manifestResponse = await fetch('/gameres/manifest.json');
    if (!manifestResponse.ok) {
        throw new Error(`Shell seed manifest missing (${manifestResponse.status})`);
    }
    const manifest: SeedManifest = await manifestResponse.json();
    const totalBytes = manifest.files.reduce((sum, f) => sum + f.size, 0);
    let copiedBytes = 0;
    let wroteFiles = 0;
    const root = await navigator.storage.getDirectory();
    for (const file of manifest.files) {
        const segments = file.path.split('/');
        const fileName = segments.pop()!;
        let dir = root;
        for (const segment of segments) {
            dir = await dir.getDirectoryHandle(segment, { create: true });
        }
        const existing = await dir
            .getFileHandle(fileName)
            .then((h) => h.getFile())
            .catch(() => undefined);
        if (existing && existing.size === file.size) {
            copiedBytes += file.size;
            continue;
        }
        const response = await fetch(`/gameres/${file.path}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch bundled resource "${file.path}" (${response.status})`);
        }
        const handle = await dir.getFileHandle(fileName, { create: true });
        const writable = await handle.createWritable();
        await response.body!.pipeTo(writable);
        copiedBytes += file.size;
        wroteFiles++;
        onProgress(
            `Preparing game files... ${(copiedBytes / 1048576).toFixed(0)} / ${(totalBytes / 1048576).toFixed(0)} MB`,
        );
    }
    const config = String(GameResSource.Local);
    localStorage.setItem(StorageKey.GameRes, config);
    console.log(`[nativeSeed] Seeded ${manifest.files.length} files (${totalBytes} bytes, ${wroteFiles} written) from shell bundle`);
    return wroteFiles;
}