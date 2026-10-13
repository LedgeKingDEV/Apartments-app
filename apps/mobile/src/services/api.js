// API Base Configuration
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../api/api';
import { handleTokenExpiration } from '../utils/tokenExpirationHandler';
import { refreshToken, getValidToken } from '../utils/tokenRefresh';
import { logger } from '../utils/logger';

const BASE_URL = API_CONFIG.BASE_URL;

// Helper function to get auth token
// Now checks if token is expired and attempts refresh before returning
const getAuthToken = async (skipRefresh = false) => {
  try {
    // If skipRefresh is false, check token validity and refresh if needed
    if (!skipRefresh) {
      const validToken = await getValidToken();
      if (validToken) {
        return validToken;
      }
    }

    // Fallback to direct token retrieval
    const userData = await AsyncStorage.getItem('user');
    if (userData) {
      const user = JSON.parse(userData);
      const token = user?.token || user?.accessToken || null;
      if (!token) {
        logger.warn('User data found but no token available');
      }
      return token;
    } else {
      logger.log('ℹ️ No user data found in AsyncStorage - continuing as guest/unauthenticated');
    }
    return null;
  } catch (error) {
    logger.error('Error getting auth token:', error);
    return null;
  }
};

// Base API request function
const apiRequest = async (endpoint, options = {}, retryCount = 0) => {
  const isAuthEndpoint = endpoint.includes('/auth/login') || endpoint.includes('/auth/register') || endpoint.includes('/auth/firebase');
  const isPaymentEndpoint = endpoint.includes('/payments/');
  const isWalletEndpoint = endpoint.includes('/wallet/');
  
  // Get token (with automatic refresh check)
  const token = await getAuthToken();
  
  // Debug logging for payment endpoints
  if (isPaymentEndpoint) {
      logger.log('🔍 Payment endpoint - Token check:', {
      hasToken: !!token,
      tokenType: token ? typeof token : 'none',
      tokenLength: token ? token.length : 0,
      tokenPreview: token ? token.substring(0, 30) + '...' : 'none'
    });
    
    // Also check AsyncStorage directly for debugging
    try {
      const userData = await AsyncStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        logger.log('🔍 AsyncStorage user data:', {
          hasToken: !!user.token,
          hasAccessToken: !!user.accessToken,
          email: user.email,
          allKeys: Object.keys(user)
        });
      } else {
        logger.warn('⚠️ No user data in AsyncStorage');
      }
    } catch (debugError) {
      logger.error('Error checking AsyncStorage:', debugError);
    }
  }
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  if (token) {
    // Clean token (remove any quotes or whitespace)
    const cleanToken = token.trim().replace(/^["']|["']$/g, '');
    defaultHeaders['Authorization'] = `Bearer ${cleanToken}`;
    if (isPaymentEndpoint && __DEV__) {
      logger.log('✅ Payment request with token:', cleanToken.substring(0, 30) + '...');
      logger.log('✅ Authorization header set:', `Bearer ${cleanToken.substring(0, 20)}...`);
      logger.log('✅ Full Authorization header length:', `Bearer ${cleanToken}`.length);
    }
  } else if (isPaymentEndpoint) {
      // For payment endpoints, log warning if no token
      logger.error('❌ Payment endpoint requires authentication but no token found');
      logger.error('Make sure you are logged in. Try signing out and signing in again.');
      logger.error('Checking AsyncStorage for user data...');
      // Try to get user data directly for debugging
      AsyncStorage.getItem('user').then(userData => {
        if (userData) {
          try {
            const user = JSON.parse(userData);
            logger.error('User data found:', {
              hasToken: !!user.token,
              hasAccessToken: !!user.accessToken,
              email: user.email,
              keys: Object.keys(user)
            });
          } catch (e) {
            logger.error('Could not parse user data:', e);
          }
        } else {
          logger.error('No user data in AsyncStorage');
        }
      }).catch(err => logger.error('Error reading AsyncStorage:', err));
    }

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    // Extract method from options (defaults to GET if not specified)
    const method = options.method || 'GET';

    // Log request details for payment endpoints (in dev mode)
    if (isPaymentEndpoint && __DEV__) {
      const requestDetails = {
        url: `${BASE_URL}${endpoint}`,
        method: method,
        hasAuthHeader: !!defaultHeaders['Authorization'],
        authHeaderPreview: defaultHeaders['Authorization'] ? 
          defaultHeaders['Authorization'].substring(0, 30) + '...' : 'none',
        allHeaders: { ...defaultHeaders }
      };
      logger.log('📤 Making payment request:');
      logger.log(JSON.stringify(requestDetails, null, 2));
      logger.log('Full request object:', requestDetails);
    }
    
    try {
      // Add cache-busting headers for GET requests to prevent browser caching
      // This is critical for real-time cross-device listing sync
      if (method === 'GET' && !config.headers['Cache-Control']) {
        config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        config.headers['Pragma'] = 'no-cache';
        config.headers['Expires'] = '0';
      }
      
      // Setup timeout controller
      // Use custom timeout from options if provided, otherwise fallback to config or default 30s
      const timeoutDuration = options.timeout || API_CONFIG.TIMEOUT || 30000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);
      
      if (options.timeout) {
        logger.log(`⏱️ Using custom timeout: ${options.timeout}ms for ${endpoint}`);
      }
      
      // Ensure method is included in fetch config
      const fetchConfig = {
        ...config,
        method: method, // Explicitly set method for fetch
        signal: controller.signal,
      };
      
      const response = await fetch(`${BASE_URL}${endpoint}`, fetchConfig);
      clearTimeout(timeoutId);
    
    // Log response details for payment endpoints (in dev mode)
    if (isPaymentEndpoint && __DEV__) {
      logger.log('📥 Payment response received:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        ok: response.ok
      });
    }
    
    // Handle response body - read it carefully, handling empty responses
    const contentType = response.headers.get('content-type');
    let data = null;
    let responseText = '';
    
    try {
      // Always read as text first to handle empty responses
      responseText = await response.text();
      
      if (responseText && responseText.trim().length > 0) {
        // If we have content, try to parse as JSON if it looks like JSON
        if (contentType && contentType.includes('application/json')) {
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            // Not valid JSON despite content-type, use as text
            data = responseText;
          }
        } else {
          // Not JSON content-type, try to parse anyway (some APIs don't set content-type correctly)
          try {
            data = JSON.parse(responseText);
          } catch {
            data = responseText;
          }
        }
      } else {
        // Empty response body
        data = '[no body]';
      }
    } catch (readError) {
      logger.error('Error reading response body:', readError);
      data = '[no body]';
    }

    if (!response.ok) {
      // General 401 Token Refresh Logic for ALL endpoints (except Auth/Login/Register)
      // This ensures favorites, listings, etc. also auto-refresh
      if (response.status === 401 && retryCount === 0 && !isAuthEndpoint) {
          logger.log('🔄 401 error detected on ' + endpoint + ', attempting token refresh and retry...');
          try {
            const newToken = await refreshToken();
            if (newToken) {
              logger.log('✅ Token refreshed, retrying request to ' + endpoint);
              // Update token in options and retry
              const updatedOptions = {
                ...options,
                headers: {
                  ...options.headers,
                  'Authorization': `Bearer ${newToken}`,
                },
              };
              // Retry the request once with new token
              return apiRequest(endpoint, updatedOptions, retryCount + 1);
            }
          } catch (refreshError) {
            logger.warn('⚠️ Token refresh failed:', refreshError);
            // Continue with normal error handling below
          }
      }

      // For email endpoints, don't treat 401/403 as fatal - log and return null
      const isEmailEndpoint = endpoint.includes('/email/');
      
      // For authentication endpoints (login/register), throw errors so users get feedback
      if (isAuthEndpoint) {
        // For auth endpoints, extract error message from various possible formats
        let errorMessage = `Authentication failed (${response.status})`;
        
        // Handle different error response formats
        if (typeof data === 'string') {
          // String response - use it directly
          errorMessage = data.trim() || errorMessage;
        } else if (data && typeof data === 'object') {
          // JSON object response - try multiple common error message fields
          // Prioritize specific error messages, especially for password validation
          
          // First, check for nested errors object (most common for validation errors)
          if (data.errors) {
            if (Array.isArray(data.errors)) {
              // If errors is an array, join them with proper formatting
              errorMessage = data.errors.map(err => {
                if (typeof err === 'string') return err;
                if (err.message) return err.message;
                if (err.msg) return err.msg;
                return JSON.stringify(err);
              }).join('. ');
            } else if (typeof data.errors === 'object') {
              // If errors is an object (like {password: "too weak", email: "invalid"})
              const errorKeys = Object.keys(data.errors);
              if (errorKeys.length > 0) {
                errorMessage = errorKeys.map(key => {
                  const errValue = data.errors[key];
                  if (Array.isArray(errValue)) {
                    // Capitalize field name and format error
                    const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
                    return `${fieldName}: ${errValue.join(', ')}`;
                  }
                  // Capitalize field name
                  const fieldName = key.charAt(0).toUpperCase() + key.slice(1);
                  return `${fieldName}: ${errValue}`;
                }).join('. ');
              }
            } else if (typeof data.errors === 'string') {
              errorMessage = data.errors;
            }
          }
          
          // If we didn't get error from errors field, try standard error message fields
          if (errorMessage === `Authentication failed (${response.status})` || !errorMessage) {
            errorMessage = data.message || 
                          data.error || 
                          data.errorMessage ||
                          data.msg ||
                          errorMessage;
          }
          
          // If we still have the default message, try to extract from nested structures
          if (errorMessage === `Authentication failed (${response.status})` && data.data) {
            errorMessage = data.data.message || data.data.error || data.data.errorMessage || errorMessage;
          }
        }
        
        // Ensure we have a meaningful error message
        if (!errorMessage || errorMessage === `Authentication failed (${response.status})`) {
          // Provide default messages based on status code
          if (response.status === 400) {
            errorMessage = 'Invalid information provided. Please check your details.';
          } else if (response.status === 409) {
            errorMessage = 'Account already exists. Please sign in instead.';
          } else if (response.status === 422) {
            errorMessage = 'Validation error. Please check your information.';
          }
        }
        
        const error = new Error(errorMessage);
        error.status = response.status;
        throw error;
      }
      
      // For email endpoints, handle errors gracefully
      if (isEmailEndpoint) {
        if (response.status === 401 || response.status === 403) {
          const errorMessage = data?.message || 'Authentication required';
          // Only log once per endpoint call
          if (!global._emailAuthErrorLogged) {
            logger.warn(`Email API authentication error (${response.status}):`, errorMessage);
            global._emailAuthErrorLogged = true;
            setTimeout(() => { global._emailAuthErrorLogged = false; }, 5000);
          }
        } else if (response.status === 500) {
          // 500 error means backend endpoint exists but has server-side issue
          // Only log once to reduce noise
          if (!global._email500ErrorLogged) {
            logger.warn(`Email API server error (500): Backend email service needs configuration`);
            global._email500ErrorLogged = true;
            setTimeout(() => { global._email500ErrorLogged = false; }, 10000);
          }
        } else if (response.status !== 200) {
          // Only log non-200 errors once
          if (!global._emailErrorLogged) {
            logger.warn(`Email API error (${response.status}):`, data?.message || data?.error || 'Unknown error');
            global._emailErrorLogged = true;
            setTimeout(() => { global._emailErrorLogged = false; }, 5000);
          }
        }
        // Return null for email endpoints to allow graceful handling
        return null;
      }
      
      // For payment and wallet endpoints, throw errors so they can be handled properly
      if (isPaymentEndpoint || isWalletEndpoint) {
        // Use actual HTTP status code, not error message
        const httpStatus = response.status;
        let errorMessage = '';
        
        // If response has no body or empty body
        if (!data || data === '[no body]' || (typeof data === 'string' && data.trim() === '')) {
          if (httpStatus === 401) {
            errorMessage = 'Authentication failed. Your session may have expired. You can continue using the app, but some features may not work until you sign out and sign in again.';
          } else if (httpStatus === 403) {
            errorMessage = 'Access denied. You do not have permission to perform this action.';
          } else if (httpStatus === 500) {
            errorMessage = 'Server error. The backend may not have Flutterwave credentials configured in Railway. Please check Railway environment variables: FLUTTERWAVE_CLIENT_ID, FLUTTERWAVE_CLIENT_SECRET, FLUTTERWAVE_ENCRYPTION_KEY';
          } else {
            errorMessage = `Server error (${httpStatus}). Please check backend logs.`;
          }
        } else if (typeof data === 'string') {
          // For 500 errors, provide more helpful message
          if (httpStatus === 500) {
            errorMessage = `Backend error (500): ${data}. This usually means Flutterwave credentials are missing in Railway. Check Railway environment variables.`;
          } else {
            errorMessage = data;
          }
        } else if (typeof data === 'object' && data) {
          // Extract error message, but prioritize HTTP status
          const extractedMsg = data.message || data.error || data.errorMessage;
          if (httpStatus === 500) {
            // For 500 errors, provide more helpful message about Flutterwave config
            errorMessage = extractedMsg ? 
              `Backend error (500): ${extractedMsg}. Check Railway backend logs and ensure Flutterwave environment variables are set.` :
              'Server error (500). Backend may not have Flutterwave credentials configured. Check Railway environment variables: FLUTTERWAVE_CLIENT_ID, FLUTTERWAVE_CLIENT_SECRET, FLUTTERWAVE_ENCRYPTION_KEY';
          } else if (httpStatus === 401 || httpStatus === 403) {
            // For 401 errors, try to refresh token and retry the request
            if (httpStatus === 401 && retryCount === 0 && !isAuthEndpoint) {
              const { logger } = await import('../utils/logger');
              logger.log('🔄 401 error detected, attempting token refresh and retry...');
              try {
                const newToken = await refreshToken();
                if (newToken) {
                  logger.log('✅ Token refreshed, retrying request...');
                  // Update token in options and retry
                  const updatedOptions = {
                    ...options,
                    headers: {
                      ...options.headers,
                      'Authorization': `Bearer ${newToken}`,
                    },
                  };
                  // Retry the request once with new token
                  return apiRequest(endpoint, updatedOptions, retryCount + 1);
                }
              } catch (refreshError) {
                logger.warn('⚠️ Token refresh failed:', refreshError);
                // Continue with normal error handling
              }
            }
            
            // For auth errors, use extracted message or default
            errorMessage = extractedMsg || 'Authentication failed. You can continue using the app, but some features may not work until you sign out and sign in again.';
            
            // Handle token expiration gracefully WITHOUT logging out
            // User stays logged in and can continue using the app
            if (httpStatus === 401 && retryCount > 0) {
              // Already tried refresh, handle expiration gracefully
              handleTokenExpiration(errorMessage).catch(err => {
                logger.error('Error in token expiration handler:', err);
              });
            } else if (httpStatus === 401 && retryCount === 0) {
              // First attempt - refresh failed or not possible, handle gracefully
              handleTokenExpiration(errorMessage).catch(err => {
                logger.error('Error in token expiration handler:', err);
              });
            }
          } else {
            errorMessage = extractedMsg || JSON.stringify(data);
          }
        }
        
        // Fallback error message if still empty
        if (!errorMessage || errorMessage.trim() === '') {
          if (httpStatus === 401 || httpStatus === 403) {
            if (!token) {
              errorMessage = 'You must be logged in to create a virtual account. Please sign in first.';
            } else {
              errorMessage = 'Your session has expired. You can continue using the app, but some features may not work until you sign out and sign in again.';
              
              // For 401 errors, try to refresh token and retry the request
              if (httpStatus === 401 && retryCount === 0 && !isAuthEndpoint) {
                const { logger } = await import('../utils/logger');
                logger.log('🔄 401 error detected, attempting token refresh and retry...');
                try {
                  const newToken = await refreshToken();
                  if (newToken) {
                    logger.log('✅ Token refreshed, retrying request...');
                    // Update token in options and retry
                    const updatedOptions = {
                      ...options,
                      headers: {
                        ...options.headers,
                        'Authorization': `Bearer ${newToken}`,
                      },
                    };
                    // Retry the request once with new token
                    return apiRequest(endpoint, updatedOptions, retryCount + 1);
                  }
                } catch (refreshError) {
                  logger.warn('⚠️ Token refresh failed:', refreshError);
                  // Continue with normal error handling
                }
              }
              
              // Handle token expiration gracefully WITHOUT logging out
              // User stays logged in and can continue using the app
              if (httpStatus === 401) {
                handleTokenExpiration(errorMessage).catch(err => {
                  logger.error('Error in token expiration handler:', err);
                });
              }
            }
          } else if (httpStatus === 500) {
            errorMessage = 'Server error (500). The backend may not have Flutterwave credentials configured in Railway. Please check Railway environment variables and backend logs.';
          } else {
            errorMessage = `Payment API error (${httpStatus}). Check your authentication and try again.`;
          }
        }
        
        // Log full error details for debugging
        const errorDetails = {
          status: response.status,
          endpoint,
          errorMessage,
          responseData: data,
          hasToken: !!token,
          tokenPreview: token ? token.substring(0, 30) + '...' : 'none',
          tokenLength: token ? token.length : 0,
          responseHeaders: Object.fromEntries(response.headers.entries())
        };
        const endpointType = isPaymentEndpoint ? 'Payment' : (isWalletEndpoint ? 'Wallet' : 'API');
        logger.error(`❌ ${endpointType} endpoint error:`);
        logger.error(JSON.stringify(errorDetails, null, 2));
        logger.error('Full error object:', errorDetails);
        
        const error = new Error(errorMessage);
        error.status = response.status;
        error.response = { data };
        throw error;
      }
      
      // For other endpoints, return null for graceful fallback (preserves frontend)
      if (response.status === 403 || response.status === 401) {
        // Only log authentication errors in development or for specific endpoints
        // Suppress for common endpoints that frequently fail (like listings, apartments)
        const suppressLog = endpoint.includes('/apartments') || 
                           endpoint.includes('/listings') || 
                           endpoint.includes('/favorites');
        if (!suppressLog) {
          logger.log('API authentication error, using local storage fallback');
        }
        return null;
      }
      // For other errors, also return null to preserve frontend
      // Suppress logs for common endpoints
      const suppressLog = endpoint.includes('/apartments') || 
                         endpoint.includes('/listings') || 
                         endpoint.includes('/favorites');
      if (!suppressLog) {
        logger.log(`API error ${response.status}, using local storage fallback`);
      }
      return null;
    }

    return data;
  } catch (error) {
    // If error was already thrown (from auth/payment endpoints with status), re-throw it
    if (error.status && (error.status === 401 || error.status === 403 || error.status === 400 || error.status === 404 || error.status === 409 || error.status === 500)) {
      // This is an error that was thrown - re-throw it
      throw error;
    }
    
    // For auth and payment endpoints, throw network errors so users get feedback
    if (isAuthEndpoint || isPaymentEndpoint || isWalletEndpoint) {
      // Check if it's a network error or timeout
      const isNetworkError = !error.status || error.status === 0 || 
                            error.message?.includes('network') || 
                            error.message?.includes('timeout') ||
                            error.message?.includes('fetch') ||
                            error.message?.includes('Failed to fetch');
      
      if (isNetworkError) {
        const networkError = new Error('Network error. Please check your connection and try again.');
        networkError.status = 0; // Indicate network error
        networkError.isNetworkError = true;
        throw networkError;
      }
      
      // For other errors, provide more context
      const apiError = new Error(error.message || 'API request failed. Please try again.');
      apiError.status = error.status || 0;
      apiError.originalError = error;
      throw apiError;
    }
    
    // Detect CORS errors specifically for better error messages
    const isCorsError = error.message && (
      error.message.includes('CORS') ||
      error.message.includes('Access-Control-Allow-Origin') ||
      error.message.includes('blocked by CORS policy') ||
      (error.name === 'TypeError' && error.message.includes('Failed to fetch') && typeof window !== 'undefined')
    );
    
    if (isCorsError && __DEV__) {
      // Only log CORS warning once per session to reduce console noise
      if (!global._corsErrorLogged) {
        logger.warn('⚠️ CORS Configuration Required:', 
          'The backend API needs to be configured to allow requests from http://localhost:8081. ' +
          'See CORS_CONFIGURATION.md for backend configuration instructions. ' +
          'Note: This only affects web development - iOS and Android apps work fine.'
        );
        global._corsErrorLogged = true;
      }
    }
    
    // Network errors, timeouts, etc. - return null to preserve frontend for non-auth endpoints
    const errorMessage = error?.message || error?.toString() || 'Unknown network error';
    logger.log('API network error, using local storage fallback:', errorMessage);
    return null;
  }
};

// API Methods
export const api = {
  // GET request
  get: (endpoint, options = {}) => {
    return apiRequest(endpoint, {
      ...options,
      method: 'GET',
    });
  },

  // POST request
  post: (endpoint, data, options = {}) => {
    // CRITICAL: Verify images are in the request body before sending
    if (data && (data.images || data.photos || data.image)) {
      const bodyString = JSON.stringify(data);
      const hasImagesInBody = bodyString.includes('data:image') || 
                             bodyString.includes('"images"') || 
                             bodyString.includes('"photos"') ||
                             bodyString.includes('"image"');
      
      if (__DEV__) {
        logger.log('📤 POST request with images:', {
          endpoint,
          hasImages: !!(data.images || data.photos || data.image),
          imagesCount: data.images?.length || 0,
          photosCount: data.photos?.length || 0,
          hasImagesInBody,
          bodySize: `${(new Blob([bodyString]).size / 1024).toFixed(2)} KB`,
        });
        
        if ((data.images || data.photos || data.image) && !hasImagesInBody) {
          logger.error('❌ CRITICAL: Images exist in data but NOT in JSON body!');
          logger.error('  Images may be lost during JSON.stringify');
        }
      }
    }
    
    return apiRequest(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // PUT request
  put: (endpoint, data, options = {}) => {
    // CRITICAL: Verify images are in the request body before sending
    if (data && (data.images || data.photos || data.image)) {
      const bodyString = JSON.stringify(data);
      const hasImagesInBody = bodyString.includes('data:image') || 
                             bodyString.includes('"images"') || 
                             bodyString.includes('"photos"') ||
                             bodyString.includes('"image"');
      
      if (__DEV__) {
        logger.log('📤 PUT request with images:', {
          endpoint,
          hasImages: !!(data.images || data.photos || data.image),
          imagesCount: data.images?.length || 0,
          photosCount: data.photos?.length || 0,
          hasImagesInBody,
        });
      }
    }
    
    return apiRequest(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // PATCH request
  patch: (endpoint, data, options = {}) => {
    return apiRequest(endpoint, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // DELETE request
  delete: (endpoint, options = {}) => {
    return apiRequest(endpoint, {
      ...options,
      method: 'DELETE',
    });
  },
};

export default api;

