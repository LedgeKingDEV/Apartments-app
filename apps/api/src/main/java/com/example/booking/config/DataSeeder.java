package com.example.booking.config;

import com.example.booking.entity.AdminUser;
import com.example.booking.entity.User;
import com.example.booking.repository.AdminUserRepository;
import com.example.booking.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final AdminUserRepository adminUserRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.seed-default-data:false}")
    private boolean seedDefaultData;

    public DataSeeder(AdminUserRepository adminUserRepository,
                      UserRepository userRepository,
                      PasswordEncoder passwordEncoder) {
        this.adminUserRepository = adminUserRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(String... args) {
        if (!seedDefaultData) {
            log.info("Skipping default data seeding (app.seed-default-data=false).");
            return;
        }

        adminUserRepository.findByEmail("admin@example.com").ifPresentOrElse(
            admin -> log.info("Default admin account already exists."),
            () -> {
                AdminUser admin = AdminUser.builder()
                        .name("Admin User")
                        .email("admin@example.com")
                        .password(passwordEncoder.encode("admin123"))
                        .department("Management")
                        .permissions("MANAGE_USERS,MANAGE_LISTINGS,VIEW_ANALYTICS")
                        .status(AdminUser.Status.ACTIVE)
                        .build();
                adminUserRepository.save(admin);
                log.info("Created default admin account.");
            }
        );

        seedRegularUser("Test Guest", "test@example.com", "Test@1234", User.Role.GUEST);
        seedRegularUser("Test Host", "host@example.com", "Test@1234", User.Role.HOST);
    }

    private void seedRegularUser(String name, String email, String rawPassword, User.Role role) {
        userRepository.findByEmail(email).ifPresentOrElse(
            user -> log.info("Test user already exists: {}", email),
            () -> {
                User user = User.builder()
                        .name(name)
                        .email(email)
                        .password(passwordEncoder.encode(rawPassword))
                        .role(role)
                        .kycLevel(User.KycLevel.UNVERIFIED)
                        .build();
                userRepository.save(user);
                log.info("Created test user: {}", email);
            }
        );
    }
}
