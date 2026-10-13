// Token Expiration Handler
import AsyncStorage from '@react-native-async-storage/async-storage';

let isHandlingExpiration = false;

/**
 * Handle token expiration gracefully WITHOUT logging out the user
 * This should be called when a 401 error is received
 * The user stays logged in and can continue using the app with local data
 */
export const handleTokenExpiration = async (errorMessage = 'Your authentication token has expired. Some features may not work until you sign out and sign in again.') => {
  // Prevent multiple simultaneous expiration handlers
  if (isHandlingExpiration) {
    return;
  }
  
  isHandlingExpiration = true;
  
  try {
    // DO NOT clear user data - user stays logged in
    // Just log the warning for debugging
    console.warn('⚠️ Token expired, but user remains logged in:', errorMessage);
    console.warn('⚠️ User can continue using the app. They can sign out manually if needed.');
    
    const { Alert } = await import('react-native');
    Alert.alert(
      'Session Expired',
      'Your authentication token has expired. You can continue using the app, but some features may not work until you sign out and sign in again.\n\nWould you like to sign out now?',
      [
        { text: 'Continue Using App', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              const { authService } = await import('../services/authService');
              await authService.logout();
              const { signOutFirebase } = await import('../services/firebaseGoogleAuth');
              await signOutFirebase();
              const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
              await AsyncStorage.removeItem('user');
              if (typeof window !== 'undefined') window.location.reload();
            } catch (error) {
              console.error('Error signing out:', error);
            }
          },
        },
      ],
      { cancelable: true }
    );
  } catch (error) {
    console.error('Error handling token expiration:', error);
  } finally {
    // Reset flag after a delay
    setTimeout(() => {
      isHandlingExpiration = false;
    }, 2000);
  }
};

/**
 * Check if we're currently handling token expiration
 */
export const isHandlingTokenExpiration = () => isHandlingExpiration;

