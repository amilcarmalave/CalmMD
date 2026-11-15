# Packaging and distribution

Everything needed to ship CalmMD through each channel, from the repository
[amilcarmalave/CalmMD](https://github.com/amilcarmalave/CalmMD).

## Every release

1. Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Tag and push: `git tag v0.2.0 && git push --tags`. The **Release** workflow builds every platform,
   attaches the installers to a draft release, then adds `SHA256SUMS`.
3. Check the draft, write notes, publish.
4. Update the channels below (most are one command).

## Channels

| Channel | Files | How |
|---|---|---|
| GitHub Releases | (CI) | Automatic. Direct downloads; SmartScreen/Gatekeeper warn on first open |
| Microsoft Store | `msix/` | `npm run app:build`, then `pwsh packaging/msix/build-msix.ps1 -Version X.Y.Z`; upload the `.msix` in Partner Center. The Store signs MSIX packages, so no certificate is needed (EXE/MSI submissions would need our own signing) |
| winget | `winget/README.md` | `wingetcreate update CalmMD.CalmMD …` after each release |
| Scoop | `scoop/calmmd.json` | Lives in our own bucket repo (`amilcarmalave/scoop-calmmd`, `bucket/calmmd.json`). `checkver`/`autoupdate` let Scoop's tooling bump it |
| Homebrew | `homebrew/calmmd.rb` | Lives in our own tap (`amilcarmalave/homebrew-calmmd`, `Casks/calmmd.rb`). Bump `version` and `sha256` |
| Install scripts | `install.ps1`, `install.sh` | Host them at the website root (`amilcarmalave.github.io/CalmMD/install.ps1`). They verify `SHA256SUMS` |

### Microsoft Store, first time

1. Partner Center → Apps and games → New product → MSIX or PWA app → reserve the name **CalmMD**.
2. Product identity (Partner Center) → copy *Package/Identity/Name*, *Package/Identity/Publisher* and
   *Package/Properties/PublisherDisplayName* into `msix/AppxManifest.xml`.
3. Build the `.msix`, create a submission, upload it, fill in the listing (screenshots from
   `docs/screenshots`, description from the README), and submit for certification.

To try an MSIX locally before submitting, it must be signed with a test certificate:
`New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=CalmMD Local Test" -CertStoreLocation Cert:\CurrentUser\My`,
export it, trust it (Local Machine → Trusted People), then `signtool sign /fd SHA256 /a /f test.pfx /p … CalmMD_X.Y.Z_x64.msix`.

### Notes
- The NSIS installer is per-user and silent with `/S`, which the install script, Scoop and winget use.
- Homebrew's official cask repository rejects apps that fail Gatekeeper; that's why we use our own tap,
  which clears the quarantine flag after install. Once there's an Apple Developer account, sign and
  notarize in CI (the Release workflow already reads the `APPLE_*` secrets) and drop the postflight.
- SignPath (free signing for OSI-licensed open source) can sign the direct `.exe` once the licence is
  confirmed and the repository is public.
