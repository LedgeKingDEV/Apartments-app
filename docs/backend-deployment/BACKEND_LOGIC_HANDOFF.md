# Apartify Africa Backend Logic Handoff

**Purpose:** Give a developer a code-oriented map of the backend in this repository. This document describes the implementation as it exists in the checkout; deployment variables and production behavior still need to be confirmed against the running environment.

## 1. Project overview

The product is an apartment/short-stay marketplace with:

- A React Native / Expo client in `apps/mobile`.
- A React/Vite admin dashboard in `apps/dashboard`.
- A Java 21 / Spring Boot 3.3 API in `apps/api`.
- PostgreSQL persistence through Spring Data JPA / Hibernate.
- JWT authentication for users and admins, payment provider integrations, local file storage, and KYC/AML controls.

The backend source root is `apps/api/src/main/java/com/example/booking`. The main API entry point is `BookingApplication.java`. The Maven project is `apps/api/pom.xml`.

## 2. Backend architecture and request flow

Typical request flow:

```text
Mobile app / admin dashboard
        -> REST controller (request validation and principal extraction)
        -> service interface + service implementation (business rules)
        -> Spring Data repository (JPA queries / PostgreSQL)
        -> entity mapping to response DTO
```

Controllers are in `controller/`, business services in `service/` and `service/impl/`, persistence models in `entity/`, repository interfaces in `repository/`, request/response contracts in `dto/`, and auth infrastructure in `security/`. `GlobalExceptionHandler` centralizes API error responses. OpenAPI is configured and exposed under `/api-docs` and Swagger UI.

The backend has distinct user and admin identity classes and separate user-details services. Most routes require a bearer token; selected read endpoints, auth endpoints, health, docs, and public file reads are open. Method-level `@PreAuthorize` adds role checks for host/admin actions and admin-only operations.

## 3. Main business domains

### Authentication and accounts

Routes use `/api/auth` (`AuthController`) for user registration/login, current user, token refresh, and password reset. Passwords are encoded with BCrypt. JWT issuance and parsing are handled by `JwtService` and `JwtAuthenticationFilter`; tokens are stateless and the configured default expiry is one hour. Password reset uses a persisted `PasswordResetToken`, email delivery, request throttling/cache, and scheduled cleanup (`TokenCleanupScheduler`).

Admin auth is under `/api/admin/auth` (`AdminAuthController`). Admin actions are provided under `/api/admin` and generally require ADMIN role. The first-admin bootstrap route is publicly reachable but requires `ADMIN_BOOTSTRAP_TOKEN` in the `X-Admin-Bootstrap-Token` header, and is disabled if that token is unset. It also stops working once an admin exists.

### Listings and photos

`ListingController` and `ApartmentController` expose listing search/read and host listing management. `ListingServiceImpl` converts request amenity/policy strings into known enums, builds filtered JPA specifications (`ListingSpecifications`), paginates results, checks favorite state, maps entities into DTOs, and handles photo storage through `StorageService`.

Creating/updating a listing processes image data from the request. Updating replaces the listing's photo collection. Photo upload and listing mutation enforce host ownership in the service; admin can bypass ownership. Local implementation is `LocalStorageService`; the public URL prefix and local storage root are configurable.

### Bookings and escrow behavior

`BookingServiceImpl` validates that the end date is after the start date and checks overlapping bookings before saving. A booking response status is derived from dates (`PAST`, `CURRENT`, `UPCOMING`). Booking details are visible to the guest, listing host, or admin. Cancellation can call wallet refund processing; completion calls wallet escrow release for the host. Admin cancellation/completion are audit logged.

Booking totals are calculated on the server as the listing's daily price multiplied by the number of nights. A legacy `totalPrice` request field is accepted for compatibility but ignored. Booking creation locks the listing row while checking availability and saving, serializing concurrent booking attempts for that listing.

### Wallet, transactions, and payments

`WalletServiceImpl` is the main wallet ledger logic. Wallets and transactions are persisted separately. It uses a pessimistic wallet lookup (`WalletRepository.findByUserIdWithLock`) for sensitive balance operations and transaction statuses include pending/processing/completed/failed. Deposits are generally recorded pending until provider confirmation; withdrawals reserve/debit funds and can be completed or refunded based on provider status/webhooks. Booking escrow release and refund logic live in this service. Balance reconciliation can sum completed deposit and withdrawal transactions and sync provider transactions.

Wallet controls include active/suspended/closed status, KYC-tier deposit and withdrawal limits, per-hour/day withdrawal velocity, cooldown after recent deposits, verified bank binding, large-transaction flags, and AML compliance flags. Defaults are configured under `kyc.*` in `application.properties` and can be overridden with environment variables.

`PaymentController` exposes booking payment/refund endpoints, Paystack initialization/verification, Flutterwave virtual account creation, and a Flutterwave webhook route. Provider selection is configured by `payment.provider`; implementations are under `payment/impl` (`LocalPaymentProvider`, `PaystackPaymentProvider`, and `StripePaymentProvider`). The `FlutterwaveService` performs HTTP provider operations and parses webhook events; wallet webhook processing is in `WalletServiceImpl`.

Payment integrity areas for the developer to check carefully:

- Flutterwave webhook handling fails closed when the encryption key is missing and uses constant-time comparison for the configured verification hash. Continue to verify provider semantics and transaction details.
- Make webhook processing idempotent under retries and concurrent deliveries; verify uniqueness constraints and transaction/reference matching in the database.
- Confirm provider verification validates transaction status, currency, amount, reference, and intended user/booking before crediting funds.
- Keep local/test payment-provider behavior disabled in production.
- Reconcile wallet balance semantics with escrow, pending withdrawals, refunds, and provider settlement; the sync logic is extensive and can alter transaction records/balances.

### KYC, bank binding, and compliance

`KycServiceImpl` and `KycController` manage a user's KYC status and submissions. The documented progression is UNVERIFIED → PENDING → BASIC or VERIFIED. Admin review and wallet freezing/AML flag resolution are implemented in `AdminComplianceController`, which is class-level ADMIN-only. KYC decisions and wallet status changes are audited. A bank account may be bound after review, with provider-side verification paths in the service.

Compliance flags are stored in `ComplianceFlag` and have type/severity/resolution metadata. `ComplianceServiceImpl` creates and pages flags. `AuditServiceImpl` writes admin/user audit entries. The thresholds and AML configuration are environment-overridable; have compliance owners validate values and behavior before launch.

### Other domains

- **Favorites:** `FavoriteController` and `FavoriteServiceImpl`, user-scoped favorites persisted in PostgreSQL.
- **Reviews:** `ReviewController` and `ReviewServiceImpl`, with listing review data and eligibility/ownership checks in the service.
- **User profile/avatar:** `UserController` and `UserServiceImpl`, profile updates and avatar storage.
- **File serving:** `FileController` serves stored files under `/api/files/**`.
- **Email:** `EmailServiceImpl` and password reset/admin workflows.
- **Admin dashboard data:** `AdminController` provides stats, user/admin management, bookings/listings/transactions, and audit logs.

## 4. API route map

All routes below are prefixed by the route prefix shown. Exact request/response schemas are defined in adjacent `dto/` classes and Swagger annotations.

| Prefix | Main operations | Access intent |
|---|---|---|
| `/api/auth` | register, login, forgot/reset password, validate reset token, refresh, `/me` | Auth routes public except refresh and `/me` |
| `/api/admin/auth` | admin login, register, bootstrap | Login and bootstrap are public; bootstrap requires a one-time secret header |
| `/api/listings` | create/update/delete, vocabulary, detail/search, my listings, add/remove photos | public reads; authenticated writes; HOST/ADMIN for edits/photos |
| `/api/apartments` | apartment read/search and listing management aliases | public reads; authenticated writes; review method guards |
| `/api/bookings` | create, get by ID, list/filter, complete; cancellation endpoint | authenticated; access enforced per guest/host/admin in service |
| `/api/wallet` | wallet, deposit, withdraw, bind bank, transactions, sync/verify operations | authenticated user-scoped operations |
| `/api/payments` | booking charge/refund, Paystack initialize/verify, Flutterwave virtual account/webhook | mixed; provider callback must be signature checked |
| `/api/kyc` | status, submit | authenticated |
| `/api/admin/compliance` | KYC queues/decisions, wallet freeze, flags/resolve | ADMIN only |
| `/api/admin` | dashboard stats and CRUD/management for users, admins, bookings, listings, transactions, audit logs | ADMIN only |
| `/api/favorites` | add/remove/list favorites | authenticated |
| `/api/reviews` | create/update/list reviews | authenticated writes; public listing review reads where configured |
| `/api/users` | current profile, update, avatar | authenticated |
| `/api/files` | get stored media | public read |
| `/api/health` | health check | public |

## 5. Data model

Core JPA entities in `entity/`:

| Entity | Purpose |
|---|---|
| `User` | User identity/profile, role, KYC tier/document state, bank binding fields |
| `AdminUser` | Separate admin login/account state |
| `Listing`, `ListingPhoto` | Property details, host association, photos, amenities/policies |
| `Booking` | Guest/listing/date range/total price and booking linkage |
| `Wallet`, `Transaction` | Wallet balance/status and transaction ledger/provider references |
| `Favorite`, `Review` | User-property favorites and review records |
| `PasswordResetToken` | Expiring reset tokens |
| `ComplianceFlag`, `AuditLog` | AML/compliance flags and action history |

Repositories are in `repository/`. Production and staging now use `ddl-auto=validate`; the local common default remains `update` for developer setup. Add versioned migrations before future schema changes and avoid running schema update mode against production data.

## 6. Configuration and operations

`application.properties` is the common default configuration; `application-staging.properties` and `application-prod.properties` provide profiles. Key settings:

- Database: `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` (PostgreSQL; default local URL uses `booking_db`).
- Server: `PORT` (default 8084); container/deployment files are in `apps/api/Dockerfile`, `apps/api/railway.json`, `apps/api/render.yaml`, and root `docker-compose.yml`.
- JWT: `JWT_SECRET`, `JWT_EXPIRATION` (default one hour). The API refuses to start if `JWT_SECRET` is missing or cannot provide a 256-bit key. Configure it in every environment.
- Admin bootstrap: `ADMIN_BOOTSTRAP_TOKEN` enables initial administrator bootstrap. Leave it unset after setup; when enabled, send it as `X-Admin-Bootstrap-Token`.
- Storage: `STORAGE_BASE_PATH`, `STORAGE_PUBLIC_URL`; ensure persistent storage or external object storage is used when the host filesystem is ephemeral.
- Payment: `PAYMENT_PROVIDER`, `PAYSTACK_SECRET_KEY`, Flutterwave credentials (including webhook encryption/hash secret; inspect property naming across code and deployment settings). The production profile requires `PAYMENT_PROVIDER` explicitly rather than silently selecting the local provider.
- Mail: Mailjet API credentials and reset URL.
- CORS: `CORS_ALLOWED_ORIGINS`; the configured wildcard behavior maps to a local development allowlist in `SecurityConfig`, so confirm actual dashboard/mobile origins.
- KYC/AML: daily/monthly limits, velocity, cooldown, transaction-size threshold, bank binding requirement.
- Optional local seed: `SEED_DEFAULT_DATA` defaults false; inspect `DataSeeder` before enabling in any shared environment.

Local backend build/run from `apps/api`:

```bash
mvn spring-boot:run
```

With the backend running, Swagger UI is configured at `/swagger-ui.html` and OpenAPI JSON at `/api-docs` (subject to profile/security configuration). Confirm a reachable PostgreSQL database and environment settings first.

## 7. Security and correctness review checklist for the incoming developer

Prioritize these items before feature work or production rollout:

1. **Privileged account bootstrap:** Set a strong `ADMIN_BOOTSTRAP_TOKEN` only for initial admin creation, then remove it from the environment.
2. **Secrets:** Keep JWT, bootstrap, and provider secrets in the deployment secret store. Rotate any real credentials that have ever been committed or shared.
3. **Webhook verification:** Require and validate provider signatures in every environment that can move money; do not accept unsigned callbacks when a key is missing.
4. **Payment ledger:** Audit amount/currency/reference/user matching, idempotency, transaction locking, and balance derivation across deposit, withdrawal, refunds, escrow, and sync paths.
5. **Booking price and races:** Calculate price on the server and protect date availability from concurrent double booking with a database-level strategy.
6. **Admin invite flow:** Review password delivery, token/expiry/forced reset behavior, and audit coverage.
7. **Schema change control:** Add versioned migrations before future schema evolution. Staging and production now fail on schema drift instead of silently altering tables; local development retains automatic update mode.
8. **Uploads:** Validate file size/type/content, generated names, path traversal resistance, storage durability, and authorization for upload/delete. Confirm public-file exposure is intentional.
9. **Authorization consistency:** Check whether guest/host/admin checks return appropriate 403/404 and cover every path, especially aliases and admin operations.
10. **Logging and privacy:** Avoid logging full bank/account details, identity document numbers, access tokens, reset tokens, and provider secrets; review payment and KYC logs.
11. **Date/time and money rules:** Standardize timezone handling, currency minor-unit/rounding rules, booking-day calculation, and daily/monthly window boundaries.
12. **Operational resilience:** Define webhook retries/replay, provider outage behavior, background reconciliation, database backups, persistent media backup, and monitoring/alerting.

## 8. Tests present in the repository

The API has Maven tests for auth, users, listings, bookings, wallet, payments, favorites, reviews, JWT, and base64 multipart conversion under `apps/api/src/test/java`. This handoff did not run them. The next developer should run the suite and add integration tests against PostgreSQL and provider callback fixtures as part of their onboarding review.

## 9. Useful source files

- Security: `security/SecurityConfig.java`, `JwtService.java`, `JwtAuthenticationFilter.java`
- Listings: `controller/ListingController.java`, `service/impl/ListingServiceImpl.java`, `specification/ListingSpecifications.java`
- Bookings: `controller/BookingController.java`, `service/impl/BookingServiceImpl.java`
- Wallet: `controller/WalletController.java`, `service/impl/WalletServiceImpl.java`, `repository/WalletRepository.java`
- Provider payments: `controller/PaymentController.java`, `payment/FlutterwaveService.java`, `payment/impl/`
- KYC/AML: `controller/KycController.java`, `service/impl/KycServiceImpl.java`, `controller/AdminComplianceController.java`, `service/impl/ComplianceServiceImpl.java`
- Admin: `controller/AdminController.java`, `controller/AdminAuthController.java`, `service/impl/AdminUserServiceImpl.java`
- Persistence/config: `entity/`, `repository/`, `resources/application*.properties`

