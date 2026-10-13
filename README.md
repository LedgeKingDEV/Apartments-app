# Nigerian Apartments Leasing App

A React Native mobile app for apartment leasing in Nigeria, styled with white and yellow colors.

## Features

- **Home Page**: Entry point with "Come In" button
- **Authentication**: Sign In and Sign Up with Google and Apple authentication
- **Explore**: Browse apartment listings across Nigeria
- **Favorites**: Save and manage favorite apartments
- **Wallet**: Manage payments, withdrawals, and bank account binding
- **KYC Verification**: Multi-tier identity verification for AML compliance (Unverified → Pending → Basic → Verified)
- **Apartment Details**: View detailed information about apartments
- **Profile**: User profile and settings

## KYC / AML Compliance

Multi-tier identity verification to comply with Anti-Money Laundering regulations. Withdrawals are disabled until the user reaches **Basic** tier or higher.

### Verification Tiers

| Tier | Capabilities |
|------|-------------|
| **Unverified** | Browse listings, make bookings. No wallet withdrawals. |
| **Pending** | Documents submitted, awaiting admin review. |
| **Basic** | Can bind a bank account and withdraw funds. |
| **Fully Verified** | Full access to all features. |

### User Flow

1. User submits identity document type and number via the app (`/api/kyc/submit`)
2. Submission enters **Pending** state, visible in the admin compliance dashboard
3. Admin reviews and **approves** (setting tier to Basic or Verified) or **rejects** with a reason
4. On approval, user can bind a bank account (verified against Flutterwave) for withdrawals
5. All KYC decisions are audit-logged with the admin actor's identity

### Admin Endpoints (`/api/admin/compliance`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/kyc/pending` | List submissions awaiting review |
| GET | `/kyc` | List all submissions (excluding unverified) |
| PUT | `/kyc/{userId}/approve` | Approve KYC (set tier, optionally bind bank) |
| PUT | `/kyc/{userId}/reject` | Reject KYC with a reason |
| PATCH | `/wallets/{userId}/status` | Freeze/unfreeze a wallet |
| GET | `/flags` | List AML compliance flags |
| PATCH | `/flags/{id}/resolve` | Resolve a compliance flag |

### AML Compliance Flags

Automatic flags are raised for suspicious activity:

- `WITHDRAWAL_TO_UNBOUND_ACCOUNT` — withdrawal to an account not bound via KYC
- `BANK_BINDING_MISMATCH` — bank details don't match the verified provider record
- `DEPOSIT_LIMIT_EXCEEDED` / `WITHDRAWAL_LIMIT_EXCEEDED` — transaction thresholds breached
- `WITHDRAWAL_VELOCITY_EXCEEDED` — too many withdrawals in a short period
- `RECENT_DEPOSIT_WITHDRAWAL` — funds withdrawn shortly after deposit
- `LARGE_TRANSACTION` — unusually large transaction detected
- `KYC_REJECTED` / `KYC_APPROVED` — audit trail for verification decisions

Flags are graded by severity (Low → Medium → High → Critical) and can be resolved by admins.

### Key Files

- `apps/api/.../service/KycService.java` — core KYC logic
- `apps/api/.../controller/KycController.java` — user-facing endpoints
- `apps/api/.../controller/AdminComplianceController.java` — admin review & AML
- `apps/api/.../entity/ComplianceFlag.java` — compliance flag entity
- `apps/mobile/src/services/kycService.js` — mobile client KYC service
- `apps/mobile/src/screens/WalletScreen.js` — KYC banner & gate for withdrawals

## Getting Started

### Firebase setup

Firebase Google sign-in and Firestore profile setup instructions are in [docs/firebase/FIREBASE_SETUP.md](docs/firebase/FIREBASE_SETUP.md). PostgreSQL remains the database for Apartify business records.

### Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Expo CLI
- iOS Simulator (for Mac) or Android Emulator / physical device

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the Expo development server:
```bash
npm start
```

3. Run on iOS:
```bash
npm run ios
```

4. Run on Android:
```bash
npm run android
```

## Development Build

This app uses a **development build** to enable native features like push notifications and image picker that don't work in Expo Go.

### Prerequisites for Development Build

**For Android:**
- Android Studio installed
- Android SDK configured
- Java Development Kit (JDK) installed
- Physical Android device or emulator

**For iOS (macOS only):**
- Xcode installed (latest version recommended)
- CocoaPods installed (`sudo gem install cocoapods`)
- Physical iOS device or simulator

### Building a Development Build

#### First Time Setup

1. Install dependencies (including expo-dev-client):
```bash
npm install
```

2. Prebuild native code (generates android/ and ios/ folders):
```bash
npm run prebuild
```

#### Building for Android

1. Connect an Android device or start an emulator

2. Build and run the development build:
```bash
npm run android:dev
```

Or use the standard command:
```bash
npm run android
```

#### Building for iOS (macOS only)

1. Install CocoaPods dependencies:
```bash
cd ios && pod install && cd ..
```

2. Build and run the development build:
```bash
npm run ios:dev
```

Or use the standard command:
```bash
npm run ios
```

### Running with Development Build

After building and installing the development build on your device/emulator:

1. Start the development server:
```bash
npm run start:dev
```

2. Open the development build app on your device
3. The app will automatically connect to the development server
4. You can now use all native features including:
   - Push notifications (expo-notifications)
   - Image picker (expo-image-picker)
   - All other native modules

### Troubleshooting

**Android Build Issues:**
- Ensure Android Studio is installed and Android SDK is configured
- Check that `ANDROID_HOME` environment variable is set
- Try cleaning the build: `cd android && ./gradlew clean && cd ..`
- Rebuild: `npm run prebuild:clean` then `npm run android:dev`

**iOS Build Issues:**
- Ensure Xcode is up to date
- Run `cd ios && pod install && cd ..` to update CocoaPods dependencies
- Clean build folder in Xcode: Product → Clean Build Folder
- Rebuild: `npm run prebuild:clean` then `npm run ios:dev`

**Connection Issues:**
- Make sure your device and computer are on the same network
- Check that the development server is running
- Try restarting the development server with `npm run start:dev`

## Configuration

### Google Authentication Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable Google Sign-In API
4. Create OAuth 2.0 credentials
5. Update the client IDs in:
   - `src/screens/SignInScreen.js`
   - `src/screens/SignUpScreen.js`

Replace:
- `YOUR_IOS_CLIENT_ID`
- `YOUR_ANDROID_CLIENT_ID`
- `YOUR_WEB_CLIENT_ID`

### Apple Authentication Setup

Apple authentication is available on iOS devices only. Make sure you have:
- An Apple Developer account
- Configured the app in Apple Developer Portal
- Set up the necessary certificates

## Expo Go vs Development Build

### Expo Go (Limited Features)
- Quick testing without building
- Some native features don't work (push notifications, image picker)
- Good for initial development and testing basic features

### Development Build (Full Features)
- All native features work
- Push notifications enabled
- Image picker enabled
- Requires building the app locally or with EAS Build
- Recommended for full feature testing

**Note:** This app requires a development build to use all features. Use `npm run android:dev` or `npm run ios:dev` to build and run.

## Tech Stack

- **Expo SDK** ~54.0.0
- **React Native** 0.81.5
- **React Navigation** v6
- **Expo Dev Client** for development builds
- **AsyncStorage** for local storage
- **Expo AuthSession** for authentication
- **Expo Notifications** for push notifications
- **Expo Image Picker** for image selection

## Color Scheme

- Primary: Yellow (#FFD700)
- Background: White (#FFFFFF)
- Text: Dark gray/black (#333)
- No gradients - solid colors only

## Project Structure

```
├── App.js                    # Main app entry point
├── apps/
│   ├── api/                  # Spring Boot backend
│   │   └── src/main/java/com/example/booking/
│   │       ├── controller/
│   │       │   ├── KycController.java
│   │       │   ├── AdminComplianceController.java
│   │       │   └── WalletController.java
│   │       ├── service/
│   │       │   ├── KycService.java
│   │       │   └── ComplianceService.java
│   │       ├── entity/
│   │       │   ├── User.java          # KYC fields (level, document, timestamps)
│   │       │   ├── ComplianceFlag.java
│   │       │   └── Wallet.java
│   │       └── dto/kyc/
│   │           ├── KycSubmitRequest.java
│   │           ├── KycStatusResponse.java
│   │           ├── KycAdminResponse.java
│   │           ├── KycDecisionRequest.java
│   │           └── BindBankRequest.java
│   ├── mobile/               # React Native (Expo) app
│   │   └── src/
│   │       ├── api/api.js              # API endpoint constants
│   │       ├── services/kycService.js  # KYC client service
│   │       └── screens/
│   │           ├── WalletScreen.js      # KYC banner + withdrawal gate
│   │           └── ...
│   └── dashboard/            # Admin dashboard (React + Vite)
├── assets/                   # App assets
```

## Notes

- Placeholder apartment images are loaded from Unsplash
- Favorites are stored locally using AsyncStorage
- Authentication state is managed via React Context
- The app uses Nigerian Naira (₦) for pricing

## License

This project is created for educational purposes.



