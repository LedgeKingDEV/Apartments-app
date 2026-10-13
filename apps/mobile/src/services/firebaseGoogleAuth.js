import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth';
import api from './api';
import { API_ENDPOINTS } from '../api/api';
import { firebaseAuth, firestore, requireFirebase } from './firebase';

export const signInWithGoogle = async (googleAccessToken) => {
  requireFirebase();
  if (!googleAccessToken) throw new Error('Google did not return an access token. Please try again.');

  const credential = GoogleAuthProvider.credential(null, googleAccessToken);
  const credentialResult = await signInWithCredential(firebaseAuth, credential);
  const firebaseUser = credentialResult.user;
  const idToken = await firebaseUser.getIdToken();

  const profileRef = doc(firestore, 'userProfiles', firebaseUser.uid);
  await setDoc(profileRef, {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName || '',
    photoURL: firebaseUser.photoURL || '',
    updatedAt: serverTimestamp(),
    ...(credentialResult.additionalUserInfo?.isNewUser ? { createdAt: serverTimestamp() } : {}),
  }, { merge: true });

  const rawResponse = await api.post(API_ENDPOINTS.AUTH.FIREBASE, { idToken });
  const response = rawResponse?.data || rawResponse;
  if (!response?.token || !response?.email) {
    throw new Error('The server did not return an Apartify session. Please try again.');
  }

  return {
    isNewUser: Boolean(response.isNewUser),
    user: {
      id: response.userId,
      name: firebaseUser.displayName || response.email.split('@')[0],
      email: response.email,
      role: response.role || 'HOST',
      profilePicture: firebaseUser.photoURL || null,
      token: response.token,
      firebaseUid: firebaseUser.uid,
    },
  };
};

export const signOutFirebase = async () => {
  if (firebaseAuth?.currentUser) await signOut(firebaseAuth);
};
