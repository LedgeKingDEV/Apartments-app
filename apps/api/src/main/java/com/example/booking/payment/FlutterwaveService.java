package com.example.booking.payment;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PostConstruct;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;

/**
 * Flutterwave service for creating virtual accounts using v3 API.
 * 
 * To use this:
 * 1. Set environment variables:
 *    FLUTTERWAVE_SECRET_KEY=rIAaYtIj3VBXAbzDaeolkRsgovxAdwQs
 *    FLUTTERWAVE_ENCRYPTION_KEY=4pqUb2fI/opqWq3OJ5T02INaXi+nnw1SFwEom4cBfIo=
 * 
 * Note: Flutterwave v3 API only supports dynamic (temporary) virtual accounts.
 * Static/permanent accounts require v4 API with OAuth 2.0.
 * 
 * Flutterwave API Documentation: https://developer.flutterwave.com/docs
 */
@Slf4j
@Service
public class FlutterwaveService {

    private static final String FLUTTERWAVE_API_BASE_URL = "https://api.flutterwave.com/v3";
    private static final String VIRTUAL_ACCOUNT_URL = FLUTTERWAVE_API_BASE_URL + "/virtual-account-numbers";
    private static final String TRANSFER_URL = FLUTTERWAVE_API_BASE_URL + "/transfers";
    private static final String TRANSACTIONS_URL = FLUTTERWAVE_API_BASE_URL + "/transactions";
    private static final String ACCOUNT_RESOLVE_URL = FLUTTERWAVE_API_BASE_URL + "/accounts/resolve";
    private static final String WEBHOOK_SECRET_HASH_HEADER = "verif-hash"; // Flutterwave webhook verification header
    private static final int CONNECT_TIMEOUT_MS = 10000; // 10 seconds
    private static final int READ_TIMEOUT_MS = 30000; // 30 seconds
    
    private final RestTemplate restTemplate;
    private final String secretKey;
    private final String encryptionKey;

    public FlutterwaveService(
            @Value("${flutterwave.secret-key:}") String secretKey,
            @Value("${flutterwave.encryption-key:}") String encryptionKey) {
        // Try property values first, then fallback to direct environment variable reading
        String envSecretKey = System.getenv("FLUTTERWAVE_SECRET_KEY");
        String envEncryptionKey = System.getenv("FLUTTERWAVE_ENCRYPTION_KEY");
        
        // Use environment variable if property is empty, otherwise use property value
        // Trim all values to remove any whitespace
        this.secretKey = (secretKey != null && !secretKey.trim().isEmpty()) ? secretKey.trim() : 
                       (envSecretKey != null && !envSecretKey.trim().isEmpty() ? envSecretKey.trim() : null);
        this.encryptionKey = (encryptionKey != null && !encryptionKey.trim().isEmpty()) ? encryptionKey.trim() : 
                            (envEncryptionKey != null && !envEncryptionKey.trim().isEmpty() ? envEncryptionKey.trim() : null);
        
        this.restTemplate = createRestTemplate();
    }
    

    @PostConstruct
    public void validateConfiguration() {
        // Check both property and environment variable sources
        String envSecretKey = System.getenv("FLUTTERWAVE_SECRET_KEY");
        String envEncryptionKey = System.getenv("FLUTTERWAVE_ENCRYPTION_KEY");
        
        log.info("Flutterwave Configuration Check (v3 API):");
        log.info("  Property secret-key: {}", (secretKey != null && !secretKey.trim().isEmpty()) ? "SET (length: " + secretKey.length() + ")" : "NOT SET");
        log.info("  Property encryption-key: {}", (encryptionKey != null && !encryptionKey.trim().isEmpty()) ? "SET (length: " + encryptionKey.length() + ")" : "NOT SET");
        log.info("  Env FLUTTERWAVE_SECRET_KEY: {}", (envSecretKey != null && !envSecretKey.trim().isEmpty()) ? "SET (length: " + envSecretKey.length() + ")" : "NOT SET");
        log.info("  Env FLUTTERWAVE_ENCRYPTION_KEY: {}", (envEncryptionKey != null && !envEncryptionKey.trim().isEmpty()) ? "SET (length: " + envEncryptionKey.length() + ")" : "NOT SET");
        
        if (secretKey == null || secretKey.trim().isEmpty()) {
            log.warn("Flutterwave secret key is not configured. Virtual account creation will fail.");
            log.warn("  Please set FLUTTERWAVE_SECRET_KEY environment variable in Railway.");
        }
        if (encryptionKey == null || encryptionKey.trim().isEmpty()) {
            log.warn("Flutterwave encryption key is not configured. Webhook verification will be disabled.");
            log.warn("  Please set FLUTTERWAVE_ENCRYPTION_KEY environment variable in Railway.");
        }
        if (secretKey != null && !secretKey.trim().isEmpty()) {
            log.info("✅ FlutterwaveService initialized successfully with v3 API credentials");
        } else {
            log.error("❌ FlutterwaveService initialized but credentials are missing!");
            log.error("  Set these in Railway Variables:");
            log.error("    FLUTTERWAVE_SECRET_KEY (Secret Key from Flutterwave dashboard)");
            log.error("    FLUTTERWAVE_ENCRYPTION_KEY (Encryption Key from Flutterwave dashboard)");
        }
    }

    private RestTemplate createRestTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(CONNECT_TIMEOUT_MS);
        factory.setReadTimeout(READ_TIMEOUT_MS);
        return new RestTemplate(factory);
    }

    private HttpHeaders createAuthenticatedHeaders() {
        if (secretKey == null || secretKey.trim().isEmpty()) {
            throw new IllegalStateException(
                "Flutterwave secret key is not configured. Please set FLUTTERWAVE_SECRET_KEY environment variable."
            );
        }
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "Bearer " + secretKey.trim());
        return headers;
    }


    /**
     * Create a dynamic (temporary) virtual account number for a customer.
     * Dynamic accounts are for one-time transactions and expire after use.
     * Note: Flutterwave v3 API only supports dynamic accounts (not static/permanent).
     * 
     * @param email Customer email
     * @param amount Expected payment amount (in NGN)
     * @param name Customer full name
     * @param txRef Unique transaction reference
     * @return VirtualAccountResponse with account details
     */
    public VirtualAccountResponse createVirtualAccount(String email, BigDecimal amount, String name, String txRef) {
        log.debug("Creating virtual account for: email={}, amount={}, txRef={}", email, amount, txRef);
        
        if (secretKey == null || secretKey.trim().isEmpty()) {
            throw new IllegalStateException(
                "Flutterwave secret key is not configured. Please set FLUTTERWAVE_SECRET_KEY environment variable."
            );
        }
        
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("email", email);
            params.put("amount", amount); // Amount in NGN
            params.put("currency", "NGN");
            params.put("tx_ref", txRef);
            // Optional: Add firstname and lastname if provided (Flutterwave may use these)
            if (name != null && !name.trim().isEmpty()) {
                params.put("firstname", extractFirstName(name));
                String lastName = extractLastName(name);
                if (!lastName.isEmpty()) {
                    params.put("lastname", lastName);
                }
            }
            
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(params, createAuthenticatedHeaders());
            ResponseEntity<FlutterwaveVirtualAccountResponse> response = restTemplate.exchange(
                    VIRTUAL_ACCOUNT_URL,
                    HttpMethod.POST,
                    entity,
                    FlutterwaveVirtualAccountResponse.class
            );

            FlutterwaveVirtualAccountResponse flutterwaveResponse = response.getBody();
            if (flutterwaveResponse != null && "success".equalsIgnoreCase(flutterwaveResponse.getStatus()) 
                    && flutterwaveResponse.getData() != null) {
                VirtualAccountData data = flutterwaveResponse.getData();
                log.info("Virtual account created successfully: accountNumber={}, bankName={}, txRef={}", 
                        data.getAccountNumber(), data.getBankName(), txRef);
                
                // Always use company name for virtual accounts (not user's name)
                // This ensures consistent branding and prevents confusion
                String accountName = "Nigerian Apartments Leasing Ltd";
                
                return VirtualAccountResponse.builder()
                        .accountNumber(data.getAccountNumber())
                        .accountName(accountName)
                        .bankName(data.getBankName())
                        .txRef(txRef)
                        .build();
            } else {
                String errorMsg = flutterwaveResponse != null ? flutterwaveResponse.getMessage() : "Unknown error from Flutterwave";
                String status = flutterwaveResponse != null ? flutterwaveResponse.getStatus() : "null";
                log.error("Flutterwave virtual account creation failed. Status: {}, Message: {}", status, errorMsg);
                
                // If no message, provide default based on status
                if (errorMsg == null || errorMsg.trim().isEmpty()) {
                    errorMsg = "Flutterwave API returned status: " + status + ". Check Flutterwave dashboard for details.";
                }
                throw new RuntimeException(errorMsg);
            }
        } catch (HttpClientErrorException | HttpServerErrorException e) {
            String responseBody = e.getResponseBodyAsString();
            int statusCode = e.getStatusCode().value();
            log.error("Flutterwave API error creating virtual account: HTTP {} - Response body: '{}'", 
                    statusCode, responseBody != null ? responseBody : "[empty]");
            
            // Log additional details for 401 errors
            if (statusCode == 401) {
                log.error("Flutterwave returned 401 Unauthorized. Possible causes:");
                log.error("  1. Secret key is incorrect or invalid");
                log.error("  2. Secret key is for wrong environment (test vs live)");
                log.error("  3. Secret key has extra spaces or special characters");
                log.error("  4. Flutterwave account is not active");
            }
            
            // Try to extract error message from Flutterwave response
            String errorMessage = "Flutterwave API returned error";
            if (responseBody != null && !responseBody.trim().isEmpty()) {
                try {
                    // Try to parse as JSON to extract message
                    com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
                    @SuppressWarnings("unchecked")
                    java.util.Map<String, Object> errorData = mapper.readValue(responseBody, java.util.Map.class);
                    if (errorData != null) {
                        String msg = (String) errorData.get("message");
                        if (msg != null && !msg.trim().isEmpty()) {
                            errorMessage = msg;
                        }
                    }
                } catch (Exception parseException) {
                    // If parsing fails, use the raw response
                    errorMessage = responseBody.length() > 200 ? responseBody.substring(0, 200) : responseBody;
                }
            }
            
            throw new RuntimeException(errorMessage, e);
        } catch (RestClientException e) {
            log.error("Network error creating virtual account", e);
            throw new RuntimeException("Network error connecting to Flutterwave: " + e.getMessage(), e);
        } catch (Exception e) {
            log.error("Unexpected error creating virtual account", e);
            throw new RuntimeException("Unexpected error: " + e.getMessage(), e);
        }
    }

    /**
     * Handle Flutterwave webhook event for payment verification.
     * 
     * @param webhookPayload Webhook payload from Flutterwave
     * @param headers HTTP headers containing the verification hash
     * @return WebhookResult with verification details
     */
    public WebhookResult handleWebhook(Map<String, Object> webhookPayload, HttpHeaders headers) {
        log.debug("Processing Flutterwave webhook");
        
        // Verify webhook hash for security
        String receivedHash = headers.getFirst(WEBHOOK_SECRET_HASH_HEADER);
        if (encryptionKey == null || encryptionKey.trim().isEmpty()) {
            log.error("Flutterwave webhook rejected: encryption key is not configured.");
            return WebhookResult.builder()
                    .success(false)
                    .message("Webhook verification is not configured")
                    .build();
        } else if (receivedHash == null || receivedHash.trim().isEmpty()) {
            log.error("Webhook hash verification failed: Missing verif-hash header");
            return WebhookResult.builder()
                    .success(false)
                    .message("Webhook hash verification failed: Missing verification header")
                    .build();
        } else if (!MessageDigest.isEqual(receivedHash.trim().getBytes(StandardCharsets.UTF_8),
                encryptionKey.trim().getBytes(StandardCharsets.UTF_8))) {
            log.error("Webhook hash verification failed. Received hash does not match encryption key.");
            return WebhookResult.builder()
                    .success(false)
                    .message("Webhook hash verification failed: Invalid hash")
                    .build();
        } else {
            log.debug("Webhook hash verification successful");
        }
        
        try {
            String event = (String) webhookPayload.get("event");
            @SuppressWarnings("unchecked")
            Map<String, Object> data = (Map<String, Object>) webhookPayload.get("data");
            
            if (data == null) {
                log.warn("Webhook data is null");
                return WebhookResult.builder()
                        .success(false)
                        .message("Webhook data is null")
                        .build();
            }
            
            if ("charge.completed".equals(event)) {
                // Payment was completed (deposit to wallet)
                String txRef = (String) data.get("tx_ref");
                String status = (String) data.get("status");
                String flwRef = (String) data.get("flw_ref");
                Object amountObj = data.get("amount");
                BigDecimal amount = amountObj != null ? 
                    new BigDecimal(amountObj.toString()).divide(new BigDecimal("100")) : null;
                
                log.info("Payment completed via webhook: txRef={}, flwRef={}, status={}, amount={}", txRef, flwRef, status, amount);
                
                return WebhookResult.builder()
                        .success("successful".equalsIgnoreCase(status))
                        .txRef(txRef)
                        .flwRef(flwRef)
                        .amount(amount)
                        .status(status)
                        .message("Payment processed successfully")
                        .build();
            }
            
            if ("transfer.completed".equals(event)) {
                // Transfer was completed (withdrawal or payment)
                String transferId = (String) data.get("id");
                String status = (String) data.get("status");
                String reference = (String) data.get("reference");
                Object amountObj = data.get("amount");
                BigDecimal amount = amountObj != null ? 
                    new BigDecimal(amountObj.toString()).divide(new BigDecimal("100")) : null;
                
                log.info("Transfer completed via webhook: transferId={}, reference={}, status={}, amount={}", 
                        transferId, reference, status, amount);
                
                return WebhookResult.builder()
                        .success("SUCCESSFUL".equalsIgnoreCase(status))
                        .txRef(reference)
                        .flwRef(transferId)
                        .amount(amount)
                        .status(status)
                        .message("Transfer processed successfully")
                        .build();
            }
            
            log.debug("Webhook event type not handled: {}", event);
            return WebhookResult.builder()
                    .success(false)
                    .message("Event type not handled: " + event)
                    .build();
                    
        } catch (Exception e) {
            log.error("Error processing Flutterwave webhook", e);
            return WebhookResult.builder()
                    .success(false)
                    .message("Error processing webhook: " + e.getMessage())
                    .build();
        }
    }

    private String extractFirstName(String fullName) {
        if (fullName == null || fullName.trim().isEmpty()) {
            return "Customer";
        }
        String[] parts = fullName.trim().split("\\s+");
        return parts[0];
    }

    private String extractLastName(String fullName) {
        if (fullName == null || fullName.trim().isEmpty()) {
            return "Name";
        }
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length > 1) {
            return parts[parts.length - 1];
        }
        return "";
    }

    // DTOs for Flutterwave API responses
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class FlutterwaveVirtualAccountResponse {
        private String status;
        private String message;
        private VirtualAccountData data;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class VirtualAccountData {
        @JsonProperty("account_number")
        private String accountNumber;
        
        @JsonProperty("account_name")
        private String accountName;
        
        @JsonProperty("bank_name")
        private String bankName;
        
        @JsonProperty("tx_ref")
        private String txRef;
        
        @JsonProperty("flw_ref")
        private String flwRef;
    }

    // Response DTOs for service methods
    @lombok.Builder
    @Data
    public static class VirtualAccountResponse {
        private String accountNumber;
        private String accountName;
        private String bankName;
        private String txRef;
        private String flwRef; // Flutterwave reference for transaction matching
    }

    /**
     * Transfer funds to a bank account using Flutterwave Transfer API.
     * 
     * @param accountBank Bank code (e.g., "044" for Access Bank)
     * @param accountNumber Bank account number
     * @param amount Amount to transfer (in NGN)
     * @param narration Transfer description/narration
     * @param reference Unique reference for this transfer
     * @param beneficiaryName Name of the account holder
     * @return TransferResponse with transfer details
     */
    public TransferResponse transferFunds(String accountBank, String accountNumber, 
                                         BigDecimal amount, String narration, 
                                         String reference, String beneficiaryName) {
        log.debug("Initiating Flutterwave transfer: accountBank={}, accountNumber={}, amount={}, reference={}", 
                accountBank, accountNumber, amount, reference);
        
        if (secretKey == null || secretKey.trim().isEmpty()) {
            throw new IllegalStateException(
                "Flutterwave secret key is not configured. Please set FLUTTERWAVE_SECRET_KEY environment variable."
            );
        }
        
        try {
            Map<String, Object> params = new HashMap<>();
            params.put("account_bank", accountBank);
            params.put("account_number", accountNumber);
            params.put("amount", amount.multiply(new BigDecimal("100")).intValue()); // Amount in kobo
            params.put("currency", "NGN");
            params.put("narration", narration != null ? narration : "Wallet withdrawal");
            params.put("reference", reference);
            params.put("beneficiary_name", beneficiaryName != null ? beneficiaryName : "Customer");
            
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(params, createAuthenticatedHeaders());
            ResponseEntity<FlutterwaveTransferResponse> response = restTemplate.exchange(
                    TRANSFER_URL,
                    HttpMethod.POST,
                    entity,
                    FlutterwaveTransferResponse.class
            );

            FlutterwaveTransferResponse flutterwaveResponse = response.getBody();
            if (flutterwaveResponse != null && "success".equalsIgnoreCase(flutterwaveResponse.getStatus()) 
                    && flutterwaveResponse.getData() != null) {
                TransferData transferData = flutterwaveResponse.getData();
                log.info("Transfer initiated successfully: transferId={}, reference={}, status={}", 
                        transferData.getId(), reference, transferData.getStatus());
                
                return TransferResponse.builder()
                        .transferId(transferData.getId())
                        .reference(reference)
                        .status(transferData.getStatus())
                        .amount(amount)
                        .message(flutterwaveResponse.getMessage())
                        .build();
            } else {
                String errorMsg = flutterwaveResponse != null ? flutterwaveResponse.getMessage() : "Unknown error from Flutterwave";
                log.error("Flutterwave transfer failed. Message: {}", errorMsg);
                throw new RuntimeException(errorMsg);
            }
        } catch (HttpClientErrorException | HttpServerErrorException e) {
            String responseBody = e.getResponseBodyAsString();
            log.error("Flutterwave API error initiating transfer: HTTP {} - Response: {}", 
                    e.getStatusCode().value(), responseBody);
            throw new RuntimeException("Flutterwave transfer failed: " + 
                    (responseBody != null && !responseBody.isEmpty() ? responseBody : e.getMessage()), e);
        } catch (RestClientException e) {
            log.error("Network error initiating transfer", e);
            throw new RuntimeException("Network error connecting to Flutterwave: " + e.getMessage(), e);
        } catch (Exception e) {
            log.error("Unexpected error initiating transfer", e);
            throw new RuntimeException("Unexpected error: " + e.getMessage(), e);
        }
    }

    /**
     * Resolve (verify) a bank account against the provider to confirm the account holder's name.
     * Used for KYC bank-account binding so that withdrawals only go to accounts owned by the user.
     *
     * @param accountBank   Bank code (e.g., "044" for Access Bank)
     * @param accountNumber Bank account number
     * @return ResolvedAccount with provider availability and verification result
     */
    public ResolvedAccount resolveAccount(String accountBank, String accountNumber) {
        if (secretKey == null || secretKey.trim().isEmpty()) {
            log.warn("Flutterwave secret key not configured - bank account resolution unavailable, " +
                    "falling back to local name-matching mode");
            return ResolvedAccount.builder()
                    .accountNumber(accountNumber)
                    .bankCode(accountBank)
                    .verified(false)
                    .providerAvailable(false)
                    .message("Flutterwave not configured")
                    .build();
        }

        try {
            Map<String, Object> params = new HashMap<>();
            params.put("account_number", accountNumber);
            params.put("account_bank", accountBank);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(params, createAuthenticatedHeaders());
            ResponseEntity<FlutterwaveResolveResponse> response = restTemplate.exchange(
                    ACCOUNT_RESOLVE_URL,
                    HttpMethod.POST,
                    entity,
                    FlutterwaveResolveResponse.class
            );

            FlutterwaveResolveResponse body = response.getBody();
            if (body != null && "success".equalsIgnoreCase(body.getStatus()) && body.getData() != null) {
                log.info("Bank account resolved successfully: bank={}, number={}, name={}",
                        accountBank, accountNumber, body.getData().getAccountName());
                return ResolvedAccount.builder()
                        .accountNumber(body.getData().getAccountNumber() != null ? body.getData().getAccountNumber() : accountNumber)
                        .accountName(body.getData().getAccountName())
                        .bankCode(accountBank)
                        .verified(true)
                        .providerAvailable(true)
                        .message(body.getMessage())
                        .build();
            } else {
                String errorMsg = body != null ? body.getMessage() : "Unknown error from Flutterwave";
                log.error("Bank account resolution failed. Message: {}", errorMsg);
                return ResolvedAccount.builder()
                        .accountNumber(accountNumber)
                        .bankCode(accountBank)
                        .verified(false)
                        .providerAvailable(true)
                        .message(errorMsg)
                        .build();
            }
        } catch (HttpClientErrorException | HttpServerErrorException e) {
            String responseBody = e.getResponseBodyAsString();
            log.error("Flutterwave API error resolving account: HTTP {} - Response: {}",
                    e.getStatusCode().value(), responseBody);
            return ResolvedAccount.builder()
                    .accountNumber(accountNumber)
                    .bankCode(accountBank)
                    .verified(false)
                    .providerAvailable(true)
                    .message(responseBody != null && !responseBody.isEmpty() ? responseBody : e.getMessage())
                    .build();
        } catch (RestClientException e) {
            log.error("Network error resolving bank account", e);
            return ResolvedAccount.builder()
                    .accountNumber(accountNumber)
                    .bankCode(accountBank)
                    .verified(false)
                    .providerAvailable(true)
                    .message("Network error connecting to Flutterwave: " + e.getMessage())
                    .build();
        }
    }

    /**
     * Get transfer status from Flutterwave.
     * 
     * @param transferId Flutterwave transfer ID
     * @return TransferResponse with current status
     */
    public TransferResponse getTransferStatus(String transferId) {
        log.debug("Checking transfer status: transferId={}", transferId);
        
        if (secretKey == null || secretKey.trim().isEmpty()) {
            throw new IllegalStateException(
                "Flutterwave secret key is not configured. Please set FLUTTERWAVE_SECRET_KEY environment variable."
            );
        }
        
        try {
            HttpEntity<Void> entity = new HttpEntity<>(createAuthenticatedHeaders());
            ResponseEntity<FlutterwaveTransferResponse> response = restTemplate.exchange(
                    TRANSFER_URL + "/" + transferId,
                    HttpMethod.GET,
                    entity,
                    FlutterwaveTransferResponse.class
            );

            FlutterwaveTransferResponse flutterwaveResponse = response.getBody();
            if (flutterwaveResponse != null && "success".equalsIgnoreCase(flutterwaveResponse.getStatus()) 
                    && flutterwaveResponse.getData() != null) {
                TransferData transferData = flutterwaveResponse.getData();
                BigDecimal amount = transferData.getAmount() != null ? 
                    new BigDecimal(transferData.getAmount()).divide(new BigDecimal("100")) : null;
                
                return TransferResponse.builder()
                        .transferId(transferData.getId())
                        .reference(transferData.getReference())
                        .status(transferData.getStatus())
                        .amount(amount)
                        .message(flutterwaveResponse.getMessage())
                        .build();
            } else {
                String errorMsg = flutterwaveResponse != null ? flutterwaveResponse.getMessage() : "Unknown error from Flutterwave";
                log.error("Failed to get transfer status. Message: {}", errorMsg);
                throw new RuntimeException(errorMsg);
            }
        } catch (HttpClientErrorException | HttpServerErrorException e) {
            String responseBody = e.getResponseBodyAsString();
            log.error("Flutterwave API error getting transfer status: HTTP {} - Response: {}", 
                    e.getStatusCode().value(), responseBody);
            throw new RuntimeException("Failed to get transfer status: " + 
                    (responseBody != null && !responseBody.isEmpty() ? responseBody : e.getMessage()), e);
        } catch (RestClientException e) {
            log.error("Network error getting transfer status", e);
            throw new RuntimeException("Network error connecting to Flutterwave: " + e.getMessage(), e);
        } catch (Exception e) {
            log.error("Unexpected error getting transfer status", e);
            throw new RuntimeException("Unexpected error: " + e.getMessage(), e);
        }
    }

    /**
     * Verify a transaction by Flutterwave reference.
     * 
     * @param txRef Transaction reference
     * @return Transaction verification details
     */
    public TransactionVerification verifyTransaction(String txRef) {
        log.debug("Verifying transaction: txRef={}", txRef);
        
        if (secretKey == null || secretKey.trim().isEmpty()) {
            throw new IllegalStateException(
                "Flutterwave secret key is not configured. Please set FLUTTERWAVE_SECRET_KEY environment variable."
            );
        }
        
        try {
            HttpEntity<Void> entity = new HttpEntity<>(createAuthenticatedHeaders());
            ResponseEntity<FlutterwaveTransactionVerificationResponse> response = restTemplate.exchange(
                    FLUTTERWAVE_API_BASE_URL + "/transactions/" + txRef + "/verify",
                    HttpMethod.GET,
                    entity,
                    FlutterwaveTransactionVerificationResponse.class
            );

            FlutterwaveTransactionVerificationResponse flutterwaveResponse = response.getBody();
            if (flutterwaveResponse != null && "success".equalsIgnoreCase(flutterwaveResponse.getStatus()) 
                    && flutterwaveResponse.getData() != null) {
                TransactionVerificationData data = flutterwaveResponse.getData();
                
                // CRITICAL: Use the charged amount (what customer paid), not the settled amount (after fees)
                // The 'amount' field is the amount charged to the customer (full amount)
                // The 'amount_settled' field is what the merchant receives (after Flutterwave fees)
                // For wallet funding, we use the charged amount because that's what the customer paid
                BigDecimal amountCharged = data.getAmount() != null ? 
                    new BigDecimal(data.getAmount()).divide(new BigDecimal("100")) : null;
                BigDecimal amountSettled = data.getAmountSettled() != null ? 
                    new BigDecimal(data.getAmountSettled()).divide(new BigDecimal("100")) : null;
                
                // Log amount details for verification
                if (amountCharged != null) {
                    log.info("Transaction verification - Amount charged (customer paid): NGN {}, Amount settled (after fees): NGN {}, txRef: {}", 
                            amountCharged, amountSettled != null ? amountSettled : "N/A", data.getTxRef());
                }
                
                // Extract customer email from verification response
                String customerEmail = null;
                if (data.getCustomer() != null) {
                    Object emailObj = data.getCustomer().get("email");
                    if (emailObj != null) {
                        customerEmail = emailObj.toString();
                    }
                }
                
                // Use charged amount for wallet funding (what customer actually paid)
                return TransactionVerification.builder()
                        .txRef(data.getTxRef())
                        .flwRef(data.getFlwRef())
                        .status(data.getStatus())
                        .amount(amountCharged) // Use charged amount, not settled amount
                        .currency(data.getCurrency())
                        .customerEmail(customerEmail)
                        .message(flutterwaveResponse.getMessage())
                        .build();
            } else {
                String errorMsg = flutterwaveResponse != null ? flutterwaveResponse.getMessage() : "Unknown error from Flutterwave";
                log.error("Transaction verification failed. Message: {}", errorMsg);
                throw new RuntimeException(errorMsg);
            }
        } catch (HttpClientErrorException | HttpServerErrorException e) {
            String responseBody = e.getResponseBodyAsString();
            log.error("Flutterwave API error verifying transaction: HTTP {} - Response: {}", 
                    e.getStatusCode().value(), responseBody);
            throw new RuntimeException("Transaction verification failed: " + 
                    (responseBody != null && !responseBody.isEmpty() ? responseBody : e.getMessage()), e);
        } catch (RestClientException e) {
            log.error("Network error verifying transaction", e);
            throw new RuntimeException("Network error connecting to Flutterwave: " + e.getMessage(), e);
        } catch (Exception e) {
            log.error("Unexpected error verifying transaction", e);
            throw new RuntimeException("Unexpected error: " + e.getMessage(), e);
        }
    }

    /**
     * Fetch transactions from Flutterwave for a specific customer email
     * @param customerEmail Customer email to fetch transactions for
     * @return List of transaction verifications
     */
    public java.util.List<TransactionVerification> fetchTransactionsByEmail(String customerEmail) {
        log.debug("Fetching transactions from Flutterwave for email: {}", customerEmail);
        
        if (secretKey == null || secretKey.trim().isEmpty()) {
            throw new IllegalStateException(
                "Flutterwave secret key is not configured. Please set FLUTTERWAVE_SECRET_KEY environment variable."
            );
        }
        
        try {
            java.util.List<TransactionVerification> allTransactions = new java.util.ArrayList<>();
            
            // Try multiple approaches to fetch all transactions
            // 1. First try without date filter to get ALL transactions (Flutterwave may not require dates)
            // 2. If that fails or returns empty, try with extended date range (last 10 years to catch all historical transactions)
            java.time.LocalDate endDate = java.time.LocalDate.now();
            java.time.LocalDate startDate = endDate.minusYears(10); // Extended to 10 years to catch ALL historical transactions
            
            // Try fetching without date filter first (some Flutterwave accounts may support this)
            java.util.List<TransactionVerification> transactionsWithoutDate = new java.util.ArrayList<>();
            try {
                String urlNoDate = TRANSACTIONS_URL + "?customer_email=" + java.net.URLEncoder.encode(customerEmail, "UTF-8");
                log.info("Attempting to fetch ALL Flutterwave transactions (no date filter) for email: {}", customerEmail);
                
                HttpEntity<Void> entityNoDate = new HttpEntity<>(createAuthenticatedHeaders());
                ResponseEntity<FlutterwaveTransactionsResponse> responseNoDate = restTemplate.exchange(
                        urlNoDate,
                        HttpMethod.GET,
                        entityNoDate,
                        FlutterwaveTransactionsResponse.class
                );
                
                FlutterwaveTransactionsResponse flutterwaveResponseNoDate = responseNoDate.getBody();
                if (flutterwaveResponseNoDate != null && "success".equalsIgnoreCase(flutterwaveResponseNoDate.getStatus()) 
                        && flutterwaveResponseNoDate.getData() != null && !flutterwaveResponseNoDate.getData().isEmpty()) {
                    log.info("✅ Successfully fetched transactions without date filter, processing...");
                    for (FlutterwaveTransactionData data : flutterwaveResponseNoDate.getData()) {
                        if (data.getStatus() != null && 
                            ("successful".equalsIgnoreCase(data.getStatus()) || 
                             "SUCCESSFUL".equalsIgnoreCase(data.getStatus()) ||
                             "completed".equalsIgnoreCase(data.getStatus()) ||
                             "COMPLETED".equalsIgnoreCase(data.getStatus()))) {
                            BigDecimal amount = data.getAmount() != null ? 
                                new BigDecimal(data.getAmount()).divide(new BigDecimal("100")) : null;
                            
                            boolean emailMatches = true;
                            if (data.getCustomer() != null && data.getCustomer().containsKey("email")) {
                                String transactionEmail = (String) data.getCustomer().get("email");
                                if (transactionEmail != null && !transactionEmail.equalsIgnoreCase(customerEmail)) {
                                    emailMatches = false;
                                }
                            }
                            
                            if (emailMatches) {
                                transactionsWithoutDate.add(TransactionVerification.builder()
                                        .txRef(data.getTxRef())
                                        .flwRef(data.getFlwRef())
                                        .status(data.getStatus())
                                        .amount(amount)
                                        .currency(data.getCurrency())
                                        .customerEmail(customerEmail)
                                        .message("Fetched from Flutterwave (no date filter)")
                                        .build());
                            }
                        }
                    }
                    log.info("✅ Fetched {} transactions without date filter", transactionsWithoutDate.size());
                }
            } catch (Exception e) {
                log.debug("Could not fetch transactions without date filter (this is normal if Flutterwave requires dates): {}", e.getMessage());
            }
            
            // Also fetch with date range as fallback/additional method
            String url = TRANSACTIONS_URL + "?customer_email=" + java.net.URLEncoder.encode(customerEmail, "UTF-8");
            url += "&from=" + startDate.toString() + "&to=" + endDate.toString();
            url += "&page=1"; // Start with page 1
            
            log.info("Fetching Flutterwave transactions with date range: {} to {} (10 years to get ALL historical transactions)", startDate, endDate);
            
            // Fetch all pages of transactions - increase limit to get ALL transactions
            int currentPage = 1;
            int maxPages = 100; // Increased limit significantly to fetch ALL pages of transactions
            boolean hasMorePages = true;
            int totalPagesFetched = 0;
            
            while (hasMorePages && currentPage <= maxPages) {
                String pageUrl = TRANSACTIONS_URL + "?customer_email=" + java.net.URLEncoder.encode(customerEmail, "UTF-8");
                pageUrl += "&from=" + startDate.toString() + "&to=" + endDate.toString();
                pageUrl += "&page=" + currentPage;
                
                log.debug("Fetching page {} of Flutterwave transactions...", currentPage);
                
                HttpEntity<Void> entity = new HttpEntity<>(createAuthenticatedHeaders());
                ResponseEntity<FlutterwaveTransactionsResponse> response = restTemplate.exchange(
                        pageUrl,
                        HttpMethod.GET,
                        entity,
                        FlutterwaveTransactionsResponse.class
                );

                FlutterwaveTransactionsResponse flutterwaveResponse = response.getBody();
                if (flutterwaveResponse != null && "success".equalsIgnoreCase(flutterwaveResponse.getStatus()) 
                        && flutterwaveResponse.getData() != null && !flutterwaveResponse.getData().isEmpty()) {
                    
                    int pageTransactions = 0;
                    for (FlutterwaveTransactionData data : flutterwaveResponse.getData()) {
                        // Only include successful/completed transactions
                        if (data.getStatus() != null && 
                            ("successful".equalsIgnoreCase(data.getStatus()) || 
                             "SUCCESSFUL".equalsIgnoreCase(data.getStatus()) ||
                             "completed".equalsIgnoreCase(data.getStatus()) ||
                             "COMPLETED".equalsIgnoreCase(data.getStatus()))) {
                            BigDecimal amount = data.getAmount() != null ? 
                                new BigDecimal(data.getAmount()).divide(new BigDecimal("100")) : null;
                            
                            // Verify customer email matches (if customer data is available)
                            boolean emailMatches = true;
                            if (data.getCustomer() != null && data.getCustomer().containsKey("email")) {
                                String transactionEmail = (String) data.getCustomer().get("email");
                                if (transactionEmail != null && !transactionEmail.equalsIgnoreCase(customerEmail)) {
                                    emailMatches = false;
                                    log.debug("Skipping transaction {} - email mismatch: {} vs {}", 
                                            data.getTxRef(), transactionEmail, customerEmail);
                                }
                            }
                            
                            if (emailMatches) {
                                // Check if we already have this transaction (avoid duplicates)
                                // Check both in allTransactions and transactionsWithoutDate
                                boolean alreadyExists = allTransactions.stream()
                                    .anyMatch(t -> t.getTxRef() != null && t.getTxRef().equals(data.getTxRef())) ||
                                    transactionsWithoutDate.stream()
                                    .anyMatch(t -> t.getTxRef() != null && t.getTxRef().equals(data.getTxRef()));
                                
                                if (!alreadyExists) {
                                    allTransactions.add(TransactionVerification.builder()
                                            .txRef(data.getTxRef())
                                            .flwRef(data.getFlwRef())
                                            .status(data.getStatus())
                                            .amount(amount)
                                            .currency(data.getCurrency())
                                            .customerEmail(customerEmail)
                                            .message("Fetched from Flutterwave")
                                            .build());
                                    pageTransactions++;
                                    log.debug("Added transaction: txRef={}, amount={}, status={}", 
                                            data.getTxRef(), amount, data.getStatus());
                                } else {
                                    log.debug("Skipping duplicate transaction: txRef={}", data.getTxRef());
                                }
                            }
                        }
                    }
                    
                    log.info("Page {}: Found {} successful transactions (total so far: {})", 
                            currentPage, pageTransactions, allTransactions.size());
                    totalPagesFetched = currentPage;
                    
                    // Check if there are more pages
                    // Flutterwave typically returns 20-50 transactions per page
                    // If we got fewer than expected, check if there's a next page indicator
                    int pageSize = flutterwaveResponse.getData().size();
                    if (pageSize == 0) {
                        // No more transactions on this page
                        hasMorePages = false;
                    } else if (pageSize < 20) {
                        // Likely the last page (less than typical page size)
                        hasMorePages = false;
                    } else {
                        // Might have more pages, continue
                        currentPage++;
                        // Add a small delay to avoid rate limiting
                        if (currentPage % 10 == 0) {
                            Thread.sleep(500); // Small delay every 10 pages
                        }
                    }
                } else {
                    // No more data or error
                    hasMorePages = false;
                    if (flutterwaveResponse != null && !"success".equalsIgnoreCase(flutterwaveResponse.getStatus())) {
                        String errorMsg = flutterwaveResponse.getMessage();
                        log.warn("Flutterwave API returned non-success status on page {}: {}", currentPage, errorMsg);
                    }
                }
            }
            
            // Merge transactions from both methods (without date filter and with date filter)
            // Remove duplicates based on txRef
            java.util.Map<String, TransactionVerification> uniqueTransactions = new java.util.HashMap<>();
            
            // Add transactions without date filter first
            for (TransactionVerification txn : transactionsWithoutDate) {
                if (txn.getTxRef() != null) {
                    uniqueTransactions.put(txn.getTxRef(), txn);
                }
            }
            
            // Add transactions with date filter (will overwrite if duplicate, but they should be the same)
            for (TransactionVerification txn : allTransactions) {
                if (txn.getTxRef() != null) {
                    uniqueTransactions.put(txn.getTxRef(), txn);
                }
            }
            
            java.util.List<TransactionVerification> finalTransactions = new java.util.ArrayList<>(uniqueTransactions.values());
            
            log.info("✅ Fetched {} total unique successful transactions from Flutterwave for email: {} ({} without date filter, {} with date filter, searched {} pages)", 
                    finalTransactions.size(), customerEmail, transactionsWithoutDate.size(), allTransactions.size(), totalPagesFetched);
            
            // If we still have very few transactions but user has made payments, log a warning
            if (finalTransactions.size() == 0) {
                log.warn("⚠️ No transactions found for email: {}. This may indicate: 1) No transactions exist, 2) Email mismatch, 3) Transactions exist but weren't fetched by email query.", customerEmail);
            } else if (finalTransactions.size() < 5) {
                log.warn("⚠️ Only {} transactions found for email: {}. If user has made more payments, they may not be associated with this email in Flutterwave.", finalTransactions.size(), customerEmail);
            }
            
            // Log transaction references for debugging
            if (!finalTransactions.isEmpty()) {
                log.info("Transaction references found: {}", 
                        finalTransactions.stream()
                                .map(t -> t.getTxRef())
                                .limit(10)
                                .collect(java.util.stream.Collectors.joining(", ")) + 
                        (finalTransactions.size() > 10 ? " ... (and " + (finalTransactions.size() - 10) + " more)" : ""));
            }
            
            return finalTransactions;
        } catch (HttpClientErrorException | HttpServerErrorException e) {
            String responseBody = e.getResponseBodyAsString();
            log.warn("Flutterwave API error fetching transactions: HTTP {} - Response: {}", 
                    e.getStatusCode().value(), responseBody);
            // Return empty list instead of throwing - fetching transactions is not critical
            return java.util.Collections.emptyList();
        } catch (RestClientException e) {
            log.warn("Network error fetching transactions: {}", e.getMessage());
            return java.util.Collections.emptyList();
        } catch (Exception e) {
            log.warn("Unexpected error fetching transactions: {}", e.getMessage());
            return java.util.Collections.emptyList();
        }
    }

    // Transaction list response DTOs
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class FlutterwaveTransactionsResponse {
        private String status;
        private String message;
        private java.util.List<FlutterwaveTransactionData> data;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class FlutterwaveTransactionData {
        @JsonProperty("tx_ref")
        private String txRef;
        @JsonProperty("flw_ref")
        private String flwRef;
        private String status;
        private String amount; // Amount in kobo (smallest currency unit)
        private String currency;
        @JsonProperty("customer")
        private Map<String, Object> customer;
        @JsonProperty("created_at")
        private String createdAt;
    }

    @lombok.Builder
    @Data
    public static class WebhookResult {
        private boolean success;
        private String txRef;
        private String flwRef; // Flutterwave reference for transaction matching
        private BigDecimal amount;
        private String status;
        private String message;
    }

    // Transfer API DTOs
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class FlutterwaveTransferResponse {
        private String status;
        private String message;
        private TransferData data;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class TransferData {
        private String id;
        @JsonProperty("account_number")
        private String accountNumber;
        @JsonProperty("account_bank")
        private String accountBank;
        @JsonProperty("beneficiary_name")
        private String beneficiaryName;
        private Integer amount; // Amount in kobo
        private String currency;
        private String reference;
        private String narration;
        private String status;
        @JsonProperty("complete_message")
        private String completeMessage;
        @JsonProperty("created_at")
        private String createdAt;
    }

    // Bank account resolution DTOs
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class FlutterwaveResolveResponse {
        private String status;
        private String message;
        private ResolveData data;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class ResolveData {
        @JsonProperty("account_number")
        private String accountNumber;
        @JsonProperty("account_name")
        private String accountName;
    }

    @lombok.Builder
    @Data
    public static class ResolvedAccount {
        private String accountNumber;
        private String accountName;
        private String bankCode;
        private boolean verified;
        private boolean providerAvailable;
        private String message;
    }

    public static class TransferResponse {
        private String transferId;
        private String reference;
        private String status;
        private BigDecimal amount;
        private String message;

        // Manual getters (Lombok not working in Docker build)
        public String getStatus() {
            return status;
        }

        public String getTransferId() {
            return transferId;
        }

        // Builder pattern methods (replacing @lombok.Builder)
        public static TransferResponseBuilder builder() {
            return new TransferResponseBuilder();
        }

        public static class TransferResponseBuilder {
            private String transferId;
            private String reference;
            private String status;
            private BigDecimal amount;
            private String message;

            public TransferResponseBuilder transferId(String transferId) {
                this.transferId = transferId;
                return this;
            }

            public TransferResponseBuilder reference(String reference) {
                this.reference = reference;
                return this;
            }

            public TransferResponseBuilder status(String status) {
                this.status = status;
                return this;
            }

            public TransferResponseBuilder amount(BigDecimal amount) {
                this.amount = amount;
                return this;
            }

            public TransferResponseBuilder message(String message) {
                this.message = message;
                return this;
            }

            public TransferResponse build() {
                TransferResponse response = new TransferResponse();
                response.transferId = this.transferId;
                response.reference = this.reference;
                response.status = this.status;
                response.amount = this.amount;
                response.message = this.message;
                return response;
            }
        }
    }

    // Transaction Verification DTOs
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class FlutterwaveTransactionVerificationResponse {
        private String status;
        private String message;
        private TransactionVerificationData data;
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    static class TransactionVerificationData {
        @JsonProperty("tx_ref")
        private String txRef;
        @JsonProperty("flw_ref")
        private String flwRef;
        private String status;
        private Integer amount; // Amount charged to customer in kobo (full amount, not settled amount)
        @JsonProperty("amount_settled")
        private Integer amountSettled; // Amount to be settled to merchant in kobo (after fees)
        private String currency;
        @JsonProperty("customer")
        private Map<String, Object> customer;
    }

    public static class TransactionVerification {
        private String txRef;
        private String flwRef;
        private String status;
        private BigDecimal amount;
        private String currency;
        private String customerEmail;
        private String message;

        // Manual getters (Lombok not working in Docker build)
        // These getters are required for WalletServiceImpl to access transaction verification data
        public String getTxRef() {
            return txRef;
        }

        public String getFlwRef() {
            return flwRef;
        }

        public String getStatus() {
            return status;
        }

        public BigDecimal getAmount() {
            return amount;
        }

        public String getCurrency() {
            return currency;
        }

        public String getCustomerEmail() {
            return customerEmail;
        }

        public String getMessage() {
            return message;
        }

        // Builder pattern methods (replacing @lombok.Builder)
        public static TransactionVerificationBuilder builder() {
            return new TransactionVerificationBuilder();
        }

        public static class TransactionVerificationBuilder {
            private String txRef;
            private String flwRef;
            private String status;
            private BigDecimal amount;
            private String currency;
            private String customerEmail;
            private String message;

            public TransactionVerificationBuilder txRef(String txRef) {
                this.txRef = txRef;
                return this;
            }

            public TransactionVerificationBuilder flwRef(String flwRef) {
                this.flwRef = flwRef;
                return this;
            }

            public TransactionVerificationBuilder status(String status) {
                this.status = status;
                return this;
            }

            public TransactionVerificationBuilder amount(BigDecimal amount) {
                this.amount = amount;
                return this;
            }

            public TransactionVerificationBuilder currency(String currency) {
                this.currency = currency;
                return this;
            }

            public TransactionVerificationBuilder customerEmail(String customerEmail) {
                this.customerEmail = customerEmail;
                return this;
            }

            public TransactionVerificationBuilder message(String message) {
                this.message = message;
                return this;
            }

            public TransactionVerification build() {
                TransactionVerification verification = new TransactionVerification();
                verification.txRef = this.txRef;
                verification.flwRef = this.flwRef;
                verification.status = this.status;
                verification.amount = this.amount;
                verification.currency = this.currency;
                verification.customerEmail = this.customerEmail;
                verification.message = this.message;
                return verification;
            }
        }
    }
}

