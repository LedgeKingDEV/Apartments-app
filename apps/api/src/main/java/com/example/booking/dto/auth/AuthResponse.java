package com.example.booking.dto.auth;

import io.swagger.v3.oas.annotations.media.Schema;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Value;

@Value
@Builder
@Schema(description = "Authentication response containing JWT token and user information")
public class AuthResponse {
    @Schema(description = "JWT authentication token", example = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...")
    String token;
    
    @Schema(description = "User ID", example = "1")
    Long userId;
    
    @Schema(description = "User's email address", example = "john.doe@example.com")
    String email;
    
    @Schema(description = "User role (GUEST or HOST)", example = "GUEST", allowableValues = {"GUEST", "HOST", "ADMIN"})
    String role;

    @Builder.Default
    boolean isNewUser = false;

    @JsonProperty("isNewUser")
    public boolean isNewUser() {
        return isNewUser;
    }
}
