package com.example.booking.controller;

import com.example.booking.dto.common.PageResponse;
import com.example.booking.dto.listing.ListingFilterRequest;
import com.example.booking.dto.listing.ListingRequest;
import com.example.booking.dto.listing.ListingResponse;
import com.example.booking.security.BookingUserDetails;
import com.example.booking.service.ListingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Apartment Controller - Alias for ListingController
 * 
 * This controller provides backward compatibility by mapping /api/apartments endpoints
 * to the corresponding /api/listings endpoints. This allows the frontend to continue
 * using /api/apartments without requiring frontend changes.
 * 
 * All endpoints delegate to the ListingService, which is the same service used by ListingController.
 */
@RestController
@RequestMapping("/api/apartments")
@Tag(name = "Apartments", description = "Property apartment management endpoints (alias for listings)")
public class ApartmentController {

    private final ListingService listingService;

    public ApartmentController(ListingService listingService) {
        this.listingService = listingService;
    }

    @Operation(summary = "Get all apartments", description = "Retrieves paginated apartments with optional filters. Public endpoint.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Apartments retrieved successfully",
                    content = @Content(schema = @Schema(implementation = PageResponse.class)))
    })
    @GetMapping
    public ResponseEntity<PageResponse<ListingResponse>> getAllApartments(
            @Parameter(description = "Filter criteria") @ModelAttribute ListingFilterRequest filter,
            @Parameter(description = "Page number (0-indexed)") @RequestParam(name = "page", defaultValue = "0") int page,
            @Parameter(description = "Page size") @RequestParam(name = "size", defaultValue = "10") int size,
            @Parameter(description = "Fetch listings created after this timestamp (milliseconds since epoch). Used for real-time updates.") @RequestParam(name = "since", required = false) Long since,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        Pageable pageable = PageRequest.of(page, size);
        return ResponseEntity.ok(PageResponse.from(
                listingService.getAllListings(filter, pageable, since, userDetails != null ? userDetails.getUser() : null)
        ));
    }

    @Operation(summary = "Get apartment by ID", description = "Retrieves a single apartment by ID. Public endpoint.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Apartment retrieved successfully",
                    content = @Content(schema = @Schema(implementation = ListingResponse.class))),
            @ApiResponse(responseCode = "404", description = "Apartment not found")
    })
    @GetMapping("/{id}")
    public ResponseEntity<ListingResponse> getApartmentById(
            @Parameter(description = "Apartment ID") @PathVariable Long id,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        return ResponseEntity.ok(listingService.getListing(id, userDetails != null ? userDetails.getUser() : null));
    }

    @Operation(summary = "Create a new apartment", description = "Creates a new property apartment listing. Requires authentication (any role can create listings).")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Apartment created successfully",
                    content = @Content(schema = @Schema(implementation = ListingResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid input"),
            @ApiResponse(responseCode = "401", description = "Unauthorized - authentication required")
    })
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('HOST') or hasRole('ADMIN')")
    @PostMapping
    public ResponseEntity<ListingResponse> createApartment(
            @Valid @RequestBody ListingRequest request,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        if (userDetails == null || userDetails.getUser() == null) {
            return ResponseEntity.status(401).build();
        }
        return ResponseEntity.ok(listingService.createListing(request, userDetails.getUser()));
    }

    @Operation(summary = "Update an apartment", description = "Updates an existing apartment. Requires HOST role and ownership, or ADMIN role.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Apartment updated successfully",
                    content = @Content(schema = @Schema(implementation = ListingResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid input or unauthorized"),
            @ApiResponse(responseCode = "403", description = "Forbidden - HOST or ADMIN role required"),
            @ApiResponse(responseCode = "404", description = "Apartment not found")
    })
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('HOST') or hasRole('ADMIN')")
    @PutMapping("/{id}")
    public ResponseEntity<ListingResponse> updateApartment(
            @Parameter(description = "Apartment ID") @PathVariable Long id,
            @Valid @RequestBody ListingRequest request,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        return ResponseEntity.ok(listingService.updateListing(id, request, userDetails.getUser()));
    }

    @Operation(summary = "Delete an apartment", description = "Deletes an apartment. Requires HOST role and ownership, or ADMIN role.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "204", description = "Apartment deleted successfully"),
            @ApiResponse(responseCode = "400", description = "Unauthorized"),
            @ApiResponse(responseCode = "403", description = "Forbidden - HOST or ADMIN role required"),
            @ApiResponse(responseCode = "404", description = "Apartment not found")
    })
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('HOST') or hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteApartment(
            @Parameter(description = "Apartment ID") @PathVariable Long id,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        listingService.deleteListing(id, userDetails.getUser());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Get user's apartments", description = "Retrieves all apartments owned by the authenticated user. Requires authentication.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "User apartments retrieved successfully",
                    content = @Content(schema = @Schema(implementation = ListingResponse.class))),
            @ApiResponse(responseCode = "401", description = "Unauthorized - authentication required")
    })
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/my-listings")
    public ResponseEntity<List<ListingResponse>> getMyListings(
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        if (userDetails == null || userDetails.getUser() == null) {
            return ResponseEntity.ok(List.of());
        }
        
        return ResponseEntity.ok(listingService.getListingsForHost(userDetails.getUser()));
    }

    @Operation(summary = "Search apartments", description = "Searches apartments with optional query and filters. Public endpoint.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Search results retrieved successfully",
                    content = @Content(schema = @Schema(implementation = PageResponse.class)))
    })
    @GetMapping("/search")
    public ResponseEntity<PageResponse<ListingResponse>> searchApartments(
            @Parameter(description = "Search query") @RequestParam(required = false) String query,
            @Parameter(description = "Location filter") @RequestParam(required = false) String location,
            @Parameter(description = "Page number (0-indexed)") @RequestParam(name = "page", defaultValue = "0") int page,
            @Parameter(description = "Page size") @RequestParam(name = "size", defaultValue = "10") int size,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        // Create filter request with search parameters
        ListingFilterRequest filter = new ListingFilterRequest(
                location, // location
                null, // minPrice
                null, // maxPrice
                null, // amenities
                null, // startDate
                null  // endDate
        );
        
        Pageable pageable = PageRequest.of(page, size);
        return ResponseEntity.ok(PageResponse.from(listingService.searchListings(
                filter, query, pageable, userDetails != null ? userDetails.getUser() : null)));
    }
}

