# Red Alert 2 + Yuri's Revenge — Android & iOS Port

**Red Alert 2 and Yuri's Revenge, running natively on Android phones and tablets (and iOS/iPadOS).**

> *A non-profit fan project. EA has not endorsed and does not support this product.*

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
![Platform: Android](https://img.shields.io/badge/Platform-Android%2024%2B-green)
![Platform: iOS](https://img.shields.io/badge/Platform-iOS%2015%2B-lightgrey)

---

## What This Is

This repository is a port of the [Chrono Divide / huangkaoya/redalert2](https://github.com/huangkaoya/redalert2) TypeScript engine to run as a **native Android APK** (and iOS app), fully offline, with no internet connection required after setup.

The game engine, AI, touch controls, Yuri's Revenge support, and asset import pipeline are all preserved from the upstream web engine. What this repo adds is the **native mobile shell** that wraps that engine for Android and iOS.

### Supported Modes
- ✅ Skirmish vs AI (Normal / Hard difficulty)
- ✅ Yuri's Revenge (YR mode)
- ✅ Classic Red Alert 2 (RA2 mode)
- ✅ Multiplayer (LAN / online via built-in browser)
- ✅ Custom maps

---

## Android — Quick Start

### Requirements
- **Windows, macOS, or Linux** build machine
- **Node.js 18+** and **npm**
- **JDK 17+** (for Gradle)
- **Android SDK** with `adb` on PATH (included in Android Studio)
- A legally-owned copy of **Red Alert 2 + Yuri's Revenge** (Steam or disc)
- Android device running **Android 7.0 (API 24)** or newer

### Step 1 — Clone this repo
```sh
git clone https://github.com/Mustafa-MS/RedAlert2-Android.git
cd RedAlert2-Android
```

### Step 2 — Extract your retail game assets
Point the setup script at your RA2 install. It will extract, convert, and stage all game files automatically.

**Windows (PowerShell):**
```powershell
.\scripts\setup-android.ps1 "C:\Program Files (x86)\Steam\steamapps\common\Command & Conquer Red Alert II"
```

**Linux / macOS (Bash):**
```sh
./scripts/setup-android.sh "/path/to/Command & Conquer Red Alert II"
```

> The script extracts MIX archives, transcodes music to MP3, converts the menu video to WebM, and generates a manifest. It does not modify your retail installation.

### Step 3 — Build and install the APK

**Windows:**
```powershell
# Build debug APK and install to USB-connected device
.\scripts\build-android.ps1 -Install

# Build release APK (unsigned)
.\scripts\build-android.ps1 -Release
```

**Linux / macOS:**
```sh
# Build debug APK and install to USB-connected device
./scripts/build-android.sh --install

# Build release APK
./scripts/build-android.sh --release
```

The APK is output to `android/app/build/outputs/apk/debug/app-debug.apk`.

### Sideloading (manual install without USB)
```sh
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```
Or copy the `.apk` to your phone and open it with a file manager. Enable **"Install from unknown sources"** in your device settings if prompted.

### Build Script Options

| Flag | Description |
|---|---|
| `-Install` / `--install` | ADB-install the APK to the connected device after building |
| `-Release` / `--release` | Build a release APK (`assembleRelease`) |
| `-NoWeb` / `--no-web` | Skip Vite web bundle rebuild (faster incremental builds) |
| `-Variant ra2` / `--ra2` | Strip Yuri's Revenge archives for a smaller classic RA2 build |

---

## iOS — Quick Start

### Requirements
- **macOS** with Xcode 15+
- A valid **Apple Developer account** (free account is sufficient for sideloading)
- iOS/iPadOS 15+ device

### Build
```sh
npm install -g xcodegen
./scripts/build-ios.sh
```
Open `ios/RA2.xcodeproj` in Xcode, set your Team under Signing, and run on device.

---

## Android Architecture

The native Android shell is ~500 lines of Kotlin:

| File | Purpose |
|---|---|
| [`MainActivity.kt`](android/app/src/main/java/com/ammaar/ra2android/MainActivity.kt) | Immersive fullscreen WebView host, WebGL bootstrap, crash recovery |
| [`AssetSchemeHandler.kt`](android/app/src/main/java/com/ammaar/ra2android/AssetSchemeHandler.kt) | Virtual domain `https://ra2.android.local/` — serves bundled assets with zero network dependency |
| [`ThermalMonitor.kt`](android/app/src/main/java/com/ammaar/ra2android/ThermalMonitor.kt) | Bridges Android thermal/power-save state to the TypeScript engine |

### Key Design Decisions

**Virtual secure origin.** Android WebView requires `https://` for OPFS, WebAudio, and SharedArrayBuffer. `AssetSchemeHandler` intercepts every `https://ra2.android.local/*` request and serves assets from the APK's `assets/` directory — no HTTP server process, no network.

**OPFS asset seeding.** `nativeSeed.ts` copies bundled game archives from `assets/GameRes/` into the browser's Origin Private File System on first launch with per-file size verification. Subsequent launches skip unchanged files (instant start).

**Offline-only.** The APK contains the full game engine and your converted game assets. No internet connection is required after the initial build.

**Crash recovery.** Android can terminate the WebView renderer under memory pressure. `MainActivity` detects this via `onRenderProcessGone` and automatically reloads the game with exponential back-off.

---

## What's Included / What Isn't

| Item | Included in repo? |
|---|---|
| TypeScript game engine (Chrono Divide lineage) | ✅ Yes |
| Native Android Kotlin shell (`android/`) | ✅ Yes (added by this port) |
| Native iOS Swift shell (`ios/`) | ✅ Yes (from upstream port) |
| Build & setup scripts (`scripts/`) | ✅ Yes |
| Yuri's Revenge AI, touch controls, YR maps | ✅ Yes (upstream + this port) |
| Retail game assets (`.mix`, `.csf`, music, video) | ❌ No — you supply these from your own copy |
| Pre-built APK / IPA | ❌ No — build from source |

---

## Project Layout

```
RedAlert2-Android/
├── android/                        # Native Android Gradle project (THIS PORT)
│   ├── app/src/main/
│   │   ├── java/com/ammaar/ra2android/
│   │   │   ├── MainActivity.kt     # WebView host, fullscreen, crash recovery
│   │   │   ├── AssetSchemeHandler.kt  # Virtual HTTPS asset routing
│   │   │   └── ThermalMonitor.kt   # Thermal/power bridge to JS engine
│   │   ├── assets/
│   │   │   ├── WebDist/            # Compiled web engine (generated, gitignored)
│   │   │   └── GameRes/            # Converted game archives (generated, gitignored)
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts / settings.gradle.kts
│
├── ios/                            # Native iOS Swift shell (upstream port)
│   └── Sources/
│       ├── GameViewController.swift
│       └── BundleSchemeHandler.swift
│
├── redalert2/                      # TypeScript game engine (Chrono Divide lineage)
│   └── src/
│       └── shell/
│           ├── nativeSeed.ts       # Platform-agnostic OPFS seeder (Android + iOS)
│           └── iosSeed.ts          # iOS compatibility re-export
│
├── scripts/
│   ├── prepare-gameres.ts          # Retail asset extraction & conversion
│   ├── setup-android.ps1 / .sh     # First-run setup wizard
│   └── build-android.ps1 / .sh     # Full build + ADB install pipeline
│
└── docs/
    └── PORTING_PLAYBOOK.md
```

---

## What's upstream and what isn't

| | lines | whose |
|---|---|---|
| `redalert2/**` (engine, 1,300 files) | ~127,000 | Chrono Divide · RA2WEB · [huangkaoya/redalert2](https://github.com/huangkaoya/redalert2) @ `8c07f10` |
| `redalert2/src/game/ai/thirdpartbot/**` | 7,367 upstream + ~4,400 here | [Supalosa's bot](https://github.com/Supalosa/supalosa-chronodivide-bot) — **no licence declared**, see Licence |
| `ios/**` (Swift shell) | 444 lines | ammaarreshi/RedAlert2-Mac-iOS-iPad |
| `android/**` (Kotlin shell) | ~500 lines | this repo |
| `scripts/**` (import, build, probes) | ~2,600 | this repo |
| `docs/`, `README` | ~1,400 | this repo |

---

## Licence

GPL-3.0, inherited from the upstream engine. The full text is in `LICENSE`.

The chain has a weak link and it is better to state it than to be told it.
Upstream `huangkaoya/redalert2` ships GPL-3.0, but its own README says all rights
belong to Chrono Divide's author, who has never open-sourced the engine. A
licensor who says the rights are someone else's cannot make a GPL grant stick,
so treat that grant as unverified rather than settled. This repository exists at
Alexandru Ciucă's sufferance and comes down the day he asks.

Two related gaps, stated rather than buried:

- The skirmish AI derives from **Supalosa's Chrono Divide bot**, which declares
  no licence at all (`"license": "UNLICENSED"` in both package manifests, no
  LICENSE file). His README invites forks, but that is not a grant. Used here
  pending an explicit licence from him.
- Vendored third-party components and their notices are listed in
  [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

**No built binary is distributed here, and none will be.** Build from source
with your own signing identity.

Per EA's [C&C modding guidelines](https://www.ea.com/games/command-and-conquer/command-and-conquer-remastered/news/modding-faq),
this project is free, non-commercial, and carries their required notice:
*EA has not endorsed and does not support this product.*

---

## Lineage & Credits

**The engine lineage**
- **[Chrono Divide](https://chronodivide.com)** by **Alexandru Ciucă** — the from-scratch RA2 engine reimplementation this all descends from.
- **[RA2WEB](https://www.ra2web.com)** — the authorised Chinese-language operation; contributed mobile controls and Chinese translation back upstream.
- **[huangkaoya/redalert2](https://github.com/huangkaoya/redalert2)** — the React + Three.js refactor this repo builds on directly.

**The iOS port (upstream)**
- **[ammaarreshi/RedAlert2-Mac-iOS-iPad](https://github.com/ammaarreshi/RedAlert2-Mac-iOS-iPad)** — the Mac/iOS/iPadOS Swift shell this Android port is forked from.

**The Android port (this repo)**
- Native Kotlin/AndroidX shell: `MainActivity`, `AssetSchemeHandler`, `ThermalMonitor`.
- Cross-platform `nativeSeed.ts` OPFS seeder (shared between Android and iOS).
- `scripts/build-android.*` and `scripts/setup-android.*` automation.
- Verified running on Xiaomi Poco F3 (Android 13, 2400×1080 120Hz).

**The AI's teachers**
- **[Supalosa's Chrono Divide bot](https://github.com/Supalosa/supalosa-chronodivide-bot)** (**no licence declared** — see Licence)
- **[OpenRA](https://github.com/OpenRA/OpenRA)** (GPL-3.0) — squad-state designs
- **EA's official open-source releases** — CnC_Red_Alert and CnC_Generals_Zero_Hour AI references
- **The retail `aimd.ini`** — Westwood's 132 attack teams and 165 triggers

**The reference keepers**
- **[ModEnc](https://modenc.renegadeprojects.com)**, **[CNCMaps / ccmaps-net](https://github.com/zzattack/ccmaps-net)** by zzattack, **[Project Perfect Mod](https://www.ppmsite.com)**, **[CnCNet](https://cncnet.org)**

**The tools**
- [Three.js](https://threejs.org), [React](https://react.dev), [Vite](https://vitejs.dev), [Bun](https://bun.sh), [7-Zip WASM](https://www.7-zip.org)
- Claude (Anthropic) and Gemini (Google) — see [AI-USE.md](AI-USE.md)

**The originators**
- **Westwood Studios** — for Red Alert 2 and Yuri's Revenge. © 2000–2001 Electronic Arts Inc. Command & Conquer, Red Alert, and Yuri's Revenge are trademarks of Electronic Arts Inc.

---

## Disclaimer

This is a non-profit fan project, not affiliated with Electronic Arts Inc.
No copyright infringement is intended; all rights are held by their respective owners.

No retail game assets are distributed with this repository. A legally-owned copy of Red Alert 2 + Yuri's Revenge is required. The import script only ever reads from *your* install.

One file is inherited from the upstream base: `redalert2/public/res/ra2cd.mix`, a 117 KB archive of 25 small members that the engine loads unconditionally at boot. If you are a rights holder and would like anything here changed or removed, open an issue and it will be handled immediately.