package com.example.booking.controller;

import com.example.booking.dto.auth.AuthResponse;
import com.example.booking.dto.auth.ForgotPasswordRequest;
import com.example.booking.dto.auth.FirebaseSignInRequest;
import com.example.booking.dto.auth.LoginRequest;
import com.example.booking.dto.auth.PasswordResetResponse;
import com.example.booking.dto.auth.RegisterRequest;
import com.example.booking.dto.auth.ResetPasswordRequest;
import com.example.booking.security.BookingUserDetails;
import com.example.booking.security.JwtService;
import com.example.booking.service.AuthService;
import com.example.booking.service.FirebaseGoogleAuthService;
import com.example.booking.service.PasswordResetService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "User authentication and registration endpoints")
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResetService;
    private final JwtService jwtService;
    private final FirebaseGoogleAuthService firebaseGoogleAuthService;

    public AuthController(AuthService authService, PasswordResetService passwordResetService, JwtService jwtService,
                          FirebaseGoogleAuthService firebaseGoogleAuthService) {
        this.authService = authService;
        this.passwordResetService = passwordResetService;
        this.jwtService = jwtService;
        this.firebaseGoogleAuthService = firebaseGoogleAuthService;
    }

    @Operation(summary = "Register a new user", 
            description = "Creates a new user account and returns authentication token. " +
                    "Allowed roles: GUEST (can book listings) or HOST (can create and manage listings).")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "User registered successfully",
                    content = @Content(schema = @Schema(implementation = AuthResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid input or email already exists")
    })
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.ok(authService.register(request));
    }

    @Operation(summary = "Login user", description = "Authenticates user and returns JWT token")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Login successful",
                    content = @Content(schema = @Schema(implementation = AuthResponse.class))),
            @ApiResponse(responseCode = "401", description = "Invalid credentials")
    })
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @Operation(summary = "Sign in with Google through Firebase")
    @PostMapping("/firebase")
    public ResponseEntity<AuthResponse> signInWithFirebase(@Valid @RequestBody FirebaseSignInRequest request) {
        return ResponseEntity.ok(firebaseGoogleAuthService.signInWithGoogle(request.getIdToken()));
    }

    @Operation(summary = "Request password reset", 
            description = "Sends a password reset email to the user. Returns the same response regardless of whether the email exists (security best practice).")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "If the email exists, a reset link has been sent. Check your email.",
                    content = @Content(schema = @Schema(implementation = PasswordResetResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid email format or rate limit exceeded")
    })
    @PostMapping("/forgot-password")
    public ResponseEntity<PasswordResetResponse> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        try {
            passwordResetService.requestPasswordReset(request.getEmail());
            return ResponseEntity.ok(PasswordResetResponse.builder()
                    .success(true)
                    .message("If an account with that email exists, a password reset link has been sent. Please check your email.")
                    .build());
        } catch (com.example.booking.exception.BadRequestException e) {
            // Rate limit exceeded or validation error - return 400
            return ResponseEntity.badRequest().body(PasswordResetResponse.builder()
                    .success(false)
                    .message(e.getMessage())
                    .build());
        } catch (Exception e) {
            // Log the error but still return success (security best practice)
            // This prevents revealing whether the email exists
            org.slf4j.LoggerFactory.getLogger(AuthController.class)
                    .error("Error in forgot-password endpoint: {}", e.getMessage(), e);
            return ResponseEntity.ok(PasswordResetResponse.builder()
                    .success(true)
                    .message("If an account with that email exists, a password reset link has been sent. Please check your email.")
                    .build());
        }
    }

    @Operation(summary = "Validate reset token", 
            description = "Validates if a password reset token is valid and not expired.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Token validation result"),
            @ApiResponse(responseCode = "400", description = "Invalid token format")
    })
    @GetMapping("/validate-reset-token")
    public ResponseEntity<PasswordResetResponse> validateResetToken(@RequestParam String token) {
        boolean isValid = passwordResetService.validateToken(token);
        return ResponseEntity.ok(PasswordResetResponse.builder()
                .success(isValid)
                .message(isValid ? "Token is valid" : "Token is invalid or expired")
                .build());
    }

    @Operation(summary = "Reset password", 
            description = "Resets the user's password using a valid reset token.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Password reset successfully",
                    content = @Content(schema = @Schema(implementation = PasswordResetResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid token, expired token, or weak password")
    })
    @PostMapping("/reset-password")
    public ResponseEntity<PasswordResetResponse> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordResetService.resetPassword(request.getToken(), request.getNewPassword());
        return ResponseEntity.ok(PasswordResetResponse.builder()
                .success(true)
                .message("Password has been reset successfully. Please log in with your new password.")
                .build());
    }

    @Operation(summary = "Refresh authentication token", 
            description = "Refreshes the JWT token for the authenticated user. Returns a new token if the current token is valid.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Token refreshed successfully",
                    content = @Content(schema = @Schema(implementation = AuthResponse.class))),
            @ApiResponse(responseCode = "401", description = "Invalid or expired token")
    })
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refreshToken(
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        if (userDetails == null || userDetails.getUser() == null) {
            return ResponseEntity.status(401).build();
        }
        
        // Generate a new token for the user
        String newToken = jwtService.generateToken(userDetails.getUser());
        return ResponseEntity.ok(AuthResponse.builder()
                .token(newToken)
                .userId(userDetails.getUser().getId())
                .email(userDetails.getUser().getEmail())
                .role(userDetails.getUser().getRole().name())
                .build());
    }

    @Operation(summary = "Get current user", 
            description = "Returns the currently authenticated user's information.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "User information retrieved successfully",
                    content = @Content(schema = @Schema(implementation = AuthResponse.class))),
            @ApiResponse(responseCode = "401", description = "Unauthorized - authentication required")
    })
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/me")
    public ResponseEntity<AuthResponse> getCurrentUser(
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        if (userDetails == null || userDetails.getUser() == null) {
            return ResponseEntity.status(401).build();
        }
        
        com.example.booking.entity.User user = userDetails.getUser();
        return ResponseEntity.ok(AuthResponse.builder()
                .userId(user.getId())
                .email(user.getEmail())
                .role(user.getRole().name())
                .build());
    }
}
