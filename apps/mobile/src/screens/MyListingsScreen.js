import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  FlatList,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { getListings, deleteListing, getMyListings } from '../utils/listings';
import { hybridApartmentService } from '../services/hybridService';
import { notifyListingDeleted } from '../utils/notifications';
import { useAuth } from '../hooks/useAuth';
import { logger } from '../utils/logger';
import { getApartmentPlaceholder, isPlaceholderImage } from '../utils/imagePlaceholder';

export default function MyListingsScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [listings, setListings] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadListings = async () => {
    try {
      setLoading(true);
      // Get current user's listings from global storage (filtered by user email)
      // Use top-level import for faster loading
      const userListings = await getMyListings();
      logger.log('MyListingsScreen - Loaded my listings:', userListings.length);
      
      // Also try API, but user listings take priority
      let apiListings = [];
      try {
        const apiResult = await hybridApartmentService.getMyApartments();
        if (apiResult && Array.isArray(apiResult) && apiResult.length > 0) {
          apiListings = apiResult;
        }
      } catch (apiError) {
        logger.log('API listings not available, using local only');
      }
      
      // Combine: user listings first, then API listings (avoid duplicates)
      // Normalize IDs to strings for consistent comparison
      const userListingIds = new Set(userListings.map(l => {
        const id = l.id || l._id || String(l.id);
        return String(id);
      }));
      const uniqueApiListings = apiListings.filter(l => {
        const id = l.id || l._id || String(l.id);
        return !userListingIds.has(String(id));
      });
      
      const allListings = [...userListings, ...uniqueApiListings];
      
      // Map to match local structure - PRESERVES FRONTEND
      // Normalize IDs to strings for consistent comparison
      const mappedListings = allListings.map(listing => {
        const normalizedId = listing.id || listing._id || String(listing.id);
        return {
        id: String(normalizedId), // Always use string for consistent comparison
        title: listing.title || listing.name || 'Untitled Listing',
        description: listing.description || '',
        location: listing.location || listing.address || 'Nigeria',
        price: listing.price || listing.rent || 0,
        bedrooms: listing.bedrooms || listing.beds || null,
        bathrooms: listing.bathrooms || listing.baths || null,
        area: listing.area || listing.squareFeet || null,
        maxGuests: listing.maxGuests || listing.guests || null,
        hostName: listing.hostName || listing.host?.name || 'Property Owner',
        isSuperhost: listing.isSuperhost || false,
        image: listing.image || listing.images?.[0] || null,
        images: listing.images || (listing.image ? [listing.image] : []),
        amenities: listing.amenities || {},
        status: listing.status || 'active',
        createdAt: listing.createdAt || listing.date || new Date().toISOString(),
        };
      });
      
      // Sort by date (most recent first)
      const sortedListings = mappedListings.sort((a, b) => 
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );
      
      setListings(sortedListings);
    } catch (error) {
      logger.error('Error loading listings:', error);
      // Try direct load as fallback
      try {
        const directListings = await getMyListings();
        setListings(directListings || []);
      } catch (fallbackError) {
        logger.error('Fallback also failed:', fallbackError);
        setListings([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load listings when screen comes into focus (real-time updates)
  useFocusEffect(
    React.useCallback(() => {
      loadListings();
    }, [])
  );

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadListings();
  }, []);

  const handleDeleteListing = async (listingId, listingTitle) => {
    const confirmed = await new Promise((resolve) => {
      Alert.alert(
        'Delete Listing',
        `Are you sure you want to delete "${listingTitle}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
        ],
        { onDismiss: () => resolve(false) }
      );
    });
    if (!confirmed) {
      return; // User cancelled
    }

    try {
      logger.log('🗑️ Deleting listing:', listingId, listingTitle);
      
      // Verify user is authenticated
      if (!user || !user.email) {
        throw new Error('You must be logged in to delete listings');
      }
      
      // Optimistically remove from UI immediately for better UX
      // Handle both string and number ID comparisons - normalize both to strings
      setListings(prevListings => prevListings.filter(listing => {
        const listingIdToCompare = String(listing.id || listing._id || '');
        const deleteIdToCompare = String(listingId);
        // Return true to keep listing (if IDs don't match)
        return listingIdToCompare !== deleteIdToCompare;
      }));
      
      // Use hybrid service to delete (removes from API, local storage, sync queue, and cache)
      await hybridApartmentService.deleteApartment(listingId);
      
      // Add notification for listing deletion
      try {
        await notifyListingDeleted(listingTitle);
      } catch (notifError) {
        logger.warn('Could not send deletion notification:', notifError);
      }
      
      // Reload to ensure consistency (in case of any edge cases)
      await loadListings();
      
      // Show success message
      Alert.alert('Success', 'Listing deleted successfully');
    } catch (error) {
      logger.error('❌ Error deleting listing:', error);
      
      // Reload listings to restore the deleted item if deletion failed
      await loadListings();
      
      // Show error message
      const errorMessage = error.message || 'Failed to delete listing. Please try again.';
      Alert.alert('Error', errorMessage);
    }
  };

  const formatPrice = (price) => {
    return `₦${price.toLocaleString()}`;
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return '#4CAF50';
      case 'pending':
        return '#FF9800';
      case 'inactive':
        return '#999';
      default:
        return '#666';
    }
  };

  const renderListingCard = ({ item }) => (
    <View style={styles.listingCard}>
      {/* Listing Image - Show uploaded image if available, otherwise placeholder */}
      {(() => {
        const rawImage = (item.image && typeof item.image === 'string' && item.image.trim() !== '')
          ? item.image
          : (item.images && Array.isArray(item.images) && item.images[0] && typeof item.images[0] === 'string' && item.images[0].trim() !== ''
              ? item.images[0]
              : null);
        const imageUri = rawImage && !isPlaceholderImage(rawImage) ? rawImage : getApartmentPlaceholder(400, 300);
        return (
          <Image 
            source={{ uri: imageUri }} 
            style={styles.listingImage} 
          />
        );
      })()}

      {/* Listing Info */}
      <View style={styles.listingInfo}>
        <View style={styles.listingHeader}>
          <View style={styles.listingTitleContainer}>
            <Text style={styles.listingTitle} numberOfLines={2}>
              {item.title || 'Untitled Listing'}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: getStatusColor(item.status) + '20' },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  { color: getStatusColor(item.status) },
                ]}
              >
                {item.status?.toUpperCase() || 'ACTIVE'}
              </Text>
            </View>
          </View>
        </View>

        {/* Location */}
        {item.location && (
          <View style={styles.listingDetail}>
            <MaterialIcons name="location-on" size={16} color="#666" />
            <Text style={styles.listingDetailText}>{item.location}</Text>
          </View>
        )}

        {/* Property Details */}
        <View style={styles.propertyDetails}>
          {item.bedrooms && (
            <View style={styles.propertyDetail}>
              <MaterialIcons name="bed" size={16} color="#666" />
              <Text style={styles.propertyDetailText}>{item.bedrooms} bed</Text>
            </View>
          )}
          {item.bathrooms && (
            <View style={styles.propertyDetail}>
              <MaterialIcons name="bathtub" size={16} color="#666" />
              <Text style={styles.propertyDetailText}>{item.bathrooms} bath</Text>
            </View>
          )}
          {item.area && (
            <View style={styles.propertyDetail}>
              <MaterialIcons name="square-foot" size={16} color="#666" />
              <Text style={styles.propertyDetailText}>{item.area} sqft</Text>
            </View>
          )}
          {item.maxGuests && (
            <View style={styles.propertyDetail}>
              <MaterialIcons name="people" size={16} color="#666" />
              <Text style={styles.propertyDetailText}>{item.maxGuests} guests</Text>
            </View>
          )}
        </View>

        {/* Host Info */}
        {(item.hostName || item.rating) && (
          <View style={styles.hostInfo}>
            {item.hostName && (
              <Text style={styles.hostName}>
                Hosted by {item.hostName}
                {item.isSuperhost && (
                  <Text style={styles.superhostBadge}> • Superhost</Text>
                )}
              </Text>
            )}
            {item.rating && (
              <View style={styles.ratingContainer}>
                <MaterialIcons name="star" size={14} color="#FFD700" />
                <Text style={styles.ratingText}>{item.rating}</Text>
              </View>
            )}
          </View>
        )}

        {/* Price and Actions */}
        <View style={styles.listingFooter}>
          <View>
            <Text style={styles.listingPrice}>
              {item.price ? formatPrice(item.price) : 'Price not set'}
            </Text>
            <Text style={styles.listingDate}>
              Listed on {formatDate(item.createdAt)}
            </Text>
          </View>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => navigation.navigate('UploadListing', { listing: item, isEdit: true })}
            >
              <MaterialIcons name="edit" size={20} color="#FFD700" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDeleteListing(String(item.id || item._id || ''), item.title || 'Listing')}
            >
              <MaterialIcons name="delete-outline" size={20} color="#F44336" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Listings</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('UploadListing')}
        >
          <MaterialIcons name="add" size={24} color="#FFD700" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading listings...</Text>
        </View>
      ) : listings.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <MaterialIcons name="add-business" size={64} color="#CCC" />
          <Text style={styles.emptyTitle}>No Listings Yet</Text>
          <Text style={styles.emptySubtitle}>
            Start listing your apartment for rent
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('UploadListing')}
          >
            <MaterialIcons name="add" size={20} color="#333" style={{ marginRight: 8 }} />
            <Text style={styles.createButtonText}>Create Your First Listing</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <FlatList
          data={listings}
          renderItem={renderListingCard}
          keyExtractor={(item) => String(item.id || item._id || '')}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <TouchableOpacity
              style={styles.addListingButton}
              onPress={() => navigation.navigate('UploadListing')}
            >
              <MaterialIcons name="add-circle" size={24} color="#FFD700" />
              <Text style={styles.addListingButtonText}>Add New Listing</Text>
            </TouchableOpacity>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  createButton: {
    backgroundColor: '#FFD700',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  addListingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF9E6',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#FFD700',
    borderStyle: 'dashed',
  },
  addListingButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  listingCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  listingImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#E0E0E0',
  },
  listingImagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listingInfo: {
    padding: 16,
  },
  listingHeader: {
    marginBottom: 12,
  },
  listingTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  listingTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  listingDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  listingDetailText: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  propertyDetails: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  propertyDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  propertyDetailText: {
    fontSize: 14,
    color: '#666',
  },
  listingFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  listingPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  listingDate: {
    fontSize: 12,
    color: '#999',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
  },
  hostInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  hostName: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  superhostBadge: {
    fontSize: 12,
    color: '#FFD700',
    fontWeight: '600',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
});
