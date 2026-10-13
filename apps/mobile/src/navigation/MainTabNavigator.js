import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import ExploreScreen from '../screens/ExploreScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import WalletScreen from '../screens/WalletScreen';
import ProfileScreen from '../screens/ProfileScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import BookingHistoryScreen from '../screens/BookingHistoryScreen';
import MyBookingsScreen from '../screens/MyBookingsScreen';
import MyListingsScreen from '../screens/MyListingsScreen';
import UploadListingScreen from '../screens/UploadListingScreen';
import AboutScreen from '../screens/AboutScreen';
import HelpSupportScreen from '../screens/HelpSupportScreen';
import TermsAndConditionsScreen from '../screens/TermsAndConditionsScreen';
import ApartmentDetailsScreen from '../screens/ApartmentDetailsScreen';
import PaymentConfirmationScreen from '../screens/PaymentConfirmationScreen';
import CardPaymentScreen from '../screens/CardPaymentScreen';
import TransferPaymentScreen from '../screens/TransferPaymentScreen';
import HostProfileScreen from '../screens/HostProfileScreen';
import HostBookedListingsScreen from '../screens/HostBookedListingsScreen';
import HostBookingDetailsScreen from '../screens/HostBookingDetailsScreen';
import UserBookingDetailsScreen from '../screens/UserBookingDetailsScreen';
import KycScreen from '../screens/KycScreen';
import SignInScreen from '../screens/SignInScreen';
import { Text, View, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '@react-navigation/native';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const TabIcon = ({ iconName, focused }) => (
  <View style={[styles.iconContainer, focused && styles.iconContainerFocused]}>
    <MaterialIcons 
      name={iconName} 
      size={24} 
      color={focused ? '#FFD700' : '#666'} 
    />
  </View>
);

function ExploreStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="ExploreMain" 
        component={ExploreScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ApartmentDetails" 
        component={ApartmentDetailsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="PaymentConfirmation" 
        component={PaymentConfirmationScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="CardPayment" 
        component={CardPaymentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="TransferPayment" 
        component={TransferPaymentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Wallet" 
        component={WalletScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Kyc" 
        component={KycScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function FavoritesStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="FavoritesMain" 
        component={FavoritesScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="ApartmentDetails" 
        component={ApartmentDetailsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="PaymentConfirmation" 
        component={PaymentConfirmationScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="CardPayment" 
        component={CardPaymentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="TransferPayment" 
        component={TransferPaymentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Wallet" 
        component={WalletScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Kyc" 
        component={KycScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="HostProfile" 
        component={HostProfileScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="ProfileMain" 
        component={ProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Notifications" 
        component={NotificationsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="EditProfile" 
        component={EditProfileScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="BookingHistory" 
        component={BookingHistoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="MyBookings" 
        component={MyBookingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="UserBookingDetails" 
        component={UserBookingDetailsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="MyListings" 
        component={MyListingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="UploadListing" 
        component={UploadListingScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="About" 
        component={AboutScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="HelpSupport" 
        component={HelpSupportScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="TermsAndConditions" 
        component={TermsAndConditionsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="HostBookedListings" 
        component={HostBookedListingsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="HostBookingDetails" 
        component={HostBookingDetailsScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Kyc" 
        component={KycScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

// Guest screens that require login
function RequireLoginScreen({ navigation, screenName, children }) {
  const { user } = useAuth();
  const hasNavigated = React.useRef(false);
  
  React.useEffect(() => {
    if (!user && !hasNavigated.current) {
      hasNavigated.current = true;
      if (Platform.OS === 'web') {
        Alert.alert('Sign In Required', 'Please sign in to access this feature.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => {
          const parent = navigation.getParent();
          if (parent) {
            parent.navigate('SignIn');
          } else {
            navigation.navigate('SignIn');
          }
          } },
        ]);
      } else {
        Alert.alert(
          'Sign In Required',
          'Please sign in to access this feature.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Sign In', 
              onPress: () => {
                const parent = navigation.getParent();
                if (parent) {
                  parent.navigate('SignIn');
                } else {
                  navigation.navigate('SignIn');
                }
              }
            }
          ]
        );
      }
    }
  }, [user]);
  
  React.useEffect(() => {
    if (user) {
      hasNavigated.current = false;
    }
  }, [user]);
  
  if (!user) {
    return null;
  }
  
  return children;
}

export default function MainTabNavigator() {
  const { user } = useAuth();
  const navigation = useNavigation();
  
  // Helper function to navigate to SignIn that works on both web and mobile
  const navigateToSignIn = () => {
    // Try parent navigator first (for mobile)
    const parent = navigation.getParent();
    if (parent) {
      parent.navigate('SignIn');
    } else {
      // Fallback for web or if parent doesn't exist
      // On web, we might need to use the root navigator
      try {
        navigation.navigate('SignIn');
      } catch (error) {
        // If that fails, try to find the root navigator
        let rootNav = navigation;
        while (rootNav.getParent) {
          const parent = rootNav.getParent();
          if (parent) {
            rootNav = parent;
          } else {
            break;
          }
        }
        rootNav.navigate('SignIn');
      }
    }
  };
  
  // Helper function for alerts that works on web
  const showAlert = (title, message, buttons) => {
    Alert.alert(title, message, buttons);
  };
  
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FFD700',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E0E0E0',
          borderTopWidth: 1,
          height: Platform.OS === 'web' ? 70 : 60,
          paddingBottom: Platform.OS === 'web' ? 12 : 8,
          paddingTop: Platform.OS === 'web' ? 12 : 8,
          position: Platform.OS === 'web' ? 'relative' : 'absolute',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen
        name="Explore"
        component={ExploreStack}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon iconName="home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Favorites"
        component={FavoritesStack}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon iconName="favorite" focused={focused} />,
        }}
        listeners={({ navigation: tabNavigation }) => ({
          tabPress: (e) => {
            if (!user) {
              e.preventDefault();
              showAlert(
                'Sign In Required',
                'Please sign in to view your favorites.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Sign In', 
                    onPress: navigateToSignIn
                  }
                ]
              );
            }
          },
        })}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon iconName="account-balance-wallet" focused={focused} />,
        }}
        listeners={({ navigation: tabNavigation }) => ({
          tabPress: (e) => {
            if (!user) {
              e.preventDefault();
              showAlert(
                'Sign In Required',
                'Please sign in to access your wallet.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Sign In', 
                    onPress: navigateToSignIn
                  }
                ]
              );
            }
          },
        })}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon iconName="person" focused={focused} />,
        }}
        listeners={({ navigation: tabNavigation }) => ({
          tabPress: (e) => {
            if (!user) {
              e.preventDefault();
              showAlert(
                'Sign In Required',
                'Please sign in to access your profile.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Sign In', 
                    onPress: navigateToSignIn
                  }
                ]
              );
            }
          },
        })}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerFocused: {
    borderRadius: 12,
    backgroundColor: '#FFF9E6',
  },
});

