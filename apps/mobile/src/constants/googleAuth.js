// Google OAuth configuration
// Create the credentials at: https://console.cloud.google.com/apis/credentials
//
// Required OAuth clients:
// 1. Android (package: com.nigerianapartments.app; register the debug and release SHA-1 fingerprints)
//    -> copy its "Client ID" into androidClientId
// 2. iOS (bundle: com.nigerianapartments.app)
//    -> copy its "Client ID" into iosClientId
// 3. Web application (any name)
//    -> copy its "Client ID" into webClientId
//
// Replace every YOUR_* placeholder below with the real Client IDs.

export const GOOGLE_AUTH = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 'YOUR_IOS_CLIENT_ID',
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || 'YOUR_ANDROID_CLIENT_ID',
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 'YOUR_WEB_CLIENT_ID',
};

export const isGoogleConfigured = () =>
  GOOGLE_AUTH.iosClientId !== 'YOUR_IOS_CLIENT_ID' &&
  GOOGLE_AUTH.androidClientId !== 'YOUR_ANDROID_CLIENT_ID' &&
  GOOGLE_AUTH.webClientId !== 'YOUR_WEB_CLIENT_ID';
