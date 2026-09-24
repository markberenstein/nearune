# Nearune — iOS App Store wrapper

This folder wraps the live Nearune web app (same-sky-rooms-production.up.railway.app)
in a native iOS shell using [Capacitor](https://capacitorjs.com), so it can be
submitted to the Apple App Store. The app itself isn't rebuilt here — this is
a thin native container that loads the real app from the server, plus native
app-icon/splash-screen/status-bar polish.

No Mac is required to build or submit. Builds happen in the cloud via
[Codemagic](https://codemagic.io), configured in `codemagic.yaml` at the repo
root.

## One-time setup (do these once, in order)

1. **Apple Developer Program** — enroll at developer.apple.com/programs/enroll
   ($99/year, your own Apple ID, requires identity verification).

2. **App Store Connect API key** — once your Apple Developer account is
   active:
   - Go to appstoreconnect.apple.com → Users and Access → Integrations → App
     Store Connect API
   - Click "+" to generate a new key, role **App Manager**
   - Download the `.p8` key file **immediately** — Apple only lets you
     download it once
   - Note the **Key ID**, **Issuer ID**, and keep the `.p8` file safe

3. **Codemagic account** — sign up free at codemagic.io, connect your GitHub
   account, and add this repository (`markberenstein/same-sky`) as an app.

4. **Wire up the App Store Connect integration in Codemagic**:
   - In Codemagic: Teams → Integrations → App Store Connect → add the Key
     ID, Issuer ID, and upload the `.p8` file from step 2
   - Name the integration exactly `nearune_asc_api_key` (matches
     `codemagic.yaml` — or edit that file if you name it differently)

5. **Create the app record in App Store Connect**:
   - App Store Connect → My Apps → "+" → New App
   - Platform: iOS
   - Name: Nearune
   - Bundle ID: register `com.nearune.app` first under Certificates,
     Identifiers & Profiles → Identifiers, then select it here
   - SKU: anything unique, e.g. `nearune-ios-001`

6. **Trigger a build** — in Codemagic, start a build of the `nearune-ios`
   workflow. It will build, sign, and upload automatically to TestFlight.

## What each file is

- `capacitor.config.json` — points the app at the live production URL, sets
  app name/bundle ID/colors
- `ios/` — the generated native Xcode project (do not hand-edit unless you
  know what you're doing; regenerate with `npx cap sync ios` after config
  changes instead)
- `icon-master.svg` / `icon-master-1024.png` — source for the App Store icon
  (Nearune's heart+plane wordmark on cream background)
- `splash-master.svg` / `splash-master-2732.png` — source for the launch
  screen
- `../codemagic.yaml` (repo root) — the cloud build/sign/publish pipeline

## Updating the icon or splash screen later

Edit `icon-master.svg` or `splash-master.svg`, regenerate the PNG with:

```
python3 -c "import cairosvg; cairosvg.svg2png(url='icon-master.svg', write_to='icon-master-1024.png', output_width=1024, output_height=1024)"
```

then copy it over `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
(and the three `splash-2732x2732*.png` files similarly for the splash image).

## Switching to a custom domain

Right now `capacitor.config.json`'s `server.url` points at the Railway
subdomain. Once nearune.com (or nearune.app) is registered and wired up to
Railway, update that URL and the `allowNavigation` list, then
`npx cap sync ios` and push a new build.

## Known follow-up: push notifications inside the native app

The web app's push notifications use the browser Push API (via a service
worker), which works when installed to the home screen through Safari, but
does **not** reliably work inside this Capacitor-wrapped native shell —
WKWebView's support for background Web Push is limited. For push to work
reliably in the App Store version, the next step is wiring up
`@capacitor/push-notifications` (native APNs) and having the server send to
both Web Push subscriptions and APNs device tokens depending on which
client registered. Not done yet — flagged here for the next round of work.
