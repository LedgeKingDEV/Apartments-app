package com.example.booking.controller;

import com.example.booking.dto.admin.*;
import com.example.booking.entity.AdminUser;
import com.example.booking.exception.BadRequestException;
import com.example.booking.repository.AdminUserRepository;
import com.example.booking.security.AdminUserDetails;
import com.example.booking.security.BookingUserDetails;
import com.example.booking.security.JwtService;
import com.example.booking.service.AdminUserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/api/admin/auth")
@Tag(name = "Admin Auth", description = "Admin authentication endpoints")
public class AdminAuthController {

    private final AdminUserService adminUserService;
    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    @Value("${admin.allowed-email-domain:apartify.com}")
    private String allowedEmailDomain;

    @Value("${admin.bootstrap.token:}")
    private String bootstrapToken;

    public AdminAuthController(AdminUserService adminUserService,
                               AdminUserRepository adminUserRepository,
                               PasswordEncoder passwordEncoder,
                               JwtService jwtService) {
        this.adminUserService = adminUserService;
        this.adminUserRepository = adminUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Operation(summary = "Admin login")
    @PostMapping("/login")
    public ResponseEntity<AdminAuthResponse> login(@Valid @RequestBody AdminLoginRequest request) {
        return ResponseEntity.ok(adminUserService.login(request));
    }

    @Operation(summary = "Create new admin (requires existing admin)")
    @PostMapping("/register")
    public ResponseEntity<AdminAuthResponse> register(
            @Valid @RequestBody AdminRegisterRequest request,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        String creatorEmail = userDetails != null ? userDetails.getUsername() : "system";
        return ResponseEntity.ok(adminUserService.register(request, creatorEmail));
    }

    @Operation(summary = "Bootstrap first super admin (only works when no admins exist)")
    @PostMapping("/bootstrap")
    public ResponseEntity<AdminAuthResponse> bootstrap(
            @Valid @RequestBody AdminRegisterRequest request,
            @RequestHeader(name = "X-Admin-Bootstrap-Token", required = false) String suppliedToken) {
        if (bootstrapToken == null || bootstrapToken.isBlank() || suppliedToken == null
                || !MessageDigest.isEqual(bootstrapToken.getBytes(StandardCharsets.UTF_8),
                suppliedToken.getBytes(StandardCharsets.UTF_8))) {
            throw new BadRequestException("Admin bootstrap is disabled or the bootstrap token is invalid.");
        }
        if (adminUserRepository.count() > 0) {
            throw new BadRequestException("Admin accounts already exist. Use /api/admin/auth/register instead.");
        }

        String email = request.getEmail();
        if (email == null || !email.toLowerCase(java.util.Locale.ROOT)
                .endsWith("@" + allowedEmailDomain.toLowerCase(java.util.Locale.ROOT))) {
            throw new BadRequestException("Bootstrap email must be a @" + allowedEmailDomain + " address.");
        }

        AdminUser admin = AdminUser.builder()
                .name(request.getName())
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .phone(request.getPhone())
                .department(request.getDepartment())
                .status(AdminUser.Status.ACTIVE)
                .build();

        admin = adminUserRepository.save(admin);

        String token = jwtService.generateAdminToken(admin);

        return ResponseEntity.ok(AdminAuthResponse.builder()
                .token(token)
                .adminId(admin.getId())
                .email(admin.getEmail())
                .name(admin.getName())
                .role("ADMIN")
                .build());
    }
}
