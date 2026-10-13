package com.example.booking.config;

import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;

/**
 * Builds the DataSource so that cloud-platform connection strings (Railway's
 * DATABASE_URL / PG* variables, Render's DATABASE_URL) are honoured.
 *
 * Priority:
 *  1. SPRING_DATASOURCE_URL / SPRING_DATASOURCE_USERNAME / SPRING_DATASOURCE_PASSWORD
 *  2. DATABASE_URL (postgres:// or postgresql://)
 *  3. Individual PG variables: PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE
 *  4. spring.datasource.* properties from the active profile / defaults
 *
 * Pool tuning still comes from the spring.datasource.hikari.* properties so
 * profile overrides and Railway tweaks keep working.
 */
@Configuration
public class DatabaseConfig {

    private static final Logger log = LoggerFactory.getLogger(DatabaseConfig.class);

    private final Environment environment;

    public DatabaseConfig(Environment environment) {
        this.environment = environment;
    }

    @Bean(destroyMethod = "close")
    public DataSource dataSource() {
        JdbcInfo jdbc = resolveJdbcInfo();

        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setJdbcUrl(jdbc.url());
        dataSource.setUsername(jdbc.username());
        dataSource.setPassword(jdbc.password());

        String driver = prop("spring.datasource.driver-class-name", "org.postgresql.Driver");
        dataSource.setDriverClassName(driver);
        dataSource.setMaximumPoolSize(intProp("spring.datasource.hikari.maximum-pool-size", 5));
        dataSource.setMinimumIdle(intProp("spring.datasource.hikari.minimum-idle", 1));
        dataSource.setIdleTimeout(intProp("spring.datasource.hikari.idle-timeout", 60000));
        dataSource.setMaxLifetime(intProp("spring.datasource.hikari.max-lifetime", 300000));
        dataSource.setConnectionTimeout(intProp("spring.datasource.hikari.connection-timeout", 30000));
        dataSource.setValidationTimeout(intProp("spring.datasource.hikari.validation-timeout", 5000));
        dataSource.setKeepaliveTime(intProp("spring.datasource.hikari.keepalive-time", 30000));
        dataSource.setInitializationFailTimeout(intProp("spring.datasource.hikari.initialization-fail-timeout", -1));
        dataSource.setAutoCommit(boolProp("spring.datasource.hikari.auto-commit", true));
        dataSource.setConnectionTestQuery(prop("spring.datasource.hikari.connection-test-query", "SELECT 1"));

        String initSql = prop("spring.datasource.hikari.connection-init-sql", null);
        if (initSql != null) {
            dataSource.setConnectionInitSql(initSql);
        }

        log.info("Configured DataSource: {}", jdbc.url());
        return dataSource;
    }

    private JdbcInfo resolveJdbcInfo() {
        String url = prop("SPRING_DATASOURCE_URL", null);
        if (url != null) {
            return new JdbcInfo(
                    url,
                    prop("SPRING_DATASOURCE_USERNAME", prop("spring.datasource.username", null)),
                    prop("SPRING_DATASOURCE_PASSWORD", prop("spring.datasource.password", null)));
        }

        String databaseUrl = prop("DATABASE_URL", null);
        if (databaseUrl != null) {
            JdbcInfo parsed = parseDatabaseUrl(databaseUrl);
            return new JdbcInfo(
                    parsed.url(),
                    parsed.username() != null ? parsed.username() : prop("spring.datasource.username", null),
                    parsed.password() != null ? parsed.password() : prop("spring.datasource.password", null));
        }

        String host = prop("PGHOST", null);
        if (host != null) {
            String port = prop("PGPORT", "5432");
            String db = prop("PGDATABASE", "booking_db");
            String jdbcUrl = "jdbc:postgresql://" + host + ":" + port + "/" + db;
            return new JdbcInfo(
                    jdbcUrl,
                    prop("PGUSER", prop("spring.datasource.username", null)),
                    prop("PGPASSWORD", prop("spring.datasource.password", null)));
        }

        return new JdbcInfo(
                prop("spring.datasource.url", "jdbc:postgresql://localhost:5432/booking_db"),
                prop("spring.datasource.username", null),
                prop("spring.datasource.password", null));
    }

    private JdbcInfo parseDatabaseUrl(String databaseUrl) {
        String candidate = databaseUrl.trim();
        String scheme = "postgresql";

        int schemeSeparator = candidate.indexOf("://");
        if (schemeSeparator >= 0) {
            scheme = candidate.substring(0, schemeSeparator);
            candidate = candidate.substring(schemeSeparator + 3);
        }

        String username = null;
        String password = null;
        int at = candidate.lastIndexOf('@');
        if (at >= 0) {
            String creds = candidate.substring(0, at);
            candidate = candidate.substring(at + 1);
            int colon = creds.indexOf(':');
            if (colon >= 0) {
                username = creds.substring(0, colon);
                password = creds.substring(colon + 1);
            } else {
                username = creds;
            }
        }

        return new JdbcInfo("jdbc:" + scheme + "://" + candidate, username, password);
    }

    private String prop(String key, String defaultValue) {
        String value = environment.getProperty(key);
        if (value == null || value.isBlank() || value.contains("${")) {
            return defaultValue;
        }
        return value;
    }

    private int intProp(String key, int defaultValue) {
        String value = prop(key, null);
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private boolean boolProp(String key, boolean defaultValue) {
        String value = prop(key, null);
        return value == null ? defaultValue : Boolean.parseBoolean(value.trim());
    }

    private record JdbcInfo(String url, String username, String password) {
    }
}