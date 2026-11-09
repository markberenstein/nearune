# Nearune — Android app

Same idea as the iOS app: a thin Capacitor shell (`android/`) that loads
https://nearune.ai. Push notifications go through Firebase Cloud Messaging (FCM);
the server side lives in `src/push.ts`. Builds run in Codemagic (workflow
`nearune-android` in the root `codemagic.yaml`), so no Android Studio is needed.

## One-time setup

1. **Google Play Console** — create a developer account at play.google.com/console
   ($25 one-time). New personal accounts must run a closed test (about 12 testers,
   14 days) before they can publish; check Google's current rule.
2. **Firebase** — console.firebase.google.com → Add project ("Nearune").
   - Add an Android app with package name `com.nearune.app`.
   - Download `google-services.json` and put it at `ios-app/android/app/google-services.json`
     (commit it; it is not a secret).
   - Project settings → Service accounts → Generate new private key. In Railway
     (service `same-sky-rooms`) add a variable `FIREBASE_SERVICE_ACCOUNT` containing
     that JSON file's contents (the raw JSON, or the same text base64-encoded).
3. **Codemagic** — Teams → Code signing identities → Android keystores → generate a
   keystore, reference name `nearune_android_keystore`. Keep a backup of it and its
   passwords. Start the `nearune-android` workflow; it produces a signed `.aab`.
4. **First upload** — in Play Console create the app "Nearune", then upload the
   `.aab` from Codemagic under Testing → Closed testing (or Internal testing first).
   Complete the store listing, content rating, data-safety form and privacy policy
   (https://nearune.ai/privacy if that is the live URL).
5. **Invite links open the app** — Play Console → Setup → App integrity → App signing
   → copy the SHA-256 certificate fingerprint. In Railway add
   `ANDROID_SHA256_FINGERPRINTS` (comma-separate if more than one). Check
   https://nearune.ai/.well-known/assetlinks.json returns JSON.

## Notes
- Android has no app-icon number like iOS, so badge syncing is skipped for Android.
- Every Android push uses the notification channel `nearune` (created by the app on first launch).
- `versionCode` comes from the Codemagic build number, so each upload is higher than the last.
