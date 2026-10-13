import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'apartment-africa',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
};

const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.appId);

export const firebaseApp = isConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

export const firebaseAuth = firebaseApp
  ? (() => {
      try {
        return initializeAuth(firebaseApp, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
      } catch (error) {
        // Auth can already be initialized after Fast Refresh.
        return getAuth(firebaseApp);
      }
    })()
  : null;

export const firestore = firebaseApp ? getFirestore(firebaseApp) : null;

export const requireFirebase = () => {
  if (!firebaseApp || !firebaseAuth || !firestore) {
    throw new Error('Firebase is not configured. Add the Firebase web app values to apps/mobile/.env.');
  }
};
