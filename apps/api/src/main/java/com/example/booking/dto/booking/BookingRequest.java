package com.example.booking.dto.booking;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Schema(description = "Request to create a booking")
public class BookingRequest {
    @NotNull
    @Schema(description = "ID of the listing to book", example = "1")
    private Long listingId;

    @NotNull
    @FutureOrPresent
    @Schema(description = "Check-in date (must be today or in the future)", example = "2024-02-15")
    private LocalDate startDate;

    @NotNull
    @Schema(description = "Check-out date", example = "2024-02-20")
    private LocalDate endDate;

    // Kept for compatibility with older clients. The backend ignores this value and
    // calculates the total from the listing's current daily price and date range.
    @Schema(description = "Deprecated client-supplied total; ignored by the backend", example = "750.00", accessMode = Schema.AccessMode.READ_ONLY)
    private BigDecimal totalPrice;
}
