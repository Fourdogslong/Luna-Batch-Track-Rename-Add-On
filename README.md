Warning: fs was declared with const; use let for reassignable variables.
# Luna Batch Track Renamer Add On

A LUNA browser Add On for renaming all visible tracks or the tracks selected in LUNA. It previews changes before applying them in one undoable transaction.

Features include multiple comma or newline separated find terms, optional case-sensitive matching, replacement text, punctuation and symbol cleanup, first and last character removal, an **Erase all** option, prefix text, numeric or alphabetic sequencing across the chosen tracks, configurable start and numeric width, a preview, and user-managed presets. Presets are saved in this Add On's browser storage; none are bundled. You can also reset the rename settings after applying a rename.

## Build and use

```sh
npm install
npm run build
npm run serve
npm run install-addon
npm run pack
```

Run `npm run build` before opening the Add On in LUNA. It appears under **Add Ons > Browsers** and can be opened beside the mixer. The **Selected Tracks** scope follows LUNA's current track selection; **All Tracks** follows visible track order.

## Project files

- `src/logic.ts` contains the name transformation, preview, and batch rename logic.
- `src/main.ts` connects to LUNA and renders the panel.
- `index.html` contains the UI and styles.
- `manifest.json` configures the browser target and showcase categories.
- `vendor/luna.global.js` is the SDK script bundle.
