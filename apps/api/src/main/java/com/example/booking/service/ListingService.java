package com.example.booking.service;

import com.example.booking.dto.listing.ListingFilterRequest;
import com.example.booking.dto.listing.ListingRequest;
import com.example.booking.dto.listing.ListingResponse;
import com.example.booking.entity.User;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Set;

public interface ListingService {
    ListingResponse createListing(ListingRequest request, User host);
    ListingResponse updateListing(Long id, ListingRequest request, User host);
    void deleteListing(Long id, User host);
    ListingResponse getListing(Long id, User currentUser);
    Page<ListingResponse> getAllListings(ListingFilterRequest filter, Pageable pageable, Long since, User currentUser);
    Page<ListingResponse> searchListings(ListingFilterRequest filter, String query, Pageable pageable, User currentUser);
    List<ListingResponse> getListingsForHost(User host);
    Set<String> addPhotos(Long listingId, User host, List<MultipartFile> files);
    void removePhoto(Long listingId, Long photoId, User host);
}
