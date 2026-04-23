## v2.3.3 — Chrome Native i18n Packaging

### Chrome Web Store Localization

- Added Chrome-native `_locales` bundles for `en` and `zh_CN`
- Added `default_locale` to the extension manifest
- Localized manifest `name` and `description` with `__MSG_...__` placeholders so Chrome Web Store can detect multiple supported languages

### Build Output

- Verified the packaged extension now includes:
  - `dist/chrome-mv3/_locales/en/messages.json`
  - `dist/chrome-mv3/_locales/zh_CN/messages.json`
- Verified the built manifest now contains `default_locale: "en"`

### Notes

- This release is about Chrome extension packaging metadata, not the in-app `i18next` runtime language switcher
- Chrome Web Store listing text still needs to be translated separately in the developer dashboard
