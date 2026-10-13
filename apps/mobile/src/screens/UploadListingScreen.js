import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../hooks/useAuth';
import { addListing, updateListing } from '../utils/listings';
import { hybridApartmentService } from '../services/hybridService';
import { notifyListingUploaded } from '../utils/notifications';
import { getUserProfile } from '../utils/userStorage';
import { logger } from '../utils/logger';
import { getApartmentPlaceholder } from '../utils/imagePlaceholder';

// Import ImagePicker - use require for better Metro compatibility
let ImagePicker;
try {
  ImagePicker = require('expo-image-picker');
} catch (e) {
  logger.warn('expo-image-picker not found', e);
}

export default function UploadListingScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { user } = useAuth();
  const { listing, isEdit } = route.params || {};

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [price, setPrice] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [area, setArea] = useState('');
  const [maxGuests, setMaxGuests] = useState('');
  const [hostName, setHostName] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [amenities, setAmenities] = useState({
    wifi: false,
    tv: false,
    ac: false,
    kitchen: false,
    washer: false,
    balcony: false,
  });
  const [loading, setLoading] = useState(false);
  const [processingImages, setProcessingImages] = useState(false);
  const [profileData, setProfileData] = useState(null);

  // Load profile data for host information (use current user's profile)
  // Optimized: Set initial values immediately, then load profile data asynchronously
  useEffect(() => {
    // Set initial values immediately from user data (no delay)
    const initialName = user?.name || 'Property Owner';
    const initialEmail = user?.email || null;
    setHostName(initialName);
    setProfileData({
      name: initialName,
      email: initialEmail,
    });

    // Load profile data asynchronously (non-blocking)
    if (user?.email) {
      // Use requestIdleCallback or setTimeout to defer non-critical loading
      const loadProfileData = async () => {
        try {
          const profileData = await getUserProfile(user.email);
          if (profileData) {
            setProfileData(profileData);
            setHostName(profileData.name || initialName);
          }
        } catch (error) {
          // Keep initial values on error
        }
      };
      
      // Defer loading to not block initial render
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(loadProfileData, { timeout: 100 });
      } else {
        setTimeout(loadProfileData, 0);
      }
    }
  }, [user]);

  useEffect(() => {
    // Request media library permission on mount to initialize native module
    const requestPermissions = async () => {
      if (Platform.OS !== 'web' && ImagePicker) {
        try {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            logger.log('Media library permission not granted');
          }
        } catch (error) {
          logger.error('Error initializing ImagePicker:', error);
        }
      }
    };
    requestPermissions();
  }, []);

  useEffect(() => {
    if (isEdit && listing) {
      setTitle(listing.title || '');
      setDescription(listing.description || '');
      setLocation(listing.location || '');
      setPrice(listing.price?.toString() || '');
      setBedrooms(listing.bedrooms?.toString() || '');
      setBathrooms(listing.bathrooms?.toString() || '');
      setArea(listing.area?.toString() || '');
      setMaxGuests(listing.maxGuests?.toString() || '');
      // Load images from listing (could be URIs or URLs)
      if (listing.images && listing.images.length > 0) {
        setSelectedImages(listing.images);
      } else if (listing.image) {
        setSelectedImages([listing.image]);
      }
      if (listing.amenities) {
        setAmenities(listing.amenities);
      }
      // Keep existing host name from listing if editing
      if (listing.hostName) {
        setHostName(listing.hostName);
      }
    }
  }, [isEdit, listing]);

  const handleSave = async () => {
    // Validation
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a title for your listing');
      return;
    }
    if (!location.trim()) {
      Alert.alert('Error', 'Please enter the location');
      return;
    }
    if (!price.trim() || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      Alert.alert('Error', 'Please enter a valid daily rate');
      return;
    }

    setLoading(true);
    try {
      // Use existing profileData (already loaded) or fallback to user data
      // This avoids blocking save operation with async import
      let currentProfileData = profileData || {
        name: user?.name,
        email: user?.email,
      };
      
      // Only refresh if we don't have profile data yet (non-blocking)
      if (user?.email && !currentProfileData?.profilePicture) {
        try {
          const freshProfileData = await getUserProfile(user.email);
          if (freshProfileData) {
            currentProfileData = freshProfileData;
            setProfileData(freshProfileData);
          }
        } catch (error) {
          // Continue with existing data
        }
      }
      
      // CRITICAL: Always ensure we use the current user's email and name
      // This prevents using data from other accounts
      if (user?.email) {
        currentProfileData.email = user.email;
      }
      if (user?.name) {
        currentProfileData.name = user.name;
      }
      
      // Use selected images (URIs from device)
      const listingData = {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        price: parseFloat(price),
        bedrooms: bedrooms ? parseInt(bedrooms) : null,
        bathrooms: bathrooms ? parseInt(bathrooms) : null,
        area: area ? parseFloat(area) : null,
        maxGuests: maxGuests ? parseInt(maxGuests) : bedrooms ? parseInt(bedrooms) * 2 : null,
        hostName: hostName.trim() || currentProfileData?.name || user?.name || 'Property Owner',
        hostEmail: currentProfileData?.email || user?.email || null,
        hostProfilePicture: currentProfileData?.profilePicture || null, // CRITICAL: Always include profile picture
        isSuperhost: false, // Can be determined later based on host performance
        image: selectedImages[0] || getApartmentPlaceholder(400, 300),
        images: selectedImages.length > 0 ? selectedImages : [getApartmentPlaceholder(400, 300)],
        amenities: amenities,
        status: 'active',
        createdBy: user.email, // CRITICAL: Track who created this listing
      };
      
      let savedListing = null;
      
      if (isEdit && listing) {
        // Save directly to API - makes listing available to all users immediately
        savedListing = await hybridApartmentService.updateApartment(listing.id, listingData);
        
        const isOffline = savedListing?._offline;
        const successTitle = isOffline ? 'Updated Locally' : 'Success';
        const successMessage = isOffline 
          ? 'Listing updated locally. Changes will be synced when online.'
          : 'Listing updated successfully!';

        Alert.alert(successTitle, successMessage);
      } else {
        // Save directly to API - makes listing available to all users immediately
        savedListing = await hybridApartmentService.createApartment(listingData);
        // Add notification for listing upload
        await notifyListingUploaded(listingData.title);
        
        // Check if images were stored by backend
        const imagesStored = savedListing?._meta?.imagesStored;
        const backendIssue = savedListing?._meta?.backendIssue;
        const isOffline = savedListing?._offline;
        
        if (backendIssue && !isOffline) {
          // Backend didn't store images - show warning
          const warningMessage = 'Listing created successfully, but images were not stored by the backend.\n\n' +
            'Other users may not see images for this listing. This is a backend configuration issue.\n\n' +
            'Images are saved locally, so you can see them, but other users cannot.';
          Alert.alert('Warning', warningMessage);
        } else {
          // Success
          const successTitle = isOffline ? 'Saved Locally' : 'Success';
          const successMessage = isOffline 
            ? 'Listing saved locally. It will be visible to you immediately and synced when online.'
            : 'Listing created successfully and is now available to all users!';

          Alert.alert(successTitle, successMessage);
        }
      }
      
      // Clear cache to ensure new listing appears at top immediately
      try {
        await AsyncStorage.removeItem('cached_api_apartments');
        logger.log('✅ Cleared API cache - new listing will appear immediately');
      } catch (cacheError) {
        logger.warn('⚠️ Cache clear failed (non-fatal):', cacheError.message);
      }
      
      // Navigate back - screens will refresh via useFocusEffect
      // ExploreScreen will automatically reload and show new listing at top
      // The listing is already saved to local storage, so it will appear immediately
      
      // CRITICAL: In browser, ensure AsyncStorage is flushed and verified before navigation
      if (Platform.OS === 'web') {
        // Wait longer in browser to ensure AsyncStorage write is complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Verify listing is in storage before navigating
        try {
          const { getListings } = await import('../utils/listings');
          const allSavedListings = await getListings();
          const listingIdToFind = String(savedListing?.id || savedListing?._id || '');
          const foundListing = allSavedListings.find(l => {
            const savedId = String(l.id || l._id || '');
            return savedId === listingIdToFind && listingIdToFind !== '';
          });
          if (foundListing) {
            logger.log('✅ Verified listing in storage before navigation:', foundListing.id, foundListing.title || 'Untitled');
          } else {
            logger.warn('⚠️ Listing not found in storage - may need manual refresh. Looking for ID:', listingIdToFind);
            if (allSavedListings.length > 0) {
              logger.warn('  Available listing IDs:', allSavedListings.slice(0, 3).map(l => String(l.id || l._id || '')));
            }
          }
        } catch (verifyError) {
          logger.warn('⚠️ Could not verify listing before navigation:', verifyError.message);
        }
      }
      
      navigation.goBack();
    } catch (error) {
      logger.error('Error saving listing:', error);
      
      // Improved error message handling
      let errorMessage = error.message;
      
      // If error message is empty or generic, try to be more specific
      if (!errorMessage) {
        errorMessage = 'An unexpected error occurred while saving.';
      } else if (errorMessage === 'Network Error' || errorMessage.includes('network') || errorMessage.includes('connection')) {
        errorMessage = 'Network connection failed. Please check your internet connection and try again.';
      }
      
      // Fallback if it's the old default message (shouldn't happen with new logic)
      if (errorMessage === 'Failed to save listing to API. Please check your internet connection and try again.') {
        errorMessage = 'Unable to save listing. Please check your connection.';
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (value) => {
    // Remove non-numeric characters except decimal point
    // No limit on price - hosts can input any amount (₦100,000, ₦1,000,000, etc.)
    // Allow unlimited digits for large prices
    const cleaned = value.replace(/[^\d.]/g, '');
    // Prevent multiple decimal points
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('');
    }
    return cleaned;
  };

  // Handle image selection on web platform
  const handleWebImageSelect = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    
    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;
      
      setProcessingImages(true);
      
      try {
        const processedImages = [];
        
        // Helper to resize image using Canvas
        const resizeImageOnWeb = (file) => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX_WIDTH = 1024;
                const MAX_HEIGHT = 1024;

                if (width > height) {
                  if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                  }
                } else {
                  if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                  }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compress to JPEG with 0.6 quality
                const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                resolve(dataUrl);
              };
              img.onerror = reject;
              img.src = event.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        };
        
        for (const file of files) {
          try {
            // Resize and compress image
            const dataUrl = await resizeImageOnWeb(file);
            if (dataUrl) {
              processedImages.push(dataUrl);
            }
          } catch (err) {
            logger.error('Error processing web image:', err);
          }
        }
        
        if (processedImages.length > 0) {
          setSelectedImages(prev => {
            const existingUris = new Set(prev);
            const uniqueNewUris = processedImages.filter(uri => !existingUris.has(uri));
            return [...prev, ...uniqueNewUris];
          });
          Alert.alert('Success', `${processedImages.length} image(s) added successfully!`);
        } else {
          Alert.alert('Error', 'Failed to process selected images.');
        }
      } catch (error) {
        logger.error('Error in web image selection:', error);
        Alert.alert('Error', 'An error occurred while processing images.');
      } finally {
        setProcessingImages(false);
      }
    };
    
    // Trigger file selection
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  };

  const handleSelectImage = async () => {
    try {
      // Handle web platform with file input
      if (Platform.OS === 'web') {
        handleWebImageSelect();
        return;
      }

      if (!ImagePicker) {
        // In production builds, image picker should be available
        // If not available, show user-friendly error without development-specific messages
        Alert.alert(
          'Image Upload Unavailable',
          'Image upload is currently unavailable. Please try again later or contact support if the issue persists.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Request media library permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'We need access to your photos to add images. Please enable photo library access in your device settings.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Show action sheet to choose source
      Alert.alert(
        'Select Images',
        'Choose an option',
        [
          {
            text: 'Photo Library',
            onPress: () => pickImage('library'),
          },
          {
            text: 'Camera',
            onPress: () => pickImage('camera'),
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } catch (error) {
      logger.error('Error selecting image:', error);
      Alert.alert('Error', `Failed to open image picker: ${error.message}. Please try again.`);
    }
  };

  const handleTakePhoto = async () => {
    try {
      // On web, camera is not available
      if (Platform.OS === 'web') {
        Alert.alert('Camera Not Available', 'Camera is not available in web browser. Please use "Add Images" to select from your computer.');
        return;
      }

      if (!ImagePicker) {
        Alert.alert('Image Picker Not Available', 'Camera requires a development build.');
        return;
      }

      // Request camera permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Please enable camera access in your device settings to take a photo.',
          [{ text: 'OK' }]
        );
        return;
      }
      
      pickImage('camera');
    } catch (error) {
      logger.error('Error taking photo:', error);
      Alert.alert('Error', `Failed to open camera: ${error.message}. Please try again.`);
    }
  };

  const pickImage = async (source) => {
    try {
      if (!ImagePicker) {
        return;
      }

      let result;
      
      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.5,
          base64: true,
        });
      } else {
        // For photo library, allow multiple selection
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          allowsMultipleSelection: true,
          quality: 0.5,
          selectionLimit: 5, // Limit to 5 images to prevent memory issues
          base64: true,
        });
      }

      // Check if user selected images (not canceled)
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setProcessingImages(true);
        const processedImages = [];
        
        for (const asset of result.assets) {
          if (asset.base64) {
            processedImages.push(`data:image/jpeg;base64,${asset.base64}`);
          }
        }

        const newImageUris = processedImages;
        
        // Add new images to existing ones (avoid duplicates)
        setSelectedImages(prev => {
          const existingUris = new Set(prev);
          const uniqueNewUris = newImageUris.filter(uri => !existingUris.has(uri));
          return [...prev, ...uniqueNewUris];
        });
        
        setProcessingImages(false);
        
        const addedCount = newImageUris.length;
        if (addedCount > 0) {
          Alert.alert('Success', `${addedCount} image(s) added successfully!`);
        } else if (result.assets.length > 0) {
          Alert.alert('Error', 'Failed to process selected images. Please try again.');
        }
      }
    } catch (error) {
      setProcessingImages(false);
      logger.error('Error picking image:', error);
      Alert.alert('Error', `Failed to select image: ${error.message}. Please try again.`);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      
      {/* Loading Overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>Saving your listing...</Text>
        </View>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEdit ? 'Edit Listing' : 'Upload Listing'}
        </Text>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={handleSave}
          disabled={loading}
        >
          <Text style={[styles.saveButtonText, loading && styles.saveButtonTextDisabled]}>
            {loading ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Image Preview */}
        {selectedImages.length > 0 && (
          <View style={styles.imageSection}>
            <Image source={{ uri: selectedImages[0] }} style={styles.previewImage} />
          </View>
        )}

        {/* Form Fields */}
        <View style={styles.formSection}>
          {/* Title */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Luxury 3-Bedroom Apartment in Lagos"
              value={title}
              onChangeText={setTitle}
              placeholderTextColor="#999"
            />
          </View>

          {/* Description */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describe your property..."
              value={description}
              onChangeText={setDescription}
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Location */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Location *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Victoria Island, Lagos"
              value={location}
              onChangeText={setLocation}
              placeholderTextColor="#999"
            />
          </View>

          {/* Price */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Daily Rate (₦) *</Text>
            <Text style={styles.inputHint}>Payments are received daily (per month)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 50000, 100000, 500000 (no limit)"
              value={price}
              onChangeText={(text) => setPrice(formatPrice(text))}
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
            <Text style={styles.priceWarningText}>
              We will charge a 10 percent commission on total transaction for apartments. Consider this when you add your daily rate.
            </Text>
          </View>

          {/* Property Details Row */}
          <View style={styles.detailsRow}>
            {/* Bedrooms */}
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={styles.inputLabel}>Bedrooms</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                value={bedrooms}
                onChangeText={(text) => setBedrooms(text.replace(/[^\d]/g, ''))}
                placeholderTextColor="#999"
                keyboardType="numeric"
              />
            </View>

            {/* Bathrooms */}
            <View style={[styles.inputContainer, styles.halfWidth]}>
              <Text style={styles.inputLabel}>Bathrooms</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                value={bathrooms}
                onChangeText={(text) => setBathrooms(text.replace(/[^\d]/g, ''))}
                placeholderTextColor="#999"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Area */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Area (sqft)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 1200"
              value={area}
              onChangeText={(text) => setArea(formatPrice(text))}
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
          </View>

          {/* Max Guests */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Max Guests</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., 4"
              value={maxGuests}
              onChangeText={(text) => setMaxGuests(text.replace(/[^\d]/g, ''))}
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
            <Text style={styles.helperText}>
              Maximum number of guests the property can accommodate
            </Text>
          </View>

          {/* Host Information */}
          <View style={styles.sectionDivider}>
            <Text style={styles.sectionTitle}>Host Information</Text>
          </View>

          {/* Host Info Display (Read-only from Profile) */}
          <View style={styles.hostInfoContainer}>
            <View style={styles.hostInfoRow}>
              <MaterialIcons name="person" size={20} color="#666" />
              <View style={styles.hostInfoText}>
                <Text style={styles.hostInfoLabel}>Host Name</Text>
                <Text style={styles.hostInfoValue}>
                  {hostName || profileData?.name || user?.name || 'Not set'}
                </Text>
              </View>
            </View>
            {profileData?.email && (
              <View style={styles.hostInfoRow}>
                <MaterialIcons name="email" size={20} color="#666" />
                <View style={styles.hostInfoText}>
                  <Text style={styles.hostInfoLabel}>Email</Text>
                  <Text style={styles.hostInfoValue}>{profileData.email}</Text>
                </View>
              </View>
            )}
            <Text style={styles.hostInfoNote}>
              Host information is taken from your profile. Update it in the Profile section.
            </Text>
          </View>

          {/* Images Section */}
          <View style={styles.sectionDivider}>
            <Text style={styles.sectionTitle}>Property Images</Text>
            <Text style={styles.sectionSubtitle}>
              Select images from your device
            </Text>
          </View>

          {/* Selected Images Grid */}
          {selectedImages.length > 0 && (
            <View style={styles.imagesGrid}>
              {selectedImages.map((imageUri, index) => (
                <View key={index} style={styles.imageItem}>
                  <Image source={{ uri: imageUri }} style={styles.gridImage} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => {
                      const newImages = selectedImages.filter((_, i) => i !== index);
                      setSelectedImages(newImages);
                    }}
                  >
                    <MaterialIcons name="close" size={20} color="#FFF" />
                  </TouchableOpacity>
                  {index === 0 && (
                    <View style={styles.mainImageBadge}>
                      <Text style={styles.mainImageText}>Main</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Add Image Buttons */}
          <View style={styles.addImageButtonsContainer}>
            {processingImages ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="small" color="#FFD700" />
                <Text style={styles.processingText}>Processing images...</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addImageButton}
                onPress={handleSelectImage}
                activeOpacity={0.7}
              >
                <MaterialIcons name="add-photo-alternate" size={24} color="#FFD700" />
                <Text style={styles.addImageButtonText}>
                  {selectedImages.length === 0 ? 'Add Images' : 'Add More Images'}
                </Text>
              </TouchableOpacity>
            )}
            {selectedImages.length > 0 && !processingImages && (
              <TouchableOpacity
                style={styles.cameraButton}
                onPress={handleTakePhoto}
                activeOpacity={0.7}
              >
                <MaterialIcons name="camera-alt" size={24} color="#FFD700" />
                <Text style={styles.addImageButtonText}>Take Photo</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Amenities Section */}
          <View style={styles.sectionDivider}>
            <Text style={styles.sectionTitle}>Amenities</Text>
          </View>

          <View style={styles.amenitiesContainer}>
            <TouchableOpacity
              style={styles.amenityItem}
              onPress={() => setAmenities({ ...amenities, wifi: !amenities.wifi })}
            >
              <View style={[styles.checkbox, amenities.wifi && styles.checkboxChecked]}>
                {amenities.wifi && <MaterialIcons name="check" size={16} color="#FFF" />}
              </View>
              <MaterialIcons name="wifi" size={24} color="#333" />
              <Text style={styles.amenityLabel}>Fast Wi-Fi</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.amenityItem}
              onPress={() => setAmenities({ ...amenities, tv: !amenities.tv })}
            >
              <View style={[styles.checkbox, amenities.tv && styles.checkboxChecked]}>
                {amenities.tv && <MaterialIcons name="check" size={16} color="#FFF" />}
              </View>
              <MaterialIcons name="tv" size={24} color="#333" />
              <Text style={styles.amenityLabel}>Cable TV</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.amenityItem}
              onPress={() => setAmenities({ ...amenities, ac: !amenities.ac })}
            >
              <View style={[styles.checkbox, amenities.ac && styles.checkboxChecked]}>
                {amenities.ac && <MaterialIcons name="check" size={16} color="#FFF" />}
              </View>
              <MaterialIcons name="ac-unit" size={24} color="#333" />
              <Text style={styles.amenityLabel}>Air Conditioning</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.amenityItem}
              onPress={() => setAmenities({ ...amenities, kitchen: !amenities.kitchen })}
            >
              <View style={[styles.checkbox, amenities.kitchen && styles.checkboxChecked]}>
                {amenities.kitchen && <MaterialIcons name="check" size={16} color="#FFF" />}
              </View>
              <MaterialIcons name="kitchen" size={24} color="#333" />
              <Text style={styles.amenityLabel}>Full Kitchen</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.amenityItem}
              onPress={() => setAmenities({ ...amenities, washer: !amenities.washer })}
            >
              <View style={[styles.checkbox, amenities.washer && styles.checkboxChecked]}>
                {amenities.washer && <MaterialIcons name="check" size={16} color="#FFF" />}
              </View>
              <MaterialIcons name="local-laundry-service" size={24} color="#333" />
              <Text style={styles.amenityLabel}>Washer & Dryer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.amenityItem}
              onPress={() => setAmenities({ ...amenities, balcony: !amenities.balcony })}
            >
              <View style={[styles.checkbox, amenities.balcony && styles.checkboxChecked]}>
                {amenities.balcony && <MaterialIcons name="check" size={16} color="#FFF" />}
              </View>
              <MaterialIcons name="balcony" size={24} color="#333" />
              <Text style={styles.amenityLabel}>Private Balcony</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
  },
  saveButtonTextDisabled: {
    color: '#999',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  imageSection: {
    padding: 20,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  imagePlaceholderText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  formSection: {
    padding: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  priceWarningText: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 8,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#F5F5F5',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 16,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  helperText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  sectionDivider: {
    marginTop: 8,
    marginBottom: 16,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  hostInfoContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  hostInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  hostInfoText: {
    flex: 1,
  },
  hostInfoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  hostInfoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  hostInfoNote: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  imageItem: {
    width: '47%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  gridImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(244, 67, 54, 0.8)',
    borderRadius: 20,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainImageBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mainImageText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
  },
  addImageButtonsContainer: {
    gap: 12,
    marginBottom: 20,
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
    borderStyle: 'dashed',
  },
  cameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  addImageButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  amenitiesContainer: {
    gap: 12,
  },
  amenityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CCC',
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  amenityLabel: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 12,
  },
  processingText: {
    fontSize: 16,
    color: '#666',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
});
