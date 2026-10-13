package com.example.booking.config;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;

@Configuration
@ConditionalOnExpression("!'${FIREBASE_PROJECT_ID:}'.isEmpty()")
public class FirebaseAdminConfig {

    @Bean
    FirebaseApp apartifyFirebaseApp(
            @Value("${FIREBASE_PROJECT_ID}") String projectId,
            @Value("${FIREBASE_SERVICE_ACCOUNT_JSON:}") String serviceAccountJson) throws IOException {
        var credential = serviceAccountJson.isBlank()
                ? GoogleCredentials.getApplicationDefault()
                : GoogleCredentials.fromStream(new ByteArrayInputStream(
                        serviceAccountJson.getBytes(StandardCharsets.UTF_8)));
        FirebaseOptions options = FirebaseOptions.builder()
                .setCredentials(credential)
                .setProjectId(projectId)
                .build();
        return FirebaseApp.initializeApp(options, "apartify");
    }

    @Bean
    FirebaseAuth apartifyFirebaseAuth(FirebaseApp apartifyFirebaseApp) {
        return FirebaseAuth.getInstance(apartifyFirebaseApp);
    }
}
