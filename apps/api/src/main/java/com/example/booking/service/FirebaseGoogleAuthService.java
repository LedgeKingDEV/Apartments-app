package com.example.booking.service;

import com.example.booking.dto.auth.AuthResponse;
import com.example.booking.dto.auth.RegisterRequest;
import com.example.booking.entity.User;
import com.example.booking.exception.BadRequestException;
import com.example.booking.repository.UserRepository;
import com.example.booking.security.JwtService;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.FirebaseToken;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class FirebaseGoogleAuthService {
    private final ObjectProvider<FirebaseAuth> firebaseAuthProvider;
    private final UserRepository userRepository;
    private final UserService userService;
    private final JwtService jwtService;

    public FirebaseGoogleAuthService(ObjectProvider<FirebaseAuth> firebaseAuthProvider,
                                     UserRepository userRepository,
                                     UserService userService,
                                     JwtService jwtService) {
        this.firebaseAuthProvider = firebaseAuthProvider;
        this.userRepository = userRepository;
        this.userService = userService;
        this.jwtService = jwtService;
    }

    public AuthResponse signInWithGoogle(String idToken) {
        FirebaseAuth firebaseAuth = firebaseAuthProvider.getIfAvailable();
        if (firebaseAuth == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Firebase sign-in is not configured on the API.");
        }

        final FirebaseToken verifiedToken;
        try {
            verifiedToken = firebaseAuth.verifyIdToken(idToken);
        } catch (FirebaseAuthException | IllegalArgumentException ex) {
            throw new BadRequestException("The Firebase sign-in token is invalid or expired.");
        }

        Map<String, Object> claims = verifiedToken.getClaims();
        Object firebaseClaim = claims.get("firebase");
        if (!(firebaseClaim instanceof Map<?, ?> firebaseDetails)
                || !"google.com".equals(firebaseDetails.get("sign_in_provider"))) {
            throw new BadRequestException("Please sign in with Google.");
        }
        if (!Boolean.TRUE.equals(claims.get("email_verified"))) {
            throw new BadRequestException("A verified Google email address is required.");
        }

        String email = verifiedToken.getEmail();
        if (email == null || email.isBlank()) {
            throw new BadRequestException("Google did not provide an email address.");
        }
        String normalizedEmail = email.trim().toLowerCase(Locale.ROOT);

        User user = userRepository.findByEmail(normalizedEmail).orElse(null);
        boolean isNewUser = false;
        if (user == null) {
            String name = stringClaim(claims.get("name"));
            if (name == null || name.isBlank()) name = normalizedEmail.substring(0, normalizedEmail.indexOf('@'));

            RegisterRequest request = new RegisterRequest();
            request.setName(name);
            request.setEmail(normalizedEmail);
            request.setPassword(UUID.randomUUID() + UUID.randomUUID().toString());
            request.setRole(User.Role.HOST.name());
            try {
                user = userService.registerUser(request);
                isNewUser = true;
            } catch (BadRequestException raceOrConflict) {
                user = userRepository.findByEmail(normalizedEmail).orElseThrow(() -> raceOrConflict);
            }
        }

        return AuthResponse.builder()
                .token(jwtService.generateToken(user))
                .userId(user.getId())
                .email(user.getEmail())
                .role(user.getRole().name())
                .isNewUser(isNewUser)
                .build();
    }

    private String stringClaim(Object value) {
        return value instanceof String ? (String) value : null;
    }
}
