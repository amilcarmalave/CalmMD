# Builds an MSIX for the Microsoft Store from the release build.
#
#   npm run app:build
#   pwsh packaging/msix/build-msix.ps1 -Version 0.1.0
#
# Needs the Windows SDK (makeappx.exe). The package is unsigned on purpose: upload it in Partner
# Center and the Store signs it. To try it locally first, sign it with a self-made test certificate
# (see packaging/README.md).
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Out = "src-tauri/target/release/bundle/msix"
)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$exe = Join-Path $root 'src-tauri\target\release\calmmd.exe'
if (-not (Test-Path $exe)) { throw "Build the app first (npm run app:build): $exe is missing." }

$makeappx = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin' -Recurse -Filter makeappx.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\' } | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $makeappx) { throw 'makeappx.exe not found. Install the Windows SDK (winget install Microsoft.WindowsSDK.10.0.26100).' }

$stage = Join-Path $env:TEMP ("calmmd-msix-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path (Join-Path $stage 'Assets') -Force | Out-Null
Copy-Item $exe $stage
$icons = Join-Path $root 'src-tauri\icons'
Copy-Item (Join-Path $icons 'StoreLogo.png') (Join-Path $stage 'Assets')
Copy-Item (Join-Path $icons 'Square150x150Logo.png') (Join-Path $stage 'Assets')
Copy-Item (Join-Path $icons 'Square44x44Logo.png') (Join-Path $stage 'Assets')

# MSIX versions have four parts.
$manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'AppxManifest.xml')
# Case-sensitive: the XML declaration's lowercase version="1.0" must stay as it is.
$manifest = $manifest -creplace '(\s)Version="[0-9.]+"', ('$1Version="' + $Version + '.0"')
# Local test builds: placeholder identity values are swapped for valid test ones.
if ($manifest -match 'IDENTITY_NAME') {
  Write-Warning 'AppxManifest.xml still has placeholder identity values: building a local test package (not for the Store).'
  $manifest = $manifest.Replace('IDENTITY_NAME', 'CalmMD.LocalTest').Replace('IDENTITY_PUBLISHER_DISPLAY_NAME', 'CalmMD contributors').Replace('IDENTITY_PUBLISHER', 'CN=CalmMD Local Test')
}
[System.IO.File]::WriteAllText((Join-Path $stage 'AppxManifest.xml'), $manifest, (New-Object System.Text.UTF8Encoding $false))

New-Item -ItemType Directory -Path (Join-Path $root $Out) -Force | Out-Null
$msix = Join-Path (Join-Path $root $Out) "CalmMD_$($Version)_x64.msix"
& $makeappx.FullName pack /d $stage /p $msix /o
if ($LASTEXITCODE -ne 0) { throw "makeappx failed ($LASTEXITCODE)." }
Remove-Item -Recurse -Force $stage
Write-Host "Built $msix"
