# CORS Configuration Guide

## Problem
When running the app on web (localhost:8081), you may see CORS errors like:
```
Access to fetch at 'https://booking-backend-staging.up.railway.app/api/...' from origin 'http://localhost:8081' has been blocked by CORS policy
```

## Solution
The backend API needs to be configured to allow requests from the frontend origin.

### Backend Configuration (Required)

The backend at `https://booking-backend-staging.up.railway.app` needs to allow CORS from:
- `http://localhost:8081` (development)
- `http://localhost:3000` (alternative dev port)
- Your production domain (when deployed)

### Example Backend CORS Configuration

#### For Spring Boot (Java):
```java
@Configuration
public class CorsConfig {
    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                    .allowedOrigins(
                        "http://localhost:8081",
                        "http://localhost:3000",
                        "https://your-production-domain.com"
                    )
                    .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                    .allowedHeaders("*")
                    .allowCredentials(true)
                    .maxAge(3600);
            }
        };
    }
}
```

#### For Express.js (Node.js):
```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'http://localhost:8081',
'http://localhost:3000',
    'https://your-production-domain.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### Quick Fix for Development

If you can't modify the backend immediately, you can:

1. **Use a CORS proxy** (development only):
   - Install a browser extension like "CORS Unblock" (not recommended for production)
   - Or use a local proxy server

2. **Test on mobile devices**:
   - CORS only affects web browsers
   - iOS and Android apps don't have CORS restrictions
   - Use Expo Go or development build on physical devices

3. **Deploy to production**:
   - Once deployed, configure backend CORS for your production domain
   - Production domains typically have CORS configured

### Current Status

The app will:
- ✅ Work on iOS devices (no CORS restrictions)
- ✅ Work on Android devices (no CORS restrictions)
- ❌ Have CORS issues on web (localhost) until backend is configured

### Next Steps

1. Contact backend team to add CORS configuration
2. Provide them with this file and the allowed origins
3. Once configured, web development will work without errors


