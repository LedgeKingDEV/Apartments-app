package com.example.booking.controller;

import com.example.booking.dto.common.PageResponse;
import com.example.booking.dto.listing.ListingFilterRequest;
import com.example.booking.dto.listing.ListingRequest;
import com.example.booking.dto.listing.ListingResponse;
import com.example.booking.model.Amenity;
import com.example.booking.model.Policy;
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
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/listings")
@Tag(name = "Listings", description = "Property listing management endpoints")
public class ListingController {

    private final ListingService listingService;

    public ListingController(ListingService listingService) {
        this.listingService = listingService;
    }

    @Operation(summary = "Create a new listing", description = "Creates a new property listing. Requires authentication (any role can create listings).")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Listing created successfully",
                    content = @Content(schema = @Schema(implementation = ListingResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid input"),
            @ApiResponse(responseCode = "401", description = "Unauthorized - authentication required")
    })
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('HOST') or hasRole('ADMIN')")
    @PostMapping
    public ResponseEntity<ListingResponse> createListing(@Valid @RequestBody ListingRequest request,
                                                         @AuthenticationPrincipal BookingUserDetails userDetails) {
        if (userDetails == null || userDetails.getUser() == null) {
            return ResponseEntity.status(401).build();
        }
        return ResponseEntity.ok(listingService.createListing(request, userDetails.getUser()));
    }

    @Operation(summary = "Update a listing", description = "Updates an existing listing. Requires HOST role and ownership, or ADMIN role (can bypass ownership).")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Listing updated successfully",
                    content = @Content(schema = @Schema(implementation = ListingResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid input or unauthorized"),
            @ApiResponse(responseCode = "403", description = "Forbidden - HOST or ADMIN role required"),
            @ApiResponse(responseCode = "404", description = "Listing not found")
    })
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('HOST') or hasRole('ADMIN')")
    @PutMapping("/{id}")
    public ResponseEntity<ListingResponse> updateListing(
            @Parameter(description = "Listing ID") @PathVariable Long id,
            @Valid @RequestBody ListingRequest request,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        return ResponseEntity.ok(listingService.updateListing(id, request, userDetails.getUser()));
    }

    @Operation(summary = "Delete a listing", description = "Deletes a listing. Requires HOST role and ownership, or ADMIN role (can bypass ownership).")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "204", description = "Listing deleted successfully"),
            @ApiResponse(responseCode = "400", description = "Unauthorized"),
            @ApiResponse(responseCode = "403", description = "Forbidden - HOST or ADMIN role required"),
            @ApiResponse(responseCode = "404", description = "Listing not found")
    })
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('HOST') or hasRole('ADMIN')")
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteListing(
            @Parameter(description = "Listing ID") @PathVariable Long id,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        listingService.deleteListing(id, userDetails.getUser());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Get listing vocabulary", description = "Returns available amenities and policies for listings")
    @ApiResponse(responseCode = "200", description = "Vocabulary retrieved successfully")
    @GetMapping("/vocab")
    public ResponseEntity<Map<String, Set<String>>> getListingVocabulary() {
        return ResponseEntity.ok(Map.of(
                "amenities", Amenity.names(),
                "policies", Policy.names()
        ));
    }

    @Operation(summary = "Get a listing by ID", description = "Retrieves a single listing by ID. Public endpoint.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Listing retrieved successfully",
                    content = @Content(schema = @Schema(implementation = ListingResponse.class))),
            @ApiResponse(responseCode = "404", description = "Listing not found")
    })
    @GetMapping("/{id}")
    public ResponseEntity<ListingResponse> getListing(
            @Parameter(description = "Listing ID") @PathVariable Long id,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        return ResponseEntity.ok(listingService.getListing(id, userDetails != null ? userDetails.getUser() : null));
    }

    @Operation(summary = "Search and filter listings", 
            description = "Retrieves paginated listings with optional filters (location, price, dates, amenities). Public endpoint.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Listings retrieved successfully",
                    content = @Content(schema = @Schema(implementation = PageResponse.class)))
    })
    @GetMapping
    public ResponseEntity<PageResponse<ListingResponse>> getListings(
            @Parameter(description = "Filter criteria") @ModelAttribute ListingFilterRequest filter,
            @Parameter(description = "Page number (0-indexed)") @RequestParam(name = "page", defaultValue = "0") int page,
            @Parameter(description = "Page size") @RequestParam(name = "size", defaultValue = "10") int size,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        Pageable pageable = PageRequest.of(page, size);
        return ResponseEntity.ok(PageResponse.from(
                listingService.getAllListings(filter, pageable, null, userDetails != null ? userDetails.getUser() : null)
        ));
    }

    @Operation(summary = "Get user's listings", description = "Retrieves all listings owned by the authenticated user. Requires authentication.")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "User listings retrieved successfully",
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
        Pageable pageable = Pageable.unpaged();
        var allListings = listingService.getAllListings(null, pageable, null, userDetails.getUser());
        Long currentUserId = userDetails.getUser().getId();
        List<ListingResponse> myListings = allListings.getContent().stream()
                .filter(listing -> listing.hostId() != null && listing.hostId().equals(currentUserId))
                .toList();
        return ResponseEntity.ok(myListings);
    }

    @Operation(summary = "Add photos to a listing", description = "Uploads one or more photos for a listing. Requires HOST role and ownership, or ADMIN role (can bypass ownership).")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "200", description = "Photos uploaded successfully"),
            @ApiResponse(responseCode = "400", description = "Invalid file or unauthorized"),
            @ApiResponse(responseCode = "403", description = "Forbidden - HOST or ADMIN role required"),
            @ApiResponse(responseCode = "404", description = "Listing not found")
    })
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('HOST') or hasRole('ADMIN')")
    @PostMapping("/{id}/photos")
    public ResponseEntity<Set<String>> addPhotos(
            @Parameter(description = "Listing ID") @PathVariable Long id,
            @Parameter(description = "Photo files to upload") @RequestParam(name = "files") List<MultipartFile> files,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        return ResponseEntity.ok(listingService.addPhotos(id, userDetails.getUser(), files));
    }

    @Operation(summary = "Delete a listing photo", description = "Removes a photo from a listing. Requires HOST role and ownership, or ADMIN role (can bypass ownership).")
    @ApiResponses(value = {
            @ApiResponse(responseCode = "204", description = "Photo deleted successfully"),
            @ApiResponse(responseCode = "400", description = "Unauthorized"),
            @ApiResponse(responseCode = "403", description = "Forbidden - HOST or ADMIN role required"),
            @ApiResponse(responseCode = "404", description = "Listing or photo not found")
    })
    @SecurityRequirement(name = "bearerAuth")
    @PreAuthorize("hasRole('HOST') or hasRole('ADMIN')")
    @DeleteMapping("/{id}/photos/{photoId}")
    public ResponseEntity<Void> deletePhoto(
            @Parameter(description = "Listing ID") @PathVariable Long id,
            @Parameter(description = "Photo ID") @PathVariable Long photoId,
            @AuthenticationPrincipal BookingUserDetails userDetails) {
        listingService.removePhoto(id, photoId, userDetails.getUser());
        return ResponseEntity.noContent().build();
    }
}
