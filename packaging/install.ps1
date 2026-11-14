# CalmMD installer for Windows (technical users):
#
#   irm https://calmmd.app/install.ps1 | iex
#
# Downloads the latest release's per-user installer from GitHub, checks it against the release's
# SHA256SUMS, and runs it silently. Files fetched this way aren't marked "downloaded from the
# internet", so SmartScreen doesn't interrupt. Nothing here needs admin rights.
#

$ErrorActionPreference = 'Stop'
$Repo = 'amilcarmalave/CalmMD'

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
Write-Host "Finding the latest CalmMD release..."
$release = Invoke-RestMethod -UseBasicParsing -Headers @{ 'User-Agent' = 'calmmd-installer' } "https://api.github.com/repos/$Repo/releases/latest"
$asset = $release.assets | Where-Object { $_.name -like "*_$arch-setup.exe" } | Select-Object -First 1
$sums = $release.assets | Where-Object { $_.name -eq 'SHA256SUMS' } | Select-Object -First 1
if (-not $asset) { throw "No Windows $arch installer in release $($release.tag_name)." }
if (-not $sums) { throw "Release $($release.tag_name) has no SHA256SUMS, so the download can't be verified." }

$dir = Join-Path $env:TEMP ("calmmd-install-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $dir | Out-Null
try {
  $exe = Join-Path $dir $asset.name
  Write-Host "Downloading $($asset.name)..."
  Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $exe
  $expected = ((Invoke-WebRequest -UseBasicParsing -Uri $sums.browser_download_url).Content -split "`n" |
    Where-Object { $_ -match [regex]::Escape($asset.name) } | Select-Object -First 1) -replace '\s.*$', ''
  $actual = (Get-FileHash -Algorithm SHA256 $exe).Hash.ToLower()
  if (-not $expected -or $actual -ne $expected.ToLower()) { throw "Checksum mismatch for $($asset.name). Nothing was installed." }

  Write-Host "Installing CalmMD $($release.tag_name)..."
  $p = Start-Process -FilePath $exe -ArgumentList '/S' -PassThru -Wait
  if ($p.ExitCode -ne 0) { throw "The installer exited with code $($p.ExitCode)." }
  Write-Host "Done. Open CalmMD from the Start menu."
} finally {
  Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
}
