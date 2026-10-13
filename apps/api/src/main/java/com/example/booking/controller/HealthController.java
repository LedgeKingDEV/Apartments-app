package com.example.booking.controller;

import javax.sql.DataSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Map;
import java.util.TreeMap;

@RestController
@RequestMapping("/api/health")
public class HealthController {

    private final DataSource dataSource;

    public HealthController(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @GetMapping
    public ResponseEntity<Map<String, String>> health() {
        boolean databaseUp = isDatabaseUp();

        Map<String, String> body = new TreeMap<>();
        body.put("status", databaseUp ? "ok" : "degraded");
        body.put("database", databaseUp ? "ok" : "down");

        return ResponseEntity
                .status(databaseUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
                .body(body);
    }

    private boolean isDatabaseUp() {
        try {
            Connection connection = dataSource.getConnection();
            try (connection;
                 Statement statement = connection.createStatement();
                 ResultSet resultSet = statement.executeQuery("SELECT 1")) {
                return resultSet.next();
            }
        } catch (Exception e) {
            return false;
        }
    }
}
