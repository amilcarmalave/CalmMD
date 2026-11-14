# winget

winget manifests live in Microsoft's `winget-pkgs` repository, one folder per version. Don't
hand-write them: after a release, run Microsoft's `wingetcreate` with the installer URL.

```powershell
winget install wingetcreate
# First time (creates the package):
wingetcreate new https://github.com/OWNER/calmmd/releases/download/v0.1.0/CalmMD_0.1.0_x64-setup.exe
# Every release after that:
wingetcreate update CalmMD.CalmMD --version 0.2.0 --urls https://github.com/OWNER/calmmd/releases/download/v0.2.0/CalmMD_0.2.0_x64-setup.exe --submit
```

Answers for `wingetcreate new`:

| Field | Value |
|---|---|
| PackageIdentifier | `CalmMD.CalmMD` |
| Publisher | CalmMD contributors |
| PackageName | CalmMD |
| License | MIT |
| ShortDescription | Markdown, calmly. A calm Markdown editor. |
| InstallerType | `nullsoft` (the NSIS `-setup.exe`) |
| Scope | `user` (installs per user, no admin) |
| Silent switch | `/S` (wingetcreate detects it for NSIS) |

`wingetcreate` needs a GitHub token to open the pull request; it asks for one the first time.
Microsoft's bots validate the PR (download, hash, silent install), usually within a day or two.
