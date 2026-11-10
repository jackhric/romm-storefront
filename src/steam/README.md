# src/steam

Everything ChickenTender does to Steam itself lives in this folder. The rest of the app imports only from
`src/steam/index.ts` and never touches a Steam global.

## The rules every hook follows

1. **Ours or nothing.** A hook first asks `core/games.ts` whether the app is ours. "Ours" needs two things: an appid
   in the non-Steam shortcut range (so an app from the Steam store can never match), and a record in the install
   ledger. For anything else the hook must leave Steam exactly as it found it.
2. **One way to wrap a Steam function.** `core/intercept.ts` has the only two wrappers. `intercept` runs our code
   only when our check says yes; otherwise Steam's function gets the arguments it was given and its result goes
   back untouched. `adjustResult` returns Steam's own result unless we return another.
3. **Our errors are our problem.** Anything our code throws counts as "not ours": Steam's behaviour is used and the
   failure is recorded. A hook that fails three times switches itself off until the plugin reloads.
4. **Check before use.** Steam's globals are read in `core/steam.ts` and `downloads/internals.ts` only, and each
   accessor returns `undefined` when Steam's shape is not what we rely on. A hook that gets `undefined` is not
   installed.
5. **Everything can be undone.** Each hook returns an undo; unloading the plugin puts Steam back as it was.
6. **Do not write to what Steam rendered.** Menus and pages are changed by returning a copy.

## The hooks

| Hook (name in diagnostics) | File | What it touches | Applies to |
| --- | --- | --- | --- |
| `downloads <Method>` | `downloads/client.ts` | `SteamClient.Downloads` pause, resume, queue, move, remove, launch-when-complete | tracked games |
| downloads bridge | `downloads/coexist.ts`, `inject.ts` | adds our rows to `downloadsStore`; listens to Steam's download callbacks | our listed downloads |
| `downloads-page-guard` | `downloads/guard.tsx` | error boundary around the `/library/downloads` route | the page |
| `auto-update <appid>` | `downloads/autoupdate.ts` | `eAutoUpdateValue` in a listed download's details | our listed downloads |
| `uninstall` | `library/uninstall.ts` | `SteamClient.Installs.OpenUninstallWizard` | tracked games |
| `manage-menu` | `library/menu.tsx` | result of the context menu's `BuildManageSubmenu` | a menu for one tracked game |
| `installed-files-page` | `library/properties.tsx` | the `/app/:appid/properties` route's page list | installed games |
| `play-button` | `library/status.ts` | `display_status` and `status_percentage` of our overviews | tracked games not installed |
| `storage-rows` | `storage/rows.ts` | result of `SteamClient.InstallFolder.GetInstallFolders` | installed games |
| `installed-details` | `storage/details.ts` | callback given to `SteamClient.Apps.RegisterForAppDetails` | tracked games |

`shortcuts.ts` and `art.ts` call Steam's public shortcut and artwork functions for appids we created; they wrap
nothing. `native.ts` borrows two of Steam's components for our own pages.

"Tracked" is any game with a ledger record and a shortcut; "installed" is a tracked game whose files are all on disk.

## Checking that it is safe

- `pnpm test` runs `tests/steam`. For each hook there is a test that a call about a Steam store app, and about a
  shortcut that is not ours, reaches Steam unchanged, and that undo restores Steam's own function.
- On the device, `__chickenTender.steam()` in the console of `SharedJSContext` lists the hooks that are applied and
  any that failed or switched themselves off.
- Each file states the Steam client build it was verified on. After a Steam update, a hook whose internals moved is
  simply not installed; check the diagnostics, then the file.

## Adding a hook

Put it in the folder for the Steam feature it touches, gate it with `trackedGame` or `installedGame`, wrap through
`core/intercept.ts`, keep the decision logic in a pure exported function, add it to `installSteam` in `index.ts`, to
the table above, and to `tests/steam` with a pass-through test.
