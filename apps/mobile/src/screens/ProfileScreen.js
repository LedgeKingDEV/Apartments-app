import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../hooks/useAuth';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { logger } from '../utils/logger';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const navigation = useNavigation();
  const route = useRoute();
  const [profileData, setProfileData] = useState(null);
  const [hasListings, setHasListings] = useState(false);

  const loadProfileData = React.useCallback(async () => {
    try {
      // Only load profile if we have a current user
      if (!user || !user.email) {
        setProfileData(null);
        return;
      }

      // Use user-specific storage
      const { getUserProfile } = await import('../utils/userStorage');
      const loadedProfileData = await getUserProfile(user.email);
      
      if (loadedProfileData) {
        // Always use the latest profile data from userStorage
        const newProfileData = {
          name: loadedProfileData.name || user?.name || 'User',
          email: loadedProfileData.email || user?.email || '',
          profilePicture: loadedProfileData.profilePicture || null,
          whatsappNumber: loadedProfileData.whatsappNumber || null,
          address: loadedProfileData.address || null,
        };
        
        // Update profile data (same simple flow as phone number)
        setProfileData(newProfileData);
      } else {
        // If no saved profile, use user data from auth
        const fallbackData = {
          name: user?.name || 'User',
          email: user?.email || '',
          profilePicture: user?.profilePicture || null, // Also check auth context
          whatsappNumber: null,
          address: null,
        };
        setProfileData(fallbackData);
      }
    } catch (error) {
      logger.error('Error loading profile data:', error);
      // On error, use user data from auth
      setProfileData({
        name: user?.name,
        email: user?.email,
        profilePicture: user?.profilePicture || null, // Also check auth context
      });
    }
  }, [user]);

  // Load profile on mount and when user changes (same as phone number)
  useEffect(() => {
    loadProfileData();
  }, [user]);


  // Check if user has listings
  const checkUserListings = React.useCallback(async () => {
    try {
      if (!user || !user.email) {
        setHasListings(false);
        return;
      }

      const { getMyListings } = await import('../utils/listings');
      const userListings = await getMyListings();
      
      // Also check API listings
      let apiListings = [];
      try {
        const { hybridApartmentService } = await import('../services/hybridService');
        const apiResult = await hybridApartmentService.getMyApartments();
        if (apiResult && Array.isArray(apiResult) && apiResult.length > 0) {
          apiListings = apiResult;
        }
      } catch (apiError) {
        // API not available, use local only
      }

      const totalListings = userListings.length + apiListings.length;
      setHasListings(totalListings > 0);
    } catch (error) {
      logger.error('Error checking user listings:', error);
      setHasListings(false);
    }
  }, [user]);

  // Reload profile when screen comes into focus (same simple flow as phone number)
  useFocusEffect(
    React.useCallback(() => {
      // Reload when screen comes into focus - this ensures profile picture appears after saving
      // This is the same mechanism that makes phone number appear immediately
      loadProfileData();
      checkUserListings();
    }, [user, loadProfileData, checkUserListings])
  );

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              if (Platform.OS === 'web') {
                try { await AsyncStorage.removeItem('user'); } catch (e) { /* ignore storage errors */ }
                setTimeout(() => window.location.reload(), 100);
              }
            } catch (error) {
              if (Platform.OS === 'web') window.location.reload();
              else Alert.alert('Sign Out', 'There was an error signing out, but you have been logged out locally.', [{ text: 'OK' }]);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = async () => {
    if (!user || !user.email) {
      Alert.alert('Error', 'No user account found.');
      return;
    }

    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone and will permanently delete:\n\n• Your profile information\n• Your listings\n• Your bookings\n• Your favorites\n• Your wallet balance\n\nThis action is irreversible.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            try {
              // Confirm deletion with a second prompt
              Alert.alert(
                'Final Confirmation',
                'Type DELETE to confirm account deletion. This cannot be undone.',
                [
                  {
                    text: 'Cancel',
                    style: 'cancel',
                  },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        const userEmail = user.email;
                        
                        // Delete all user data
                        // 1. Delete user profile
                        try {
                          const { deleteUserProfile } = await import('../utils/userStorage');
                          await deleteUserProfile(userEmail);
                        } catch (e) {
                          logger.error('Error deleting profile:', e);
                        }

                        // 2. Delete user listings
                        try {
                          const { getMyListings, deleteListing } = await import('../utils/listings');
                          const listings = await getMyListings();
                          for (const listing of listings) {
                            try {
                              await deleteListing(listing.id, userEmail);
                            } catch (e) {
                              logger.error('Error deleting listing:', e);
                            }
                          }
                        } catch (e) {
                          logger.error('Error deleting listings:', e);
                        }

                        // 3. Delete user bookings
                        try {
                          const { getBookings, deleteBooking } = await import('../utils/bookings');
                          const bookings = await getBookings(userEmail);
                          for (const booking of bookings) {
                            try {
                              await deleteBooking(userEmail, booking.id);
                            } catch (e) {
                              logger.error('Error deleting booking:', e);
                            }
                          }
                        } catch (e) {
                          logger.error('Error deleting bookings:', e);
                        }

                        // 4. Delete favorites
                        try {
                          const { hybridFavoriteService } = await import('../services/hybridService');
                          // CRITICAL: Pass user email to ensure account-specific favorites
                          const favorites = await hybridFavoriteService.getFavorites(userEmail);
                          for (const favId of favorites) {
                            try {
                              await hybridFavoriteService.removeFavorite(favId, userEmail);
                            } catch (e) {
                              logger.error('Error deleting favorite:', e);
                            }
                          }
                        } catch (e) {
                          logger.error('Error deleting favorites:', e);
                        }

                        // 5. Delete wallet data
                        try {
                          const { getUserStorageKey } = await import('../utils/userStorage');
                          const walletKey = getUserStorageKey('walletBalance', userEmail);
                          const transactionsKey = getUserStorageKey('walletTransactions', userEmail);
                          await AsyncStorage.removeItem(walletKey);
                          await AsyncStorage.removeItem(transactionsKey);
                        } catch (e) {
                          logger.error('Error deleting wallet:', e);
                        }

                        // 6. Delete user from AsyncStorage
                        await AsyncStorage.removeItem('user');

                        // 7. Sign out
                        await signOut();

                        Alert.alert(
                          'Account Deleted',
                          'Your account has been successfully deleted.',
                          [{ text: 'OK' }]
                        );
                      } catch (error) {
                        logger.error('Error deleting account:', error);
                        Alert.alert(
                          'Error',
                          'There was an error deleting your account. Please try again or contact support.',
                          [{ text: 'OK' }]
                        );
                      }
                    },
                  },
                ]
              );
            } catch (error) {
              logger.error('Error in delete account flow:', error);
            }
          },
        },
      ]
    );
  };

  // Show login prompt if user is not logged in
  React.useEffect(() => {
    if (!user) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to access your profile.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Sign In', 
            onPress: () => navigation.navigate('SignIn')
          }
        ]
      );
      // Navigate back to Explore
      navigation.navigate('Explore');
    }
  }, [user, navigation]);

  // Don't render if user is not logged in
  if (!user) {
    return null;
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          {profileData?.profilePicture ? (
            <Image 
              source={{ uri: profileData.profilePicture }} 
              style={styles.avatarImage}
              onError={() => {
                // Clear invalid image URL
                setProfileData(prev => ({ ...prev, profilePicture: null }));
              }}
            />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(profileData?.name || user?.name || 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.name}>{profileData?.name || user?.name || 'User'}</Text>
          <Text style={styles.email}>{profileData?.email || user?.email || ''}</Text>
          {user?.role && (
            <View style={[styles.roleBadge, user.role === 'ADMIN' && styles.roleBadgeAdmin, user.role === 'HOST' && styles.roleBadgeHost]}>
              <Text style={[styles.roleBadgeText, user.role === 'ADMIN' && styles.roleBadgeTextAdmin, user.role === 'HOST' && styles.roleBadgeTextHost]}>
                {user.role}
              </Text>
            </View>
          )}
          {profileData?.whatsappNumber && (
            <View style={styles.infoRow}>
              <MaterialIcons name="phone" size={16} color="#666" />
              <Text style={styles.infoText}>+234 {profileData.whatsappNumber}</Text>
            </View>
          )}
          {profileData?.address && (
            <View style={styles.infoRow}>
              <MaterialIcons name="location-on" size={16} color="#666" />
              <Text style={styles.infoText} numberOfLines={2}>{profileData.address}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => navigation.navigate('EditProfile')}
          >
            <MaterialIcons name="person" size={24} color="#333" />
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Edit Profile</Text>
              <Text style={styles.menuSubtitle}>Update your personal information</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => navigation.navigate('Notifications')}
          >
            <MaterialIcons name="notifications" size={24} color="#333" />
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Notifications</Text>
              <Text style={styles.menuSubtitle}>View your notifications</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => navigation.navigate('BookingHistory')}
          >
            <MaterialIcons name="history" size={24} color="#333" />
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Booking History</Text>
              <Text style={styles.menuSubtitle}>View your apartment bookings</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => navigation.navigate('MyBookings')}
          >
            <MaterialIcons name="book-online" size={24} color="#333" />
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>My Bookings</Text>
              <Text style={styles.menuSubtitle}>Manage your current bookings</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => navigation.navigate('Kyc')}
          >
            <MaterialIcons name="verified-user" size={24} color="#FFD700" />
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Account Verification</Text>
              <Text style={styles.menuSubtitle}>Verify your identity (KYC) to enable withdrawals</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          {(user?.role === 'HOST' || user?.role === 'ADMIN') && (
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('MyListings')}
            >
              <MaterialIcons name="add-business" size={24} color="#333" />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Upload Listing</Text>
                <Text style={styles.menuSubtitle}>List your apartment for rent</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          )}

          {(user?.role === 'HOST' || user?.role === 'ADMIN') && (
            <TouchableOpacity 
              style={styles.menuItem}
              onPress={() => navigation.navigate('HostBookedListings')}
            >
              <MaterialIcons name="event-available" size={24} color="#FFD700" />
              <View style={styles.menuContent}>
                <Text style={styles.menuTitle}>Booked Listings</Text>
                <Text style={styles.menuSubtitle}>View bookings for your apartments</Text>
              </View>
              <Text style={styles.menuArrow}>›</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => navigation.navigate('HelpSupport')}
          >
            <MaterialIcons name="help-outline" size={24} color="#333" />
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Help & Support</Text>
              <Text style={styles.menuSubtitle}>Get help and contact support</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => navigation.navigate('About')}
          >
            <MaterialIcons name="info-outline" size={24} color="#333" />
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>About</Text>
              <Text style={styles.menuSubtitle}>App version 1.0.0</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.menuItem}
            onPress={() => navigation.navigate('TermsAndConditions')}
          >
            <MaterialIcons name="gavel" size={24} color="#333" />
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>Terms & Conditions</Text>
              <Text style={styles.menuSubtitle}>Legal terms and user agreement</Text>
            </View>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteAccountButton} onPress={handleDeleteAccount}>
          <Text style={styles.deleteAccountButtonText}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    padding: 30,
    paddingTop: 80,
    backgroundColor: '#FFFFFF',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  roleBadgeHost: {
    backgroundColor: '#FFF3E0',
  },
  roleBadgeAdmin: {
    backgroundColor: '#E3F2FD',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
  },
  roleBadgeTextHost: {
    color: '#E65100',
  },
  roleBadgeTextAdmin: {
    color: '#1565C0',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  menuIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  menuArrow: {
    fontSize: 24,
    color: '#999',
  },
  signOutButton: {
    backgroundColor: '#F44336',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  signOutButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  deleteAccountButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F44336',
    margin: 20,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  deleteAccountButtonText: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: '600',
  },
});

