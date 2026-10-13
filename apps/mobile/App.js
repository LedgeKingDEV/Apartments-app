import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, AppState, Alert, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
// Notifications are optional - may not work in Expo Go
let Notifications = null;
try {
  Notifications = require('expo-notifications');
} catch (e) {
  // Notifications not available - app will work without them
}
import { AuthProvider } from './src/context/AuthContext';
import { useAuth } from './src/hooks/useAuth';
import SignInScreen from './src/screens/SignInScreen';
import SignUpScreen from './src/screens/SignUpScreen';
import ForgotPasswordScreen from './src/screens/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import MainTabNavigator from './src/navigation/MainTabNavigator';
import { initializeSync } from './src/services/listingSyncService';
import { logger } from './src/utils/logger';
import { AlertCardHost, showAlertCard } from './src/components/AlertCard';

const Stack = createStackNavigator();

import * as Linking from 'expo-linking';

const prefix = Linking.createURL('/');

const linking = {
  prefixes: [prefix, 'nigerianapartments://', 'https://nigerianapartments.com'],
  config: {
    screens: {
      Main: {
        screens: {
          Explore: 'explore',
          Favorites: 'favorites',
          Bookings: 'bookings',
          Profile: 'profile',
        },
      },
      SignIn: 'signin',
      SignUp: 'signup',
      ForgotPassword: 'forgot-password',
      ResetPassword: 'reset-password',
      Guest: 'guest',
    },
  },
};


function AppContent() {
  const { user, isLoading } = useAuth();
  const notificationListener = useRef();
  const responseListener = useRef();
  const navigationRef = React.useRef();
  const syncServiceRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  // Initialize listing sync service
  useEffect(() => {
    try {
      syncServiceRef.current = initializeSync();
    } catch (error) {
      logger.error('Error initializing sync service:', error);
    }

    // Handle app state changes (foreground/background)
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to the foreground - sync pending listings
        if (syncServiceRef.current && syncServiceRef.current.sync) {
          syncServiceRef.current.sync().catch(error => {
            logger.error('Error syncing on foreground:', error);
          });
        }
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      // Cleanup: stop periodic sync
      if (syncServiceRef.current && syncServiceRef.current.stop) {
        syncServiceRef.current.stop();
      }
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    // Set up notification handlers - optional (may not work in Expo Go)
    if (!Notifications) {
      // Notifications not available - app continues without them
      return;
    }

    try {
      // Check if notification methods exist
      if (Notifications.addNotificationReceivedListener) {
        try {
          notificationListener.current = Notifications.addNotificationReceivedListener(() => {
            // Notification received - handled silently
          });
        } catch (e) {
          // Not available in Expo Go - continue silently
        }
      }

      if (Notifications.addNotificationResponseReceivedListener) {
        try {
          responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            try {
              const data = response?.notification?.request?.content?.data;
              
              // Handle rating prompt notification
              if (data && data.type === 'rating_prompt' && navigationRef.current && navigationRef.current.isReady()) {
                const { apartmentId, hostEmail, apartmentTitle } = data;
                
                // Navigate to host profile if we have the data
                if (hostEmail) {
                  import('./src/utils/listings').then(({ getListings }) => {
                    getListings().then(listings => {
                      const apartment = listings.find(apt => 
                        String(apt.id) === String(apartmentId) ||
                        apt.hostEmail === hostEmail ||
                        apt.createdBy === hostEmail
                      );
                      
                      if (apartment && navigationRef.current && navigationRef.current.isReady()) {
                        navigationRef.current.navigate('Main', {
                          screen: 'Explore',
                          params: {
                            screen: 'HostProfile',
                            params: { apartment }
                          }
                        });
                      } else if (navigationRef.current && navigationRef.current.isReady()) {
                        navigationRef.current.navigate('Main', {
                          screen: 'Explore'
                        });
                      }
                    }).catch(() => {
                      // Error loading listings - continue silently
                    });
                  }).catch(() => {
                    // Error importing module - continue silently
                  });
                }
              }
            } catch (error) {
              logger.error('Error handling notification response:', error);
            }
          });
        } catch (e) {
          // Not available in Expo Go - continue silently
        }
      }
    } catch (error) {
      // Notifications not available - app continues without them
    }

    return () => {
      try {
        if (notificationListener.current) {
          notificationListener.current.remove();
        }
        if (responseListener.current) {
          responseListener.current.remove();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    };
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }
  
  return (
    <NavigationContainer ref={navigationRef} linking={linking} fallback={<ActivityIndicator color="#FFD700" />}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
        initialRouteName={user ? "Main" : "Guest"}
      >
        {/* Guest can browse apartments without login */}
        <Stack.Screen name="Guest" component={MainTabNavigator} />
        <Stack.Screen name="Main" component={MainTabNavigator} />
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  if (Platform.OS === 'web') {
    Alert.alert = showAlertCard;
  }

  return (
    <AuthProvider>
      <>
        <AppContent />
        <AlertCardHost />
      </>
    </AuthProvider>
  );
}

