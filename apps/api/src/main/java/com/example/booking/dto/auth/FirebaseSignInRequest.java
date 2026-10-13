package com.example.booking.dto.auth;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class FirebaseSignInRequest {
    @NotBlank
    private String idToken;
}
