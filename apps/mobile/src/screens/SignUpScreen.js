import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import * as Google from 'expo-auth-session/providers/google';
import { useNavigation } from '@react-navigation/native';
import { authService } from '../services/authService';
import { signInWithGoogle } from '../services/firebaseGoogleAuth';
import { markWelcomeDealSeen } from '../utils/userStorage';
import { logger } from '../utils/logger';
import { GOOGLE_AUTH, isGoogleConfigured } from '../constants/googleAuth';
// Welcome deal modal is now shown on the home page (ExploreScreen) instead

let AppleAuthentication;
if (Platform.OS === 'ios') {
  AppleAuthentication = require('expo-apple-authentication');
}

export default function SignUpScreen() {
  const navigation = useNavigation();
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showWelcomeDeal, setShowWelcomeDeal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  // Google Sign In uses OAuth credentials from Google Cloud Console
  // Create them at: https://console.cloud.google.com/apis/credentials
  // and add the client IDs to src/constants/googleAuth.js
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: GOOGLE_AUTH.iosClientId,
    androidClientId: GOOGLE_AUTH.androidClientId,
    webClientId: GOOGLE_AUTH.webClientId,
  });

  const handleClaimDeal = async () => {
    if (!newUserEmail) return;
    
    try {
      setLoading(true);
      
      // Mark deal as claimed (no wallet funding)
      await markWelcomeDealSeen(newUserEmail, true);
      
      setShowWelcomeDeal(false);
      setNewUserEmail(null);
      
      Alert.alert(
        'Welcome!',
        'Thanks for joining! Start exploring and booking your dream apartment now.',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.replace('Main');
            },
          },
        ]
      );
    } catch (error) {
      logger.error('Error claiming welcome deal:', error);
      Alert.alert('Error', 'Failed to claim deal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseDeal = async () => {
    if (!newUserEmail) return;
    
    // Mark deal as seen (but not claimed)
    await markWelcomeDealSeen(newUserEmail, false);
    
    // Ensure wallet is initialized to 0 for users who don't claim the deal
    // This guarantees each user starts with zero balance if they don't claim
    try {
      const { updateWalletBalance } = await import('../utils/wallet');
      await updateWalletBalance(newUserEmail, 0);
      logger.log(`✅ Wallet initialized to ₦0 for user: ${newUserEmail}`);
    } catch (walletError) {
      logger.error('Error initializing wallet to zero:', walletError);
      // Continue even if wallet initialization fails - getWalletBalance will return 0 anyway
    }
    
    setShowWelcomeDeal(false);
    setNewUserEmail(null);
    
    // Show success message and navigate
    Alert.alert('Success', 'Account created successfully!', [
      {
        text: 'OK',
        onPress: () => {
          navigation.replace('Main');
        },
      },
    ]);
  };

  React.useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      const handleGoogleAuth = async () => {
        try {
          const accessToken = authentication?.accessToken;
          if (!accessToken) {
            Alert.alert('Error', 'Google sign up failed. Please try again.');
            return;
          }

          // Firebase authenticates Google; the API creates or loads the Apartify account.
          const result = await signInWithGoogle(accessToken);
          const userData = result.user;

          await signIn(userData, result.isNewUser);
          
          // IMMEDIATELY initialize wallet to ₦0 for new Google user
          // This ensures every new user starts with zero balance
          if (userData.email) {
            try {
              const { updateWalletBalance } = await import('../utils/wallet');
              await updateWalletBalance(userData.email, 0);
              logger.log(`✅ Wallet initialized to ₦0 for new Google user: ${userData.email}`);
            } catch (walletInitError) {
              logger.error('Error initializing wallet to zero:', walletInitError);
              // Continue even if wallet initialization fails
            }
            
            // Navigate to home page - welcome deal modal will appear there
            // The modal will show on the home page (ExploreScreen) for new users
          }
          
          navigation.replace('Main');
        } catch (error) {
          if (error.message === 'GOOGLE_EMAIL_MISSING') {
            Alert.alert('Email Required', 'We could not retrieve your email from Google. Please sign up with your email and password.');
          } else {
            Alert.alert('Error', 'Failed to sign up with Google. Please try again.');
          }
        }
      };
      handleGoogleAuth();
    }
  }, [response]);

  const handleEmailSignUp = async () => {
    // Clear previous error
    setErrorMessage('');
    
    // Basic validation - only check what's essential for new account registration
    // Since this is a new account, we just need to ensure data is provided and valid
    
    // Check if required fields are filled
    if (!name || !email || !password) {
      setErrorMessage('Please fill in all fields');
      return;
    }
    
    // Check if name has content (after trimming whitespace)
    if (!name.trim()) {
      setErrorMessage('Please enter your name');
      return;
    }
    
    // Check if email is in valid format (needed for account creation)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage('Please enter a valid email address');
      return;
    }
    
    // Check if password is provided (minimum length for security)
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }
    
    setLoading(true);
    try {
      // Step 1: Register user with backend - this saves user information to database
      const response = await authService.register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password,
      });
      
      // Step 2: Validate registration response
      // User information should now be saved on the backend
      if (!response) {
        setErrorMessage('Registration failed. Please try again.');
        setLoading(false);
        return;
      }

      // Step 3: Check if user data was returned and saved
      if (!response.user) {
        setErrorMessage('Registration failed. User data not received.');
        setLoading(false);
        return;
      }

      // Step 4: Verify essential user information is present
      if (!response.user.email || !response.user.id) {
        setErrorMessage('Registration incomplete. Please try again.');
        setLoading(false);
        return;
      }

      // Step 5: User information is now saved on backend
      // Use the user object from the response (already saved to backend database)
      const userToSignIn = response.user;
      
      // Ensure all required fields are present
      if (!userToSignIn.email) {
        userToSignIn.email = email.trim().toLowerCase();
      }
      if (!userToSignIn.name) {
        userToSignIn.name = name.trim();
      }
      if (!userToSignIn.id) {
        userToSignIn.id = userToSignIn.email;
      }
      
      console.log('✅ User registered and saved to backend:', {
        id: userToSignIn.id,
        email: userToSignIn.email,
        name: userToSignIn.name
      });
      
      // Step 6: Sign in the user locally with saved information
      // Pass isNewUser=true to indicate this is a sign-up, not a sign-in
      await signIn(userToSignIn, true);
      
      // Step 7: Initialize wallet for new user
      try {
        const { updateWalletBalance } = await import('../utils/wallet');
        await updateWalletBalance(userToSignIn.email, 0);
        console.log(`✅ Wallet initialized to ₦0 for new user: ${userToSignIn.email}`);
      } catch (walletInitError) {
        console.error('Error initializing wallet:', walletInitError);
        // Continue even if wallet initialization fails
      }
      
      // Step 8: Clear form and navigate
      setName('');
      setEmail('');
      setPassword('');
      
      // Navigate to home page - welcome deal modal will appear there for new users
      navigation.replace('Main');
    } catch (error) {
      // Handle API errors - extract message from error object
      const errorMsg = error.message || error.toString() || '';
      const lowerErrorMsg = errorMsg.toLowerCase();
      
      // Check for account already exists scenarios - check this FIRST
      if (lowerErrorMsg.includes('409') || 
          lowerErrorMsg.includes('already exists') || 
          lowerErrorMsg.includes('already exist') ||
          lowerErrorMsg.includes('duplicate') || 
          lowerErrorMsg.includes('email already') ||
          lowerErrorMsg.includes('user already') ||
          lowerErrorMsg.includes('account already') ||
          lowerErrorMsg.includes('email is already') ||
          lowerErrorMsg.includes('email has been') ||
          (error.status === 409)) {
        setErrorMessage('Account already exists. Please sign in instead.');
      } 
      // Check for role errors - handle separately
      else if (lowerErrorMsg.includes('role') && (lowerErrorMsg.includes('invalid') || lowerErrorMsg.includes('blank') || lowerErrorMsg.includes('required') || lowerErrorMsg.includes('must') || lowerErrorMsg.includes('allowed'))) {
        // This shouldn't happen since we send default role 'Guest', but handle it just in case
        setErrorMessage('Registration error. Please try again or contact support.');
      }
      // Check for password strength/validation errors - check this SECOND
      else if (lowerErrorMsg.includes('password') || 
               lowerErrorMsg.includes('weak') ||
               lowerErrorMsg.includes('strength') ||
               lowerErrorMsg.includes('too short') ||
               lowerErrorMsg.includes('too long') ||
               lowerErrorMsg.includes('must contain') ||
               lowerErrorMsg.includes('at least') ||
               lowerErrorMsg.includes('minimum') ||
               (lowerErrorMsg.includes('required') && lowerErrorMsg.includes('password'))) {
        // Extract and show the password error message from backend
        let passwordErrorMsg = errorMsg;
        
        // Clean up the error message
        passwordErrorMsg = passwordErrorMsg
          .replace(/^Error:\s*/i, '')
          .replace(/^Authentication failed\s*\(\d+\)/i, '')
          .trim();
        
        // If the error message is meaningful, use it; otherwise provide a helpful default
        if (passwordErrorMsg.length > 0 && !passwordErrorMsg.includes('Error:')) {
          setErrorMessage(passwordErrorMsg);
        } else {
          setErrorMessage('Password does not meet requirements. Please use a stronger password.');
        }
      } 
      // Check for email validation errors
      else if (lowerErrorMsg.includes('email') && (lowerErrorMsg.includes('invalid') || lowerErrorMsg.includes('format'))) {
        setErrorMessage('Please enter a valid email address.');
      }
      // Check for general validation errors
      else if (lowerErrorMsg.includes('400') || lowerErrorMsg.includes('validation') ||
               lowerErrorMsg.includes('invalid')) {
        // Only show generic validation error if it's not an account exists or password error
        if (!lowerErrorMsg.includes('already') && !lowerErrorMsg.includes('exist') && !lowerErrorMsg.includes('duplicate') &&
            !lowerErrorMsg.includes('password')) {
          // Try to extract the actual error message from backend
          let validationErrorMsg = errorMsg
            .replace(/^Error:\s*/i, '')
            .replace(/^Authentication failed\s*\(\d+\)/i, '')
            .trim();
          
          if (validationErrorMsg.length > 0 && !validationErrorMsg.includes('Error:')) {
            setErrorMessage(validationErrorMsg);
          } else {
            setErrorMessage('Please check your information and try again.');
          }
        } else if (lowerErrorMsg.includes('already') || lowerErrorMsg.includes('exist') || lowerErrorMsg.includes('duplicate')) {
          setErrorMessage('Account already exists. Please sign in instead.');
        }
      } 
      // Check for network errors - account creation requires backend connection
      else if (lowerErrorMsg.includes('network') || lowerErrorMsg.includes('failed to fetch') ||
               lowerErrorMsg.includes('connection') || lowerErrorMsg.includes('timeout') ||
               error.status === 0 || errorMsg.includes('No internet')) {
        let networkMsg = 'Network error. Please check your connection and try again. Account creation requires a server connection.';
        
        // Add emulator-specific help
        if (Platform.OS === 'android') {
          networkMsg += ' If using an emulator, ensure it has network access in Android Studio settings.';
        }
        
        setErrorMessage(networkMsg);
      }
      // Timeout errors
      else if (error.status === 408 || lowerErrorMsg.includes('timeout') || lowerErrorMsg.includes('taking too long')) {
        setErrorMessage('Request timeout. The server is taking too long to respond. Please check your connection and try again.');
      } 
      // For all other errors, show the backend error message if available
      else {
        // Check if backend error message indicates account exists
        if (lowerErrorMsg.includes('already') || lowerErrorMsg.includes('exist') || lowerErrorMsg.includes('duplicate')) {
          setErrorMessage('Account already exists. Please sign in instead.');
        } else {
          // Show backend error message if available and meaningful
          let displayMsg = 'Failed to create account. Please try again.';
          
          if (errorMsg && errorMsg.length > 0) {
            // Clean up error message
            const cleanMsg = errorMsg
              .replace(/^Error:\s*/i, '')
              .replace(/^Authentication failed\s*\(\d+\)/i, '')
              .trim();
            
            if (cleanMsg.length > 0 && cleanMsg !== errorMsg && !cleanMsg.includes('Error:')) {
              displayMsg = cleanMsg;
            } else if (cleanMsg.length > 0 && !errorMsg.includes('Error:')) {
              displayMsg = cleanMsg;
            }
          }
          
          setErrorMessage(displayMsg);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      await promptAsync();
    } catch (error) {
      Alert.alert('Error', 'Google sign up failed. Please try again.');
    }
  };

  const handleAppleSignUp = async () => {
    if (!AppleAuthentication) {
      Alert.alert('Error', 'Apple authentication is only available on iOS');
      return;
    }
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      
      // Use authService to handle backend login/registration
      const response = await authService.loginWithApple(credential);
      
      // Sign in locally with the response from backend
      await signIn(response.user || response, response.isNewUser);
      
      navigation.replace('Main');
    } catch (error) {
      if (error.code === 'ERR_CANCELED') {
        // User canceled, do nothing
      } else if (error.message === 'APPLE_EMAIL_MISSING') {
         Alert.alert('Email Required', 'We could not retrieve your email from Apple. Please share your email when prompted by Apple, or sign up with email and password.');
      } else {
        Alert.alert('Error', error.message || 'Apple sign up failed. Please try again.');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>Sign Up</Text>
          <Text style={styles.subtitle}>Create your account</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, errorMessage && styles.inputError]}
              placeholder="Full Name"
              placeholderTextColor="#999"
              value={name}
              onChangeText={(text) => {
                setName(text);
                setErrorMessage(''); // Clear error when user types
              }}
              autoCapitalize="words"
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              style={[styles.input, errorMessage && styles.inputError]}
              placeholder="Email"
              placeholderTextColor="#999"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setErrorMessage(''); // Clear error when user types
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.passwordContainer}>
              <TextInput
                style={[styles.input, styles.passwordInput, errorMessage && styles.inputError]}
                placeholder="Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setErrorMessage(''); // Clear error when user types
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={showPassword ? 'visibility' : 'visibility-off'}
                  size={24}
                  color="#999"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Error Message */}
          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.signUpButton, loading && styles.signUpButtonDisabled]}
            onPress={handleEmailSignUp}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Text style={styles.signUpButtonText}>
              {loading ? 'Creating Account...' : 'Sign Up'}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Sign In disabled until real OAuth credentials are configured */}
          {isGoogleConfigured && (
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignUp}
              activeOpacity={0.8}
              disabled={!request}
            >
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.appleButton}
            onPress={handleAppleSignUp}
            activeOpacity={0.8}
            disabled={Platform.OS !== 'ios'}
          >
            <Text style={styles.appleButtonText}>Continue with Apple</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>

        {/* Welcome Deal Modal is now shown on the home page (ExploreScreen) */}
      </KeyboardAvoidingView>
    );
  }

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  passwordContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    paddingRight: 50,
  },
  eyeIcon: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  signUpButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  signUpButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 15,
    color: '#999',
    fontSize: 14,
  },
  googleButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 12,
  },
  googleButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  appleButton: {
    backgroundColor: '#000000',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
    opacity: Platform.OS === 'ios' ? 1 : 0.5,
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  footerLink: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    marginTop: 8,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  errorText: {
    color: '#F44336',
    fontSize: 14,
    textAlign: 'center',
  },
  inputError: {
    borderColor: '#F44336',
    borderWidth: 1,
  },
  signUpButtonDisabled: {
    opacity: 0.6,
  },
});

