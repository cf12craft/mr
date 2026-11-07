# Memorial – Personal Area

Mobile-friendly memorial / yahrzeit app with Gregorian ↔ Jewish date conversion.

## What’s inside

- List of deceased with anniversary countdown  
- Add / edit person (biography, dates, burial place)  
- Automatic Gregorian → Jewish date conversion  
- Standalone date calculator  
- Works offline (PWA + service worker)  
- Data saved in the browser (`localStorage`)

## Install on your phone (easiest – no APK needed)

### Android (Chrome)

1. Copy the `memorial-app` folder to your phone **or** open the files via a local web server / file manager that serves HTML.
2. Open `index.html` in **Chrome**.
3. Tap the **⋮** menu → **Install app** / **Add to Home screen**.
4. The app appears on your home screen like a normal app and works offline.

> Tip: For the Install prompt to appear, the page must be served over `http://` or `https://` (not always from `file://`).  
> Easy option: upload the ZIP to any free static host (Netlify, GitHub Pages, Cloudflare Pages) then open the URL on your phone and install.

### iPhone (Safari)

1. Open the page in Safari.
2. Tap the Share button → **Add to Home Screen**.

---

## Create a real installable APK (recommended)

Because this environment cannot run the full Android SDK, the fastest way to get a signed `.apk` is a free online HTML→APK builder:

1. Download / use the file: **`memorial-app.zip`** (in the parent folder).
2. Go to one of these free services (examples):
   - https://html2app.dev/
   - https://www.htmltoapk.dev/
   - https://www.apkmaker.dev/
3. Upload the ZIP (make sure `index.html` is at the root of the ZIP contents – if the service expects the files at root, unzip and re-zip the *contents* of the `memorial-app` folder).
4. Set:
   - **App name:** Memorial  
   - **Package name:** e.g. `com.yourname.memorial`  
   - **Icon:** use `icons/icon-512.png`  
   - **Orientation:** Portrait  
   - **Theme color:** `#1e88e5`
5. Build and download the signed APK.
6. On your phone: enable **Install from unknown sources** / **Install unknown apps** for your browser or file manager, then open the APK to install.

### Alternative (from your computer)

If you have Android Studio:

```bash
npm install -g @capacitor/cli
npx cap init Memorial com.yourname.memorial --web-dir .
npx cap add android
npx cap sync
npx cap open android
```

Then build a release APK/AAB inside Android Studio.

---

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main UI |
| `styles.css` | Styling matching the original screenshots |
| `app.js` | App logic + localStorage |
| `hebrew-calendar.js` | Pure JS Gregorian ↔ Jewish converter |
| `manifest.json` | PWA manifest |
| `sw.js` | Offline service worker |
| `icons/` | App icons |

Data never leaves the device.
