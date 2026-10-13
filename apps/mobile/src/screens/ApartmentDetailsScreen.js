import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  FlatList,
  TextInput,
  Modal,
  Linking,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import PlatformWebView from '../components/PlatformWebView';
import { hybridFavoriteService } from '../services/hybridService';
import { useAuth } from '../hooks/useAuth';
import { logger } from '../utils/logger';
import { getApartmentPlaceholder, isPlaceholderImage } from '../utils/imagePlaceholder';
import { PlaceholderImage } from '../components/PlaceholderImage';

const { width } = Dimensions.get('window');

export default function ApartmentDetailsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { apartment } = route.params || {};
  const [isFavorite, setIsFavorite] = useState(apartment?.isFavorite || false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [checkInDate, setCheckInDate] = useState('');
  const [checkOutDate, setCheckOutDate] = useState('');
  const [numberOfDays, setNumberOfDays] = useState(1);
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [showCheckInCalendar, setShowCheckInCalendar] = useState(false);
  const [showCheckOutCalendar, setShowCheckOutCalendar] = useState(false);
  const [showGuestWarningModal, setShowGuestWarningModal] = useState(false);
  const [hostProfilePicture, setHostProfilePicture] = useState(null);
  const [hostName, setHostName] = useState(null);
  const [hostEmail, setHostEmail] = useState(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState(false);
  const mapTimeoutRef = useRef(null);
  const flatListRef = useRef(null);
  const [unavailableDates, setUnavailableDates] = useState({});
  const [dateConflictError, setDateConflictError] = useState(null);

  // Load favorite state from AsyncStorage on mount
  React.useEffect(() => {
    const loadFavoriteState = async () => {
      if (!apartment) return;
      try {
        // CRITICAL: Pass user email to ensure account-specific favorites
        const userEmail = user?.email?.toLowerCase()?.trim();
        if (!userEmail || !userEmail.includes('@')) {
          setIsFavorite(false);
          return;
        }
        
        // Get user-specific favorites (persists across logout/login)
        const favoriteIds = await hybridFavoriteService.getFavorites(userEmail);
        const isFav = favoriteIds.includes(apartment.id) || favoriteIds.includes(String(apartment.id));
        setIsFavorite(isFav);
      } catch (error) {
        logger.error('Error loading favorite state:', error);
        setIsFavorite(false);
      }
    };
    loadFavoriteState();
  }, [apartment, user]);

  // Load unavailable dates when apartment is loaded
  React.useEffect(() => {
    const loadUnavailableDates = async () => {
      if (!apartment || !apartment.id) return;
      
      try {
        const hostEmail = apartment.createdBy || apartment.hostEmail;
        if (!hostEmail) return;

        const { getUnavailableDates } = await import('../utils/bookings');
        const unavailable = await getUnavailableDates(apartment.id, hostEmail);
        setUnavailableDates(unavailable);
      } catch (error) {
        logger.error('Error loading unavailable dates:', error);
        setUnavailableDates({});
      }
    };
    
    loadUnavailableDates();
  }, [apartment]);

  // Load host profile information in real-time from the host's current profile
  const loadHostProfile = React.useCallback(async () => {
    if (!apartment) return;
    
    // Get the host's email from the apartment (the person who created/uploaded this listing)
    // Use createdBy as primary (most reliable), then hostEmail as fallback
    const hostEmailToLoad = apartment.createdBy || apartment.hostEmail || null;
    
    logger.log('ApartmentDetailsScreen - Loading host profile in real-time:', {
      hostEmail: hostEmailToLoad,
      hostName: apartment.hostName,
      hasHostProfilePicture: !!apartment.hostProfilePicture
    });
    
    // Initialize with apartment data as fallback
    let currentHostName = apartment.hostName || 'Property Owner';
    let currentHostEmail = hostEmailToLoad;
    let currentProfilePicture = apartment.hostProfilePicture || null;
    
    // Priority 1: Try to get the latest profile from user-specific storage
    // This ensures we get the most up-to-date host information
    if (hostEmailToLoad) {
      try {
        const { getUserProfile } = await import('../utils/userStorage');
        const hostProfile = await getUserProfile(hostEmailToLoad);
        
        if (hostProfile) {
          // Always use the latest profile data from userStorage (highest priority)
          currentHostName = hostProfile.name || apartment.hostName || 'Property Owner';
          currentHostEmail = hostProfile.email || hostEmailToLoad;
          // If profile exists in userStorage, always use its profilePicture value (even if null)
          // This ensures that if user removes their picture, it shows as removed, not the old listing picture
          if (hostProfile.hasOwnProperty('profilePicture')) {
            currentProfilePicture = hostProfile.profilePicture || null;
          } else {
            // Only fallback to listing if profilePicture property doesn't exist in profile
            currentProfilePicture = apartment.hostProfilePicture || null;
          }
          
          logger.log('ApartmentDetailsScreen - Using latest host profile from userStorage:', {
            name: currentHostName,
            hasPicture: !!currentProfilePicture,
            pictureSource: hostProfile.hasOwnProperty('profilePicture') ? 'userStorage' : (apartment.hostProfilePicture ? 'listing' : 'none')
          });
        } else {
          logger.log('ApartmentDetailsScreen - No profile found in userStorage, using apartment data');
        }
      } catch (error) {
        logger.error('Error loading host profile from userStorage:', error);
        // Keep fallback values
      }
    }
    
    // Update state with latest host information
    setHostName(currentHostName);
    setHostEmail(currentHostEmail);
    setHostProfilePicture(currentProfilePicture);
  }, [apartment]);

  // Load host profile on mount
  React.useEffect(() => {
    loadHostProfile();
  }, [loadHostProfile]);

  // Reload host profile when screen comes into focus (real-time updates)
  useFocusEffect(
    React.useCallback(() => {
      // Small delay to ensure profile changes are saved before reloading
      const timer = setTimeout(() => {
        loadHostProfile();
      }, 100);
      return () => clearTimeout(timer);
    }, [loadHostProfile])
  );

  // Safety check
  if (!apartment) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // Use only images uploaded with the listing
  // If apartment has an images array, use those; otherwise use just the main image
  const apartmentImages = React.useMemo(() => {
    // First, try to get images array
    let images = [];
    
    if (apartment?.images && Array.isArray(apartment.images) && apartment.images.length > 0) {
      // Use the images array from listing - filter out empty/null values
      images = apartment.images.filter(img => img && (typeof img === 'string' ? img.trim() !== '' : true));
    }
    
    // If we have a main image but no images array, or if images array is empty, use main image
    if (images.length === 0 && apartment?.image) {
      images = [apartment.image];
    }
    
    // If we still have no images, use default
    if (images.length === 0) {
      images = [getApartmentPlaceholder()];
    }
    
    return images;
  }, [apartment]);

  // App Store Compliance: Report and Block functionality
  const submitReport = (reason) => {
    // In a real app, this would send an API request
    // For now, we simulate a successful report
    setTimeout(() => {
      Alert.alert(
        'Report Received',
        'Thank you for reporting this listing. We will review it shortly.'
      );
      logger.log(`Listing ${apartment?.id} reported for: ${reason} by user ${user?.email || 'guest'}`);
    }, 500);
  };

  const handleReportListing = () => {
    if (!user) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to report this listing.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => navigation.navigate('SignIn') }
        ]
      );
      return;
    }

    Alert.alert(
      'Report Listing',
      'Why are you reporting this listing?',
      [
        { text: 'Inappropriate Content', onPress: () => submitReport('Inappropriate Content') },
        { text: 'Spam or Scam', onPress: () => submitReport('Spam or Scam') },
        { text: 'False Information', onPress: () => submitReport('False Information') },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const handleBlockHost = () => {
    if (!user) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to block this host.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: () => navigation.navigate('SignIn') }
        ]
      );
      return;
    }

    const nameToBlock = hostName || apartment?.hostName || 'this host';

    Alert.alert(
      `Block ${nameToBlock}?`,
      `Are you sure you want to block ${nameToBlock}? You will no longer see listings or messages from them.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Block Host', 
          style: 'destructive',
          onPress: () => {
            // In a real app, this would save to blocked list
            logger.log(`Host ${hostEmail || apartment?.hostEmail} blocked by user ${user.email}`);
            
            Alert.alert(
              'Host Blocked',
              `You have blocked ${nameToBlock}. Content from this user will no longer be visible to you.`
            );
          }
        }
      ]
    );
  };

  const calculateDays = (startDate, endDate) => {
    if (!startDate || !endDate) return 1;
    try {
      // Handle date formats: YYYY-MM-DD or MM/DD/YYYY
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 1;
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 1;
    } catch (error) {
      return 1;
    }
  };

  const handleCheckInChange = (text) => {
    setCheckInDate(text);
    if (checkOutDate) {
      const days = calculateDays(text, checkOutDate);
      setNumberOfDays(days);
    }
  };

  const handleCheckOutChange = (text) => {
    setCheckOutDate(text);
    if (checkInDate) {
      const days = calculateDays(checkInDate, text);
      setNumberOfDays(days);
    }
  };

  const handleCheckInDayPress = async (day) => {
    // Check if the selected date is unavailable
    if (unavailableDates[day.dateString]?.disabled) {
      Alert.alert('Unavailable', 'Choose another date please');
      setDateConflictError('The selected check-in date is unavailable');
      return;
    }
    
    // Validate that check-in date is before check-out date (if check-out is already selected)
    if (checkOutDate && day.dateString >= checkOutDate) {
      Alert.alert('Invalid dates', 'Check-in date must be before check-out date');
      setDateConflictError('Check-in date must be before check-out date');
      return;
    }
    
    setCheckInDate(day.dateString);
    setShowCheckInCalendar(false);
    setDateConflictError(null);
    
    // If checkout date is already selected, check for conflicts
    if (checkOutDate) {
      const days = calculateDays(day.dateString, checkOutDate);
      setNumberOfDays(days);
      
      // Check for conflicts with new check-in date
      await checkDateConflict(day.dateString, checkOutDate);
    }
  };

  const handleCheckOutDayPress = async (day) => {
    if (checkInDate && day.dateString <= checkInDate) {
      Alert.alert('Invalid dates', 'Check-out date must be after check-in date');
      return;
    }
    
    // Check if the selected date is unavailable
    if (unavailableDates[day.dateString]?.disabled) {
      Alert.alert('Unavailable', 'Choose another date please');
      setDateConflictError('The selected check-out date is unavailable');
      return;
    }
    
    setCheckOutDate(day.dateString);
    setShowCheckOutCalendar(false);
    setDateConflictError(null);
    
    if (checkInDate) {
      const days = calculateDays(checkInDate, day.dateString);
      setNumberOfDays(days);
      
      // Check for conflicts with new check-out date
      await checkDateConflict(checkInDate, day.dateString);
    }
  };

  // Check for date conflicts
  const checkDateConflict = async (checkIn, checkOut) => {
    if (!apartment || !apartment.id || !checkIn || !checkOut) {
      return false;
    }
    
    try {
      const hostEmail = apartment.createdBy || apartment.hostEmail;
      if (!hostEmail) {
        return false;
      }
      
      const { checkDateConflict: checkConflict } = await import('../utils/bookings');
      const conflictResult = await checkConflict(apartment.id, hostEmail, checkIn, checkOut);
      
      if (conflictResult.hasConflict) {
        setDateConflictError('This apartment is unavailable for the selected dates. Please choose another date.');
        return true;
      }
      
      setDateConflictError(null);
      return false;
    } catch (error) {
      logger.error('Error checking date conflict:', error);
      return false;
    }
  };

  const getMarkedDates = () => {
    const marked = { ...unavailableDates }; // Start with unavailable dates
    
    if (checkInDate) {
      // Override unavailable marking if user selected this date (allow selection even if unavailable for now, will check on Reserve)
      marked[checkInDate] = {
        startingDay: true,
        color: '#FFD700',
        textColor: '#000',
        disabled: false, // Allow selection
      };
    }
    
    if (checkOutDate) {
      // Override unavailable marking if user selected this date
      marked[checkOutDate] = {
        endingDay: true,
        color: '#FFD700',
        textColor: '#000',
        disabled: false, // Allow selection
      };
      
      // Mark dates in between
      if (checkInDate) {
        const start = new Date(checkInDate);
        const end = new Date(checkOutDate);
        const current = new Date(start);
        current.setDate(current.getDate() + 1);
        
        while (current < end) {
          const dateString = current.toISOString().split('T')[0];
          // Only mark as selected if not already marked as unavailable
          if (!unavailableDates[dateString]) {
            marked[dateString] = {
              color: '#FFF9E6',
              textColor: '#000',
            };
          }
          current.setDate(current.getDate() + 1);
        }
      }
    }
    
    return marked;
  };

  const calculateTotal = () => {
    try {
      // Payment calculation - supports payments up to ₦10,000,000 (10 million naira)
      // No maximum payment limit - calculates total based on daily rate and days
      // Price is already stored as daily rate
      const dailyRate = apartment?.price || 0; 
      const total = dailyRate * numberOfDays;
      return isNaN(total) ? 0 : total;
    } catch (error) {
      return 0;
    }
  };

  const getMaxGuests = () => {
    // Use maxGuests from listing if available, otherwise calculate from beds
    return apartment?.maxGuests || (apartment?.beds || apartment?.bedrooms || 1) * 2;
  };

  const handleGuestChange = (text) => {
    const guests = parseInt(text) || 0;
    setNumberOfGuests(guests);
    
    const maxGuests = getMaxGuests();
    if (guests > maxGuests) {
      setShowGuestWarningModal(true);
    }
  };

  const handleExploreMore = () => {
    setShowGuestWarningModal(false);
    navigation.navigate('ExploreMain');
  };

  const handleOkay = () => {
    setShowGuestWarningModal(false);
    setNumberOfGuests(1);
  };


  const toggleFavorite = async () => {
    if (!apartment) return;
    
    const newFavoriteState = !isFavorite;
    setIsFavorite(newFavoriteState);

    try {
      // Use hybrid service to save to user-specific favorites (persists across logout/login)
      // CRITICAL: Pass user email to ensure account-specific favorites
      const userEmail = user?.email?.toLowerCase()?.trim();
      if (!userEmail || !userEmail.includes('@')) {
        throw new Error('User must be logged in to update favorites');
      }
      
      if (newFavoriteState) {
        await hybridFavoriteService.addFavorite(apartment.id, userEmail);
      } else {
        await hybridFavoriteService.removeFavorite(apartment.id, userEmail);
      }
    } catch (error) {
      logger.error('Error updating favorites:', error);
      // Revert state on error
      setIsFavorite(!newFavoriteState);
    }
  };

  const formatPrice = (price) => {
    return `₦${price.toLocaleString()}`;
  };

  // Use description from listing, or fallback to default
  const description = apartment?.description || `Experience the best of ${apartment?.location || 'Nigeria'} from this stylish and spacious apartment. With modern amenities and prime location, you'll enjoy comfort and convenience. Perfect for families, solo adventurers, and business travelers.`;

  // Map amenities from listing to display format
  const getAmenitiesList = () => {
    if (!apartment?.amenities) {
      // Fallback to default amenities if none provided
      return [
        { icon: 'wifi', name: 'Fast Wi-Fi' },
        { icon: 'tv', name: 'Cable TV' },
        { icon: 'ac-unit', name: 'Air conditioning' },
        { icon: 'kitchen', name: 'Full Kitchen' },
        { icon: 'local-laundry-service', name: 'Washer & Dryer' },
        { icon: 'balcony', name: 'Private balcony' },
      ];
    }

    const amenitiesMap = {
      wifi: { icon: 'wifi', name: 'Fast Wi-Fi' },
      tv: { icon: 'tv', name: 'Cable TV' },
      ac: { icon: 'ac-unit', name: 'Air conditioning' },
      kitchen: { icon: 'kitchen', name: 'Full Kitchen' },
      washer: { icon: 'local-laundry-service', name: 'Washer & Dryer' },
      balcony: { icon: 'balcony', name: 'Private balcony' },
    };

    const amenitiesList = [];
    Object.keys(apartment.amenities).forEach(key => {
      if (apartment.amenities[key] && amenitiesMap[key]) {
        amenitiesList.push(amenitiesMap[key]);
      }
    });

    return amenitiesList.length > 0 ? amenitiesList : [
      { icon: 'wifi', name: 'Fast Wi-Fi' },
      { icon: 'tv', name: 'Cable TV' },
      { icon: 'ac-unit', name: 'Air conditioning' },
    ];
  };

  const amenities = getAmenitiesList();

  // Get location coordinates for map (default to Lagos, Nigeria if location is not specific)
  const getLocationCoordinates = () => {
    const location = apartment?.location || 'Nigeria';
    // Common Nigerian city coordinates
    const cityCoordinates = {
      'Lagos': { lat: 6.5244, lng: 3.3792 },
      'Abuja': { lat: 9.0765, lng: 7.3986 },
      'Port Harcourt': { lat: 4.8156, lng: 7.0498 },
      'Ibadan': { lat: 7.3776, lng: 3.9470 },
      'Kano': { lat: 12.0022, lng: 8.5919 },
      'Benin City': { lat: 6.3350, lng: 5.6037 },
      'Kaduna': { lat: 10.5105, lng: 7.4165 },
      'Ilorin': { lat: 8.4969, lng: 4.5421 },
    };
    
    // Check if location matches any known city
    for (const [city, coords] of Object.entries(cityCoordinates)) {
      if (location.toLowerCase().includes(city.toLowerCase())) {
        return coords;
      }
    }
    
    // Default to Lagos if no match
    return cityCoordinates['Lagos'];
  };

  const locationCoords = getLocationCoordinates();
  
  // Create interactive map HTML with multiple fallback tile providers for reliability
  const getMapHtml = () => {
    const { lat, lng } = locationCoords;
    // Validate coordinates - use default if invalid
    const validLat = (lat && !isNaN(lat) && lat !== 0) ? lat : 6.5244; // Default to Lagos
    const validLng = (lng && !isNaN(lng) && lng !== 0) ? lng : 3.3792; // Default to Lagos
    const location = (apartment?.location || 'Nigeria').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ');
    // Using OpenStreetMap with Leaflet.js - multiple tile provider fallbacks for Android reliability
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: #f5f5f5; }
      #map { width: 100%; height: 100%; min-height: 250px; background: #e8f5e9; }
      .loading { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #666; }
    </style>
  </head>
  <body>
    <div id="map">
      <div class="loading">Loading map...</div>
    </div>
    <script>
      (function() {
        var mapLoaded = false;
        var retryCount = 0;
        var maxRetries = 3;
        var lat = ${validLat};
        var lng = ${validLng};
        var location = '${location}';
        
        function loadLeaflet() {
          return new Promise(function(resolve, reject) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            link.onerror = function() { reject(new Error('CSS load failed')); };
            document.head.appendChild(link);
            
            var script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = function() {
              if (typeof L !== 'undefined') {
                resolve();
              } else {
                reject(new Error('Leaflet not defined'));
              }
            };
            script.onerror = function() { reject(new Error('Script load failed')); };
            document.body.appendChild(script);
          });
        }
        
        function initMap() {
          try {
            if (mapLoaded || typeof L === 'undefined') {
              return;
            }
            
            mapLoaded = true;
            var mapDiv = document.getElementById('map');
            mapDiv.innerHTML = '';
            
            // Validate coordinates before creating map
            if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
              throw new Error('Invalid coordinates');
            }
            
            var map = L.map('map', {
              center: [lat, lng],
              zoom: 13,
              zoomControl: true,
              scrollWheelZoom: true,
              doubleClickZoom: true,
              boxZoom: true,
              dragging: true,
              touchZoom: true
            });
            
            // Primary tile layer with fallbacks
            var tileProviders = [
              {
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                options: {
                  attribution: '© OpenStreetMap',
                  maxZoom: 19,
                  minZoom: 3
                }
              },
              {
                url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
                options: {
                  attribution: '© OpenStreetMap HOT',
                  maxZoom: 19,
                  minZoom: 3
                }
              },
              {
                url: 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png',
                options: {
                  attribution: '© OpenStreetMap DE',
                  maxZoom: 19,
                  minZoom: 3
                }
              }
            ];
            
            var currentProvider = 0;
            var tileLayer = L.tileLayer(tileProviders[currentProvider].url, tileProviders[currentProvider].options);
            
            tileLayer.on('tileerror', function(error, tile) {
              if (currentProvider < tileProviders.length - 1) {
                currentProvider++;
                map.removeLayer(tileLayer);
                tileLayer = L.tileLayer(tileProviders[currentProvider].url, tileProviders[currentProvider].options);
                tileLayer.addTo(map);
              }
            });
            
            tileLayer.addTo(map);
            
            var marker = L.marker([lat, lng]).addTo(map);
            marker.bindPopup('<b>' + location + '</b>').openPopup();
            
            setTimeout(function() {
              map.invalidateSize();
            }, 300);
            
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage('mapLoaded');
            }
          } catch (e) {
            logger.error('Map init error:', e);
            handleMapError(e);
          }
        }
        
        function handleMapError(error) {
          var mapDiv = document.getElementById('map');
          mapDiv.innerHTML = '<div class="loading"><div>Map unavailable</div><div style="font-size: 12px; margin-top: 10px;">Tap to open in Google Maps</div></div>';
          
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage('mapError:' + (error ? error.message : 'Unknown'));
          }
        }
        
        function attemptLoad() {
          loadLeaflet()
            .then(function() {
              setTimeout(initMap, 100);
            })
            .catch(function(err) {
              retryCount++;
              if (retryCount < maxRetries) {
                setTimeout(attemptLoad, 1000 * retryCount);
              } else {
                handleMapError(err);
              }
            });
        }
        
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', attemptLoad);
        } else {
          attemptLoad();
        }
      })();
    </script>
  </body>
</html>`;
  };

  // Open Google Maps in app or browser (for the button fallback)
  const openInMaps = () => {
    const location = encodeURIComponent(apartment?.location || 'Nigeria');
    const { lat, lng } = locationCoords;
    
    // Validate coordinates - use location string if coordinates are invalid
    const validLat = (lat && !isNaN(lat) && lat !== 0) ? lat : null;
    const validLng = (lng && !isNaN(lng) && lng !== 0) ? lng : null;
    
    let mapsUrl;
    if (validLat && validLng) {
      // Use coordinates if valid
      mapsUrl = `https://www.google.com/maps/search/?api=1&query=${validLat},${validLng}`;
    } else {
      // Fallback to location string
      mapsUrl = `https://www.google.com/maps/search/${location}`;
    }
    
    Linking.canOpenURL(mapsUrl).then(supported => {
      if (supported) {
        Linking.openURL(mapsUrl);
      } else {
        // Fallback to browser with location string
        Linking.openURL(`https://www.google.com/maps/search/${location}`);
      }
    }).catch(err => {
      logger.error('Error opening maps:', err);
      // Fallback to browser
      Linking.openURL(`https://www.google.com/maps/search/${location}`);
    });
  };

  // Handle map load events
  const handleMapLoad = () => {
    logger.log('Map loaded successfully');
    if (mapTimeoutRef.current) {
      clearTimeout(mapTimeoutRef.current);
      mapTimeoutRef.current = null;
    }
    setMapLoading(false);
    setMapError(false);
  };

  const handleMapError = (syntheticEvent) => {
      logger.error('Map error:', syntheticEvent);
    if (mapTimeoutRef.current) {
      clearTimeout(mapTimeoutRef.current);
      mapTimeoutRef.current = null;
    }
    if (syntheticEvent?.nativeEvent) {
      const { nativeEvent } = syntheticEvent;
      logger.error('Map loading error:', nativeEvent);
    } else {
      logger.error('Map loading error (unknown)');
    }
    setMapLoading(false);
    setMapError(true);
  };

  // Set timeout for map loading (10 seconds)
  React.useEffect(() => {
    if (apartment) {
      mapTimeoutRef.current = setTimeout(() => {
        if (mapLoading) {
          logger.warn('Map loading timeout - switching to fallback');
          setMapLoading(false);
          setMapError(true);
        }
      }, 10000);
      
      return () => {
        if (mapTimeoutRef.current) {
          clearTimeout(mapTimeoutRef.current);
        }
      };
    }
  }, [apartment, mapLoading]);

  const reviews = {
    overall: apartment?.rating || 4.92,
    count: 124,
    breakdown: [
      { stars: 5, percentage: 92 },
      { stars: 4, percentage: 5 },
      { stars: 3, percentage: 2 },
      { stars: 2, percentage: 1 },
      { stars: 1, percentage: 0 },
    ],
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Image Section with Swiper */}
        <View style={styles.imageContainer}>
          <FlatList
            ref={flatListRef}
            data={apartmentImages}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item, index) => index.toString()}
            onMomentumScrollEnd={(event) => {
              if (event?.nativeEvent?.contentOffset) {
                const index = Math.round(event.nativeEvent.contentOffset.x / width);
                setCurrentImageIndex(Math.min(Math.max(0, index), apartmentImages.length - 1));
              }
            }}
            renderItem={({ item }) => {
              const shouldShowPlaceholder = !item || isPlaceholderImage(item);
              return shouldShowPlaceholder ? (
                <PlaceholderImage style={styles.image} iconSize={80} iconColor="#FFF" />
              ) : (
                <Image 
                  source={{ uri: item }} 
                  style={styles.image}
                  onError={() => logger.log('Image failed to load')}
                />
              );
            }}
          />
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bookmarkButton}
            onPress={toggleFavorite}
          >
            <MaterialIcons 
              name={isFavorite ? 'bookmark' : 'bookmark-border'} 
              size={24} 
              color="#000" 
            />
          </TouchableOpacity>
          {/* Image Gallery Dots */}
          <View style={styles.imageDots}>
            {apartmentImages.map((_, index) => (
              <View 
                key={index}
                style={[
                  styles.dot, 
                  currentImageIndex === index && styles.dotActive
                ]} 
              />
            ))}
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Title and Location */}
          <Text style={styles.title}>{apartment?.title || 'Apartment'}</Text>
          <TouchableOpacity>
            <Text style={styles.location}>{apartment?.location || 'Nigeria'}, Nigeria</Text>
          </TouchableOpacity>

          {/* Host Info */}
          <TouchableOpacity 
            style={styles.hostContainer}
            onPress={() => {
              if (hostName || hostEmail || apartment?.hostName || apartment?.hostEmail) {
                // Pass updated apartment with latest host info
                const updatedApartment = {
                  ...apartment,
                  hostName: hostName || apartment?.hostName,
                  hostEmail: hostEmail || apartment?.hostEmail || apartment?.createdBy,
                  hostProfilePicture: hostProfilePicture || apartment?.hostProfilePicture,
                };
                navigation.navigate('HostProfile', { apartment: updatedApartment });
              }
            }}
            activeOpacity={0.7}
          >
            <View style={styles.hostAvatar}>
              {hostProfilePicture ? (
                <Image 
                  source={{ uri: hostProfilePicture }} 
                  style={styles.hostAvatarImage}
                  onError={(error) => {
                    logger.error('ApartmentDetailsScreen - Error loading host profile image:', error);
                    logger.log('Failed image URI:', hostProfilePicture);
                    setHostProfilePicture(null);
                  }}
                  onLoad={() => {
                    logger.log('ApartmentDetailsScreen - Host profile image loaded successfully:', hostProfilePicture);
                  }}
                />
              ) : (
                <View style={styles.hostAvatarPlaceholder}>
                  <Text style={styles.hostAvatarText}>
                    {(hostName || apartment?.hostName || 'H').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.hostInfo}>
              <Text style={styles.hostName}>
                Hosted by {hostName || apartment?.hostName || 'Property Owner'}
              </Text>
              {apartment?.isSuperhost && (
                <Text style={styles.superhost}>Superhost</Text>
              )}
            </View>
            <View style={styles.hostRating}>
              <MaterialIcons name="star" size={16} color="#FFD700" />
              <Text style={styles.hostRatingText}>{reviews?.overall || 0} ({reviews?.count || 0})</Text>
            </View>
          </TouchableOpacity>

          {/* Host Actions - Report/Block (App Store Requirement) */}
          <View style={styles.hostActionButtons}>
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={handleReportListing}
            >
              <MaterialIcons name="flag" size={18} color="#666" />
              <Text style={styles.actionButtonText}>Report Listing</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.actionButton} 
              onPress={handleBlockHost}
            >
              <MaterialIcons name="block" size={18} color="#666" />
              <Text style={styles.actionButtonText}>Block Host</Text>
            </TouchableOpacity>
          </View>

          {/* Key Metrics */}
          <View style={styles.metricsContainer}>
            {apartment?.maxGuests && (
              <View style={styles.metric}>
                <View style={styles.metricIcon}>
                  <MaterialIcons name="people" size={20} color="#333" />
                </View>
                <Text style={styles.metricText}>{apartment.maxGuests} Guests</Text>
              </View>
            )}
            {(apartment?.beds || apartment?.bedrooms) && (
              <View style={styles.metric}>
                <View style={styles.metricIcon}>
                  <MaterialIcons name="bed" size={20} color="#333" />
                </View>
                <Text style={styles.metricText}>{apartment?.beds || apartment?.bedrooms || 1} Bedrooms</Text>
              </View>
            )}
            {(apartment?.baths || apartment?.bathrooms) && (
              <View style={styles.metric}>
                <View style={styles.metricIcon}>
                  <MaterialIcons name="bathtub" size={20} color="#333" />
                </View>
                <Text style={styles.metricText}>{apartment?.baths || apartment?.bathrooms || 1} Bathroom</Text>
              </View>
            )}
            {apartment?.area && (
              <View style={styles.metric}>
                <View style={styles.metricIcon}>
                  <MaterialIcons name="square-foot" size={20} color="#333" />
                </View>
                <Text style={styles.metricText}>{apartment.area} sqft</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* About Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this place</Text>
            <Text style={styles.description}>
              {showFullDescription ? description : description.substring(0, 150) + '...'}
            </Text>
            <TouchableOpacity onPress={() => setShowFullDescription(!showFullDescription)}>
              <Text style={styles.readMore}>
                {showFullDescription ? 'Read less' : 'Read more'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Amenities Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What this place offers</Text>
            <View style={styles.amenitiesList}>
              {amenities.map((amenity, index) => (
                <View key={index} style={styles.amenityItem}>
                  <MaterialIcons name={amenity.icon} size={24} color="#333" />
                  <Text style={styles.amenityText}>{amenity.name}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.showAllButton}>
              <Text style={styles.showAllText}>Show all amenities</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Reservation Calculator */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reservation Calculator</Text>
            <View style={styles.calculatorContainer}>
              <View style={styles.dateInputContainer}>
                <Text style={styles.dateInputLabel}>Check-in Date</Text>
                <View style={styles.dateInputWrapper}>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="YYYY/MM/DD"
                    value={checkInDate}
                    onChangeText={handleCheckInChange}
                    placeholderTextColor="#999"
                  />
                  <TouchableOpacity
                    style={styles.calendarIconButton}
                    onPress={() => {
                      setShowCheckInCalendar(!showCheckInCalendar);
                      setShowCheckOutCalendar(false);
                    }}
                  >
                    <MaterialIcons name="calendar-today" size={24} color="#666" />
                  </TouchableOpacity>
                </View>
                {showCheckInCalendar && (
                  <View style={styles.calendarContainer}>
                    <Calendar
                      onDayPress={handleCheckInDayPress}
                      markedDates={getMarkedDates()}
                      markingType="period"
                      minDate={new Date().toISOString().split('T')[0]}
                      disabledDaysIndexes={[]}
                      theme={{
                        selectedDayBackgroundColor: '#FFD700',
                        selectedDayTextColor: '#000',
                        todayTextColor: '#FFD700',
                        arrowColor: '#FFD700',
                        monthTextColor: '#333',
                        textDayFontWeight: '500',
                        textMonthFontWeight: 'bold',
                        textDayHeaderFontWeight: '600',
                        disabledDayTextColor: '#CCC',
                      }}
                    />
                  </View>
                )}
              </View>
              
              <View style={styles.dateInputContainer}>
                <Text style={styles.dateInputLabel}>Check-out Date</Text>
                <View style={styles.dateInputWrapper}>
                  <TextInput
                    style={styles.dateInput}
                    placeholder="YYYY/MM/DD"
                    value={checkOutDate}
                    onChangeText={handleCheckOutChange}
                    placeholderTextColor="#999"
                  />
                  <TouchableOpacity
                    style={styles.calendarIconButton}
                    onPress={() => {
                      setShowCheckOutCalendar(!showCheckOutCalendar);
                      setShowCheckInCalendar(false);
                    }}
                  >
                    <MaterialIcons name="calendar-today" size={24} color="#666" />
                  </TouchableOpacity>
                </View>
                {showCheckOutCalendar && (
                  <View style={styles.calendarContainer}>
                    <Calendar
                      onDayPress={handleCheckOutDayPress}
                      markedDates={getMarkedDates()}
                      markingType="period"
                      minDate={checkInDate || new Date().toISOString().split('T')[0]}
                      disabledDaysIndexes={[]}
                      theme={{
                        selectedDayBackgroundColor: '#FFD700',
                        selectedDayTextColor: '#000',
                        todayTextColor: '#FFD700',
                        arrowColor: '#FFD700',
                        monthTextColor: '#333',
                        textDayFontWeight: '500',
                        textMonthFontWeight: 'bold',
                        textDayHeaderFontWeight: '600',
                        disabledDayTextColor: '#CCC',
                      }}
                    />
                  </View>
                )}
              </View>

              {/* Number of Guests Input */}
              <View style={styles.guestInputContainer}>
                <Text style={styles.guestInputLabel}>Number of Guests</Text>
                <View style={styles.guestInputWrapper}>
                  <MaterialIcons name="people" size={24} color="#666" style={styles.guestIcon} />
                  <TextInput
                    style={styles.guestInput}
                    placeholder="Enter number of guests"
                    value={numberOfGuests > 0 ? numberOfGuests.toString() : ''}
                    onChangeText={handleGuestChange}
                    keyboardType="numeric"
                    placeholderTextColor="#999"
                  />
                  <Text style={styles.maxGuestsText}>
                    Max: {getMaxGuests()} guests
                  </Text>
                </View>
              </View>

              {/* Date Conflict Error Message */}
              {dateConflictError && (
                <View style={styles.errorContainer}>
                  <MaterialIcons name="error-outline" size={20} color="#F44336" />
                  <Text style={styles.errorText}>{dateConflictError}</Text>
                </View>
              )}
              
              {checkInDate && checkOutDate && (
                <View style={styles.calculationResult}>
                  <View style={styles.calculationRow}>
                    <Text style={styles.calculationLabel}>
                      ₦{(apartment?.price || 0).toLocaleString()}/day × {numberOfDays} {numberOfDays === 1 ? 'day' : 'days'}
                    </Text>
                    <Text style={styles.calculationValue}>
                      ₦{calculateTotal().toLocaleString()}
                    </Text>
                  </View>
                  <View style={[styles.calculationRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Total Price</Text>
                    <Text style={styles.totalValue}>
                      ₦{calculateTotal().toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Location Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Where you'll be</Text>
            <View style={styles.mapContainer}>
              {mapError ? (
                // Fallback if map fails to load
                <TouchableOpacity 
                  style={styles.mapFallback}
                  onPress={openInMaps}
                  activeOpacity={0.9}
                >
                  <View style={styles.mapBackground}>
                    <MaterialIcons name="map" size={60} color="#E0E0E0" />
                  </View>
                  <View style={styles.mapOverlay}>
                    <View style={styles.mapPin}>
                      <MaterialIcons name="location-on" size={32} color="#FFD700" />
                      <View style={styles.mapPinDot} />
                    </View>
                    <View style={styles.mapButton}>
                      <MaterialIcons name="open-in-new" size={16} color="#333" />
                      <Text style={styles.mapButtonText}>View on Google Maps</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                // Interactive WebView map
                <View style={styles.mapWebViewContainer}>
                  {mapLoading && (
                    <View style={styles.mapLoadingContainer}>
                      <ActivityIndicator size="large" color="#FFD700" />
                      <Text style={styles.mapLoadingText}>Loading map...</Text>
                    </View>
                  )}
                  <PlatformWebView
                    source={{ 
                      html: getMapHtml(),
                      baseUrl: 'https://unpkg.com'
                    }}
                    style={styles.mapWebView}
                    onLoadEnd={handleMapLoad}
                    onError={handleMapError}
                    onHttpError={handleMapError}
                    onMessage={(event) => {
                      const message = event.nativeEvent.data;
                      logger.log('WebView message:', message);
                      if (message === 'mapLoaded') {
                        handleMapLoad();
                      } else if (message.startsWith('mapError:')) {
                        logger.error('Map error from WebView:', message);
                        handleMapError();
                      }
                    }}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    startInLoadingState={true}
                    scalesPageToFit={false}
                    originWhitelist={['*']}
                    mixedContentMode="always"
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    // Android specific props (only applied on Android)
                    {...(Platform.OS === 'android' && {
                      androidHardwareAccelerationDisabled: true,
                      androidLayerType: 'software',
                      androidMixedContentMode: 'always',
                    })}
                    // iOS specific props (only applied on iOS)
                    {...(Platform.OS === 'ios' && {
                      allowsBackForwardNavigationGestures: false,
                      allowsLinkPreview: false,
                    })}
                    // Cross-platform settings
                    cacheEnabled={false}
                    incognito={true}
                    setSupportMultipleWindows={false}
                    thirdPartyCookiesEnabled={false}
                  />
                  <TouchableOpacity 
                    style={styles.mapOpenButton}
                    onPress={openInMaps}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="open-in-new" size={16} color="#333" />
                    <Text style={styles.mapButtonText}>Open in Google Maps</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            <Text style={styles.mapLocation}>{apartment?.location || 'Nigeria'}, Nigeria</Text>
            <Text style={styles.mapNote}>You can zoom and pan the map. The exact address is provided after booking.</Text>
          </View>

          <View style={styles.divider} />

          {/* Reviews Section */}
          <View style={styles.section}>
            <View style={styles.reviewsHeader}>
              <View>
                <Text style={styles.reviewsTitle}>Reviews</Text>
                <View style={styles.reviewsRating}>
                  <Text style={styles.reviewsRatingNumber}>{reviews?.overall || 0}</Text>
                  <View style={styles.reviewsStars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <MaterialIcons key={star} name="star" size={16} color="#FFD700" />
                    ))}
                  </View>
                </View>
                <Text style={styles.reviewsCount}>{reviews?.count || 0} reviews</Text>
              </View>
            </View>
            <View style={styles.reviewsBreakdown}>
              {(reviews?.breakdown || []).map((item, index) => (
                <View key={index} style={styles.reviewBarRow}>
                  <Text style={styles.reviewBarLabel}>{item.stars} stars</Text>
                  <View style={styles.reviewBarContainer}>
                    <View 
                      style={[
                        styles.reviewBar, 
                        { width: `${item.percentage}%`, backgroundColor: item.percentage > 0 ? '#FFD700' : '#E0E0E0' }
                      ]} 
                    />
                  </View>
                  <Text style={styles.reviewBarPercentage}>{item.percentage}%</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Booking Bar */}
      <View style={styles.bookingBar}>
        <View style={styles.bookingInfo}>
          <Text style={styles.bookingPrice}>
            {numberOfDays > 0 && checkInDate && checkOutDate 
              ? `₦${calculateTotal().toLocaleString()} total`
              : `${formatPrice(apartment?.price || 0)}/day`}
          </Text>
          <Text style={styles.bookingDates}>
            {checkInDate && checkOutDate 
              ? `${checkInDate} - ${checkOutDate}` 
              : checkInDate
              ? `Check-in: ${checkInDate}`
              : 'Select dates'}
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.reserveButton} 
          onPress={async () => {
            if (!checkInDate || !checkOutDate) {
              Alert.alert('Dates required', 'Please select check-in and check-out dates');
              return;
            }
            
            // Check for date conflicts before proceeding
            const hasConflict = await checkDateConflict(checkInDate, checkOutDate);
            
            if (hasConflict) {
              Alert.alert('Unavailable', 'This apartment is unavailable for the selected dates. Please choose another date.');
              return;
            }
            
            // Clear any previous error
            setDateConflictError(null);
            
            navigation.navigate('PaymentConfirmation', {
              apartment,
              checkInDate,
              checkOutDate,
              numberOfDays,
              numberOfGuests: numberOfGuests || 1,
            });
          }}
        >
          <Text style={styles.reserveButtonText}>Reserve</Text>
        </TouchableOpacity>
      </View>

      {/* Guest Warning Modal */}
      <Modal
        visible={showGuestWarningModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowGuestWarningModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <MaterialIcons name="info" size={32} color="#FFD700" />
              <Text style={styles.modalTitle}>Guest Capacity Exceeded</Text>
            </View>
            <Text style={styles.modalMessage}>
              We appreciate your interest! However, this property accommodates up to {getMaxGuests()} guests. Please check out our other listings that may better suit your group size. Thank you for understanding!
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.exploreButton]}
                onPress={handleExploreMore}
              >
                <Text style={styles.exploreButtonText}>Explore More</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.okayButton]}
                onPress={handleOkay}
              >
                <Text style={styles.okayButtonText}>Okay</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    width: width,
    height: 400,
    position: 'relative',
  },
  image: {
    width: width,
    height: 400,
    resizeMode: 'cover',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  bookmarkButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  imageDots: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    marginLeft: -30,
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  dotActive: {
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 20,
    paddingBottom: 100,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  location: {
    fontSize: 16,
    color: '#666',
    textDecorationLine: 'underline',
    marginBottom: 24,
  },
  hostContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  hostAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
    overflow: 'hidden',
  },
  hostAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
    resizeMode: 'cover',
  },
  hostAvatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hostAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  hostInfo: {
    flex: 1,
  },
  hostName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  superhost: {
    fontSize: 14,
    color: '#666',
  },
  hostRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hostRatingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  hostActionButtons: {
    flexDirection: 'row',
    marginTop: -16, // Pull up closer to host info
    marginBottom: 24,
    gap: 24,
    paddingLeft: 68, // Align with host name (56 avatar + 12 margin)
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  actionButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  metricsContainer: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#FFF9E6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 32,
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 8,
  },
  readMore: {
    fontSize: 16,
    color: '#333',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  amenitiesList: {
    marginBottom: 16,
  },
  amenityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  amenityText: {
    fontSize: 16,
    color: '#333',
  },
  showAllButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    marginTop: 8,
  },
  showAllText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  mapContainer: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    height: 250,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  mapWebViewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  mapWebView: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F5',
  },
  mapLoadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    zIndex: 1,
  },
  mapLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  mapFallback: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  mapImageContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  mapBackground: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPin: {
    position: 'absolute',
    top: '38%',
    left: '50%',
    marginLeft: -16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPinDot: {
    position: 'absolute',
    top: 28,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFD700',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  mapButton: {
    position: 'absolute',
    bottom: 16,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  mapOpenButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  mapButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  mapLocation: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  mapNote: {
    fontSize: 14,
    color: '#666',
  },
  reviewsHeader: {
    marginBottom: 20,
  },
  reviewsTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  reviewsRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  reviewsRatingNumber: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  reviewsStars: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewsCount: {
    fontSize: 14,
    color: '#666',
  },
  reviewsBreakdown: {
    gap: 12,
  },
  reviewBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reviewBarLabel: {
    fontSize: 14,
    color: '#333',
    width: 50,
  },
  reviewBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  reviewBar: {
    height: '100%',
    borderRadius: 4,
  },
  reviewBarPercentage: {
    fontSize: 14,
    color: '#666',
    width: 40,
    textAlign: 'right',
  },
  bookingBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  bookingInfo: {
    flex: 1,
  },
  bookingPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  bookingDates: {
    fontSize: 14,
    color: '#666',
    textDecorationLine: 'underline',
  },
  reserveButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  reserveButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  calculatorContainer: {
    marginTop: 8,
  },
  dateInputContainer: {
    marginBottom: 16,
  },
  dateInputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  dateInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    overflow: 'hidden',
  },
  dateInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#333',
  },
  calendarIconButton: {
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarContainer: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  guestInputContainer: {
    marginTop: 16,
    marginBottom: 16,
  },
  guestInputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  guestInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  guestIcon: {
    marginRight: 12,
  },
  guestInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  maxGuestsText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    fontWeight: '500',
  },
  guestWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 12,
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFE0E0',
    gap: 8,
  },
  guestWarningText: {
    flex: 1,
    fontSize: 14,
    color: '#FF6B6B',
    lineHeight: 20,
  },
  calculationResult: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
  },
  calculationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calculationLabel: {
    fontSize: 16,
    color: '#666',
  },
  calculationValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 12,
    marginTop: 8,
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreButton: {
    backgroundColor: '#FFD700',
  },
  exploreButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  okayButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  okayButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
});
