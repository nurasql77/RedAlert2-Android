# Build the RA2 / YR web engine and package it into the Android APK.
param(
    [switch]$NoWeb,
    [switch]$Release,
    [switch]$Install,
    [string]$Variant = "yr"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Web = "$Root\redalert2"
$Android = "$Root\android"
$GameRes = "$Root\gameres-export"

# CSF string tables check
foreach ($csf in @("general.csf", "generalmd.csf")) {
    if (-not (Test-Path "$Web\public\$csf")) {
        Write-Error "Error: redalert2/public/$csf is missing.`nRun .\scripts\setup-android.ps1 <path-to-ra2> first."
        exit 1
    }
}

if (-not (Test-Path $GameRes)) {
    Write-Error "Error: $GameRes not found. Run .\scripts\setup-android.ps1 <path-to-ra2> first."
    exit 1
}

# 1. Build Web App
if (-not $NoWeb) {
    Write-Host "==> Building web engine with Vite..." -ForegroundColor Cyan
    Push-Location $Web
    npx vite build
    Pop-Location
}

# 2. Stage WebDist
Write-Host "==> Staging WebDist ($Variant)..." -ForegroundColor Cyan
$TargetWebDist = "$Android\app\src\main\assets\WebDist"
if (Test-Path $TargetWebDist) {
    Remove-Item -Recurse -Force $TargetWebDist
}
New-Item -ItemType Directory -Force -Path $TargetWebDist | Out-Null
Copy-Item -Recurse -Force "$Web\dist\*" $TargetWebDist
if (Test-Path "$TargetWebDist\local-pack") {
    Remove-Item -Recurse -Force "$TargetWebDist\local-pack"
}

# 3. Stage GameRes
Write-Host "==> Staging GameRes ($Variant)..." -ForegroundColor Cyan
$TargetGameRes = "$Android\app\src\main\assets\GameRes"
if (Test-Path $TargetGameRes) {
    Remove-Item -Recurse -Force $TargetGameRes
}
New-Item -ItemType Directory -Force -Path $TargetGameRes | Out-Null
Copy-Item -Recurse -Force "$GameRes\*" $TargetGameRes

if ($Variant -eq "ra2") {
    # Strip YR-only archives for classic RA2 mode
    foreach ($file in @("ra2md.mix", "langmd.mix", "multimd.mix", "expandmd01.mix")) {
        if (Test-Path "$TargetGameRes\$file") { Remove-Item -Force "$TargetGameRes\$file" }
    }
    Get-ChildItem -Path $TargetGameRes -Filter "*.yro" | Remove-Item -Force
}

# 4. Generate/Update GameRes manifest.json
Write-Host "==> Verifying GameRes manifest..." -ForegroundColor Cyan
$manifestFiles = @()
$totalBytes = 0
Get-ChildItem -Path $TargetGameRes -Recurse -File | ForEach-Object {
    if ($_.Name -ne "manifest.json" -and $_.Name -ne ".DS_Store") {
        $relPath = ($_.FullName.Substring($TargetGameRes.Length + 1)).Replace("\", "/")
        $manifestFiles += @{
            path = $relPath
            size = $_.Length
        }
        $totalBytes += $_.Length
    }
}
$manifestJson = @{ files = $manifestFiles } | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText("$TargetGameRes\manifest.json", $manifestJson, (New-Object System.Text.UTF8Encoding($false)))
$totalMB = $totalBytes / 1MB
Write-Host "GameRes Manifest: $($manifestFiles.Count) files, $($totalMB.ToString('0.0')) MB" -ForegroundColor Green

# 5. Build Android APK
$buildTask = if ($Release) { "assembleRelease" } else { "assembleDebug" }
Write-Host "==> Compiling Android APK with Gradle ($buildTask)..." -ForegroundColor Cyan

Push-Location $Android
& .\gradlew.bat $buildTask
Pop-Location

$apkSubpath = if ($Release) { "release\app-release-unsigned.apk" } else { "debug\app-debug.apk" }
$apkPath = "$Android\app\build\outputs\apk\$apkSubpath"

if (Test-Path $apkPath) {
    $apkSizeMB = (Get-Item $apkPath).Length / 1MB
    Write-Host "`n=======================================================" -ForegroundColor Green
    Write-Host "BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "APK Path: $apkPath" -ForegroundColor Green
    Write-Host "APK Size: $($apkSizeMB.ToString('0.0')) MB" -ForegroundColor Green
    Write-Host "=======================================================`n" -ForegroundColor Green

    if ($Install) {
        Write-Host "==> Installing APK on connected device via ADB..." -ForegroundColor Cyan
        adb install -r $apkPath
        Write-Host "==> Launching game..." -ForegroundColor Cyan
        adb shell am start -n com.ammaar.ra2android.debug/com.ammaar.ra2android.MainActivity
    }
} else {
    Write-Error "APK file not found at expected path: $apkPath"
}