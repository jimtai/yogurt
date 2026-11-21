# Build and run Yogurt locally

## You need

- Node.js 24 and pnpm 10.7.0
- CMake
- **Mac:** Xcode Command Line Tools
- **Windows:** Rust, the Vulkan SDK, Visual Studio C++ Build Tools
- **Linux:** Rust, the Vulkan SDK, `libpulse-dev`, `pkg-config`

## Run it

```sh
git clone https://github.com/FrigadeHQ/yogurt.git
cd yogurt
pnpm install --frozen-lockfile
pnpm -C app native   # builds the audio, system and transcription helpers (first time, and after they change)
pnpm dev             # opens Yogurt from source
```

The first run downloads the AI models, like the installed app.

- **Separate profile:** `YOGURT_USER_DATA=/tmp/yogurt-dev pnpm dev` keeps your real meetings out of it.
- **Without models:** `YOGURT_FAKE=1 pnpm dev` swaps in a fake transcriber, notes model and call audio, so the whole app runs in seconds.

## Iterating on this fork

From the repository root, use a persistent development profile:

```sh
pnpm dev:isolated
# Fast UI work, with fake audio and models:
YOGURT_FAKE=1 pnpm dev:isolated
```

On Mac this profile lives in `~/Library/Application Support/Yogurt-dev`. The installed app continues to use
`~/Library/Application Support/Yogurt`. `YOGURT_USER_DATA` overrides the development profile when supplied.
Run `pnpm -C app native` again after editing native helper source.

For an installable Mac build, use:

```sh
pnpm build:mac:local
```

The first run creates a dedicated build keychain and a reusable **Yogurt Local** code-signing certificate. Approve the
macOS authorization prompt to trust it for **Code Signing** only. The command then uses the existing local signing path
in `app/scripts/release-mac.sh`, selecting exactly that keychain and failing rather than falling back to an ad-hoc signature.
Subsequent builds reuse and unlock the same keychain without needing your login keychain password.

The signing keychain and its generated password are stored outside Git, under
`~/Library/Application Support/Yogurt Build/signing`, in a folder accessible only to your user. Keep that folder private
and preserve it between builds. Recreating it changes the signing identity and can require renewed Mac permissions.
Its private key is restricted to code-signing tools; no access rules on the login keychain are changed by this command.
The dedicated keychain is added to your user's keychain search list so `codesign` can locate its private key.

The local build has no `app-update.yml` release feed and never checks for official updates. Its app and helpers are
signed with the same certificate, with helper-specific entitlements, and the build verifies their signatures.
It produces `app/dist/Yogurt-mac-arm64.dmg` and `app/dist/mac-arm64/Yogurt.app` without publishing or notarizing them.
Quit Yogurt before replacing the installed app. Switching from an earlier ad-hoc build to this certificate can require
one more permission approval; subsequent builds keep the certificate identity. The development Electron app has a
different identity from the packaged app and may need its own permissions.

In the currently installed older build, turn off **Settings → Updates → Update Yogurt automatically** until you install
the local signed build. Ordinary `pnpm dev` still uses the installed app's profile; use `dev:isolated` for experiments.

Keep meeting data, local settings, logs, signing keys, and generated passwords outside the checkout. The commands above
do this by default, and `.gitignore` also excludes local credential files and build output. Review GitHub Desktop's
Changes list before committing; a public repository includes commit author metadata as well as source files. Use your
GitHub-provided `noreply` email for commits if you want to keep your regular email private.

## Test

```sh
pnpm -C app typecheck
pnpm -C app test   # unit tests
pnpm -C app e2e    # builds, then drives the app with Playwright in fake mode
```

## Build an installer

```sh
pnpm -C app build
pnpm -C app exec electron-builder --mac   # or --win, --linux, on that platform
```

Installers land in `app/dist/`. They're unsigned unless signing is set up; see `app/scripts/release-mac.sh` for the Mac.

## Release

`sh app/scripts/release.sh X.Y.Z` sets the version, tags it and pushes. GitHub Actions builds Mac (signed and notarized), Windows and Linux, and publishes one release once all three pass. Installed copies update from it.
