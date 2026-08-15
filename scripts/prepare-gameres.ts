/**
 * Builds the game-resource tree the app ships from your own retail Red Alert 2
 * files — the offline equivalent of the engine's in-browser importer.
 *
 *   RA2_RETAIL_DIR=/path/to/steam-retail npx tsx scripts/prepare-gameres.ts
 *
 * Produces:
 *   gameres-export/            ra2.mix, language.mix, multi.mix, music/*.mp3,
 *                              ra2ts_l.webm (menu video), glsl.png (splash)
 *   redalert2/public/general.csf   English in-game strings (from language.mix)
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join, resolve } from "node:path";
import { MixFile } from "../redalert2/src/data/MixFile";
import { ShpFile } from "../redalert2/src/data/ShpFile";
import { Palette } from "../redalert2/src/data/Palette";
import { IniFile } from "../redalert2/src/data/IniFile";
import { VirtualFile } from "../redalert2/src/data/vfs/VirtualFile";
import { ImageUtils } from "../redalert2/src/engine/gfx/ImageUtils";
import { mixDatabase } from "../redalert2/src/engine/mixDatabase";

const RETAIL = process.env.RA2_RETAIL_DIR ?? "";
if (!RETAIL) {
    console.error(
        "RA2_RETAIL_DIR is not set.\n\n" +
            "Point it at your own Red Alert 2 install (the folder containing ra2.mix), e.g.:\n" +
            '  RA2_RETAIL_DIR="/path/to/steamapps/common/Command & Conquer Red Alert 2" npx tsx scripts/prepare-gameres.ts\n\n' +
            "Or use the friendly wrapper: ./scripts/setup-android.ps1 <path>",
    );
    process.exit(1);
}

const currentDir = typeof import.meta.dirname === "string"
    ? import.meta.dirname
    : ((import.meta as any).dir ?? resolve("."));
const ROOT = resolve(currentDir, "..");
const OUT = join(ROOT, "gameres-export");
const TMP = join(OUT, ".tmp");

// Locate ffmpeg binary
let ffmpegBin = "ffmpeg";
if (process.env.FFMPEG_PATH && existsSync(process.env.FFMPEG_PATH)) {
    ffmpegBin = process.env.FFMPEG_PATH;
} else {
    try {
        const ffmpegStaticPath = join(ROOT, "redalert2", "node_modules", "ffmpeg-static", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
        if (existsSync(ffmpegStaticPath)) {
            ffmpegBin = ffmpegStaticPath;
        }
    } catch {}
}
console.log(`Using ffmpeg: ${ffmpegBin}`);

function retailFile(name: string): string {
    for (const candidate of [name, name.toUpperCase(), name.toLowerCase()]) {
        const path = join(RETAIL, candidate);
        if (existsSync(path)) return path;
    }
    throw new Error(`"${name}" not found in ${RETAIL} — point RA2_RETAIL_DIR at your RA2 install`);
}

function openMix(path: string): MixFile {
    const bytes = new Uint8Array(readFileSync(path));
    return new MixFile(VirtualFile.fromBytes(bytes, path).stream as any);
}

function extractTo(mix: MixFile, entry: string, outPath: string): void {
    const file = mix.openFile(entry);
    const stream = file.stream as any;
    writeFileSync(outPath, new Uint8Array(stream.buffer, stream.byteOffset, stream.byteLength));
}

// --- Minimal PNG encoder (RGBA8, zlib, filter 0) --------------------------
function crc32(data: Uint8Array): number {
    let crc = ~0;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return ~crc >>> 0;
}
function pngChunk(type: string, payload: Uint8Array): Uint8Array {
    const chunk = new Uint8Array(12 + payload.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, payload.length);
    for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
    chunk.set(payload, 8);
    view.setUint32(8 + payload.length, crc32(chunk.subarray(4, 8 + payload.length)));
    return chunk;
}
function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
    const ihdr = new Uint8Array(13);
    const view = new DataView(ihdr.buffer);
    view.setUint32(0, width);
    view.setUint32(4, height);
    ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
    const raw = new Uint8Array(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
    }
    const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const parts = [signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", new Uint8Array(deflateSync(raw))), pngChunk("IEND", new Uint8Array(0))];
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const png = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { png.set(part, offset); offset += part.length; }
    return png;
}
// --------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, "music"), { recursive: true });
mkdirSync(TMP, { recursive: true });

console.log("== Copying core mixes");
for (const name of ["ra2.mix", "language.mix", "multi.mix"]) {
    copyFileSync(retailFile(name), join(OUT, name));
    console.log(`   ${name}`);
}

console.log("== Extracting English strings -> redalert2/public/general.csf");
const langMix = openMix(retailFile("language.mix"));
extractTo(langMix, "ra2.csf", join(ROOT, "redalert2", "public", "general.csf"));

console.log("== Converting music (theme.mix -> music/*.mp3)");
const themeMix = openMix(retailFile("theme.mix"));
const trackNames = mixDatabase.get("theme.mix") ?? [];
for (const wavName of trackNames) {
    if (!themeMix.containsFile(wavName)) {
        console.warn(`   (skip) ${wavName} not in theme.mix`);
        continue;
    }
    const wavPath = join(TMP, wavName);
    extractTo(themeMix, wavName, wavPath);
    const mp3Name = wavName.replace(/\.wav$/i, ".mp3");
    execFileSync(ffmpegBin, ["-y", "-loglevel", "error", "-i", wavPath, "-vn", "-ar", "22050", "-q:a", "5", join(OUT, "music", mp3Name)]);
    console.log(`   ${mp3Name}`);
}

console.log("== Converting menu video (ra2ts_l.bik -> ra2ts_l.webm)");
if (langMix.containsFile("ra2ts_l.bik")) {
    const bikPath = join(TMP, "ra2ts_l.bik");
    extractTo(langMix, "ra2ts_l.bik", bikPath);
    execFileSync(ffmpegBin, ["-y", "-loglevel", "error", "-i", bikPath, "-c:v", "libvpx", "-b:v", "1M", "-an", join(OUT, "ra2ts_l.webm")]);
    console.log("   ra2ts_l.webm");
} else {
    console.warn("   (skip) ra2ts_l.bik not found in language.mix");
}

console.log("== Extracting splash image (ra2.mix -> glsl.png)");
const ra2Mix = openMix(retailFile("ra2.mix"));
const localMix = new MixFile(ra2Mix.openFile("local.mix").stream);
const shp = new ShpFile(localMix.openFile("glsl.shp"));
const pal = new Palette(localMix.openFile("gls.pal"));
const bitmap = ImageUtils.convertShpToBitmap(shp, pal);
const rgba = new Uint8Array(bitmap.width * bitmap.height * 4);
for (let i = 0; i < bitmap.data.length; i++) {
    const paletteIndex = bitmap.data[i];
    const color = pal.colors[paletteIndex];
    rgba[i * 4] = color?.r ?? 0;
    rgba[i * 4 + 1] = color?.g ?? 0;
    rgba[i * 4 + 2] = color?.b ?? 0;
    rgba[i * 4 + 3] = paletteIndex === 0 ? 0 : 255;
}
writeFileSync(join(OUT, "glsl.png"), encodePng(bitmap.width, bitmap.height, rgba));
console.log(`   glsl.png (${bitmap.width}x${bitmap.height})`);

// --- Yuri's Revenge (md) content ------------------------------------------
console.log("== Copying YR mixes");
for (const name of ["ra2md.mix", "langmd.mix", "multimd.mix", "expandmd01.mix"]) {
    try {
        copyFileSync(retailFile(name), join(OUT, name));
        console.log(`   ${name}`);
    } catch {
        console.warn(`   (skip) ${name} not found — YR content unavailable`);
    }
}

console.log("== Copying bonus map packs (*.mmx, *.yro)");
for (const entry of readdirSync(RETAIL)) {
    if (/\.(mmx|yro)$/i.test(entry)) {
        copyFileSync(join(RETAIL, entry), join(OUT, entry.toLowerCase()));
        console.log(`   ${entry.toLowerCase()}`);
    }
}

console.log("== Extracting YR strings -> redalert2/public/generalmd.csf");
try {
    const langmdMix = openMix(retailFile("langmd.mix"));
    extractTo(langmdMix, "ra2md.csf", join(ROOT, "redalert2", "public", "generalmd.csf"));
} catch {
    console.warn("   (skip) langmd.mix/ra2md.csf not found");
}

console.log("== Converting YR music (thememd.mix -> music/*.mp3)");
try {
    const ra2mdMix = openMix(retailFile("ra2md.mix"));
    const localmd = new MixFile(ra2mdMix.openFile("localmd.mix").stream);
    const themeIni = new IniFile(localmd.openFile("thememd.ini"));
    const yrTracks = new Set<string>();
    for (const section of themeIni.getOrderedSections()) {
        const sound = section.getString("Sound");
        if (sound) yrTracks.add(sound.toLowerCase() + ".wav");
    }
    const thememdMix = openMix(retailFile("thememd.mix"));
    for (const wavName of yrTracks) {
        if (!thememdMix.containsFile(wavName)) continue;
        const mp3Name = wavName.replace(/\.wav$/i, ".mp3");
        if (existsSync(join(OUT, "music", mp3Name))) continue;
        const wavPath = join(TMP, wavName);
        extractTo(thememdMix, wavName, wavPath);
        execFileSync(ffmpegBin, ["-y", "-loglevel", "error", "-i", wavPath, "-vn", "-ar", "22050", "-q:a", "5", join(OUT, "music", mp3Name)]);
        console.log(`   ${mp3Name}`);
    }
} catch (e) {
    console.warn("   (skip) YR music conversion failed:", (e as Error).message);
}
// --------------------------------------------------------------------------

console.log("== Copying multiplayer taunts (Taunts/*.wav)");
try {
    const tauntsSrc = retailFile("Taunts");
    mkdirSync(join(OUT, "Taunts"), { recursive: true });
    let tauntCount = 0;
    for (const entry of readdirSync(tauntsSrc)) {
        if (/\.wav$/i.test(entry)) {
            copyFileSync(join(tauntsSrc, entry), join(OUT, "Taunts", entry.toLowerCase()));
            tauntCount++;
        }
    }
    console.log(`   ${tauntCount} taunt files`);
} catch {
    console.warn("   (skip) Taunts folder not found");
}

rmSync(TMP, { recursive: true, force: true });

console.log("== Writing manifest.json");
const manifestFiles: { path: string; size: number }[] = [];
const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir).sort()) {
        if (name === ".DS_Store" || name === "manifest.json") continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
        else manifestFiles.push({ path: `${prefix}${name}`, size: statSync(full).size });
    }
};
walk(OUT, "");
writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ files: manifestFiles }, null, 1));

console.log("== Done. Assets prepared successfully into gameres-export/");
