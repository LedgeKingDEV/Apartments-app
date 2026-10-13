# Firebase setup for Apartify

Apartify uses Firebase Authentication for Google sign-in and Cloud Firestore for Firebase user profiles. PostgreSQL remains the database for listings, bookings, wallets, payments, and KYC; those records are still managed by the Spring API.

## Project setup completed

The Firebase project is linked in `.firebaserc`. The Apartify Web app is registered, its client configuration is in the ignored local file `apps/mobile/.env`, Google sign-in is enabled, and the default Firestore database has been created in `europe-west1` (Belgium). Firestore rules are deployed from `firestore.rules`.

The app writes a minimal `userProfiles/{firebaseUid}` document after Google sign-in. The deployed rules let a signed-in user read and update only their own profile and deny access to every other collection.

## Google OAuth client IDs

Create OAuth client IDs in Google Cloud Console for the Android package and iOS bundle ID shown in `apps/mobile/app.json`, plus a Web client ID. For Android, register the debug and release SHA-1 fingerprints. Add the resulting IDs to `apps/mobile/.env`:

- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`

Do not commit `apps/mobile/.env`. Restart Metro after changing it.

## Deploy Firestore rules

From the repository root, run:

```powershell
firebase deploy --only firestore:rules --project apartment-africa
```

## API configuration

The Spring API verifies Firebase ID tokens and exchanges them for Apartify's existing API JWT. Configure these variables in the API deployment environment:

- `FIREBASE_PROJECT_ID=apartment-africa`
- `FIREBASE_SERVICE_ACCOUNT_JSON` with the service account JSON as a protected secret, or `GOOGLE_APPLICATION_CREDENTIALS` pointing to a service account file available to the API process.

Create/download a service account key from Firebase Project settings > Service accounts only for the trusted API server. Never add the JSON key to Git or the mobile app. Restart/redeploy the API after setting its credentials.

## Existing data and launch requirements

PostgreSQL is intentionally retained as the authoritative database for Apartify's existing records. Firebase user profiles are auxiliary identity/profile documents; they do not replace or copy financial, booking, listing, or KYC data.

Before launch, configure API credentials and replace the Google OAuth placeholders. Google sign-in will fail until those OAuth IDs and the API's Firebase Admin credentials are configured.
