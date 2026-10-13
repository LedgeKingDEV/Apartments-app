package com.example.booking.service.impl;

import com.example.booking.dto.booking.BookingListingSummary;
import com.example.booking.dto.booking.BookingRequest;
import com.example.booking.dto.booking.BookingResponse;
import com.example.booking.entity.Booking;
import com.example.booking.entity.Listing;
import com.example.booking.entity.User;
import com.example.booking.exception.BadRequestException;
import com.example.booking.exception.ResourceNotFoundException;
import com.example.booking.repository.BookingRepository;
import com.example.booking.repository.ListingRepository;
import com.example.booking.service.AuditService;
import com.example.booking.service.BookingService;
import com.example.booking.service.WalletService;
import com.example.booking.util.SecurityUtils;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Service
public class BookingServiceImpl implements BookingService {

    private final BookingRepository bookingRepository;
    private final ListingRepository listingRepository;
    private final WalletService walletService;
    private final AuditService auditService;

    public BookingServiceImpl(BookingRepository bookingRepository, 
                             ListingRepository listingRepository,
                             WalletService walletService,
                             AuditService auditService) {
        this.bookingRepository = bookingRepository;
        this.listingRepository = listingRepository;
        this.walletService = walletService;
        this.auditService = auditService;
    }

    @Override
    @Transactional
    public BookingResponse createBooking(BookingRequest request, User user) {
        Listing listing = listingRepository.findByIdForBooking(request.getListingId())
                .orElseThrow(() -> new ResourceNotFoundException("Listing not found with ID: " + request.getListingId() + 
                        ". The listing may have been deleted or the ID may be incorrect."));

        validateDates(request.getStartDate(), request.getEndDate());
        validateAvailability(listing.getId(), request.getStartDate(), request.getEndDate());

        long nights = ChronoUnit.DAYS.between(request.getStartDate(), request.getEndDate());
        BigDecimal dailyPrice = listing.getPrice();
        if (dailyPrice == null || dailyPrice.signum() <= 0) {
            throw new BadRequestException("This listing does not have a valid nightly price and cannot be booked.");
        }
        BigDecimal calculatedTotal = dailyPrice.multiply(BigDecimal.valueOf(nights));

        Booking booking = Booking.builder()
                .user(user)
                .listing(listing)
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .totalPrice(calculatedTotal)
                .build();

        return toResponse(bookingRepository.save(booking));
    }

    @Override
    public BookingResponse getBooking(Long id, User user) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found with ID: " + id +
                        ". The booking may have been cancelled or deleted, or the ID may be incorrect."));

        boolean isGuest = booking.getUser().getId().equals(user.getId());
        boolean isHost = booking.getListing().getHost() != null &&
                booking.getListing().getHost().getId().equals(user.getId());
        boolean isAdmin = SecurityUtils.isAdmin();

        if (!isGuest && !isHost && !isAdmin) {
            throw new BadRequestException("You do not have permission to view this booking. " +
                    "Only the guest who made the booking, the listing host, or an administrator can view booking details.");
        }

        return toResponse(booking);
    }

    @Override
    public Page<BookingResponse> getBookingsForUser(Long userId, Pageable pageable, String status) {
        Page<Booking> bookings;
        LocalDate today = LocalDate.now();
        if (status == null || status.isBlank()) {
            bookings = bookingRepository.findByUserId(userId, pageable);
        } else {
            String normalized = status.trim().toUpperCase();
            switch (normalized) {
                case "PAST" -> bookings = bookingRepository.findByUserIdAndEndDateBefore(userId, today, pageable);
                case "UPCOMING" -> bookings = bookingRepository.findByUserIdAndStartDateAfter(userId, today, pageable);
                case "CURRENT" -> bookings = bookingRepository.findByUserIdAndStartDateLessThanEqualAndEndDateGreaterThanEqual(userId, today, today, pageable);
                default -> throw new BadRequestException("Invalid booking status filter: '" + status + 
                        "'. Allowed values are: PAST (completed bookings), CURRENT (ongoing bookings), or UPCOMING (future bookings).");
            }
        }
        return bookings.map(this::toResponse);
    }

    @Override
    public void cancelBooking(Long id, User user) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found with ID: " + id + 
                        ". The booking may have been cancelled or deleted, or the ID may be incorrect."));

        boolean isAdminAction = SecurityUtils.isAdmin() && 
                !booking.getUser().getId().equals(user.getId()) &&
                (booking.getListing().getHost() == null || !booking.getListing().getHost().getId().equals(user.getId()));

        if (!isAdminAction && !booking.getUser().getId().equals(user.getId()) &&
                (booking.getListing().getHost() == null || !booking.getListing().getHost().getId().equals(user.getId()))) {
            throw new BadRequestException("You do not have permission to cancel this booking. " +
                    "Only the guest who made the booking, the listing host, or an administrator can cancel a booking.");
        }

        // Process refund if payment was made
        try {
            String reason = isAdminAction ? "Booking cancelled by admin" : 
                    "Booking cancelled by " + (user.getId().equals(booking.getUser().getId()) ? "guest" : "host");
            walletService.processRefund(id, reason);
        } catch (Exception e) {
            // Log error but don't fail cancellation if refund fails
            // In production, you'd want proper logging here
        }

        bookingRepository.delete(booking);
        
        if (isAdminAction) {
            auditService.logAdminAction(user, "BOOKING_CANCEL", "Booking", id, 
                    String.format("Admin cancelled booking #%d (guest: %d, host: %d)", id, 
                            booking.getUser().getId(), 
                            booking.getListing().getHost() != null ? booking.getListing().getHost().getId() : null));
        }
    }

    @Override
    public void completeBooking(Long id, User user) {
        Booking booking = bookingRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found with ID: " + id + 
                        ". The booking may have been cancelled or deleted, or the ID may be incorrect."));

        boolean isAdminAction = SecurityUtils.isAdmin() && 
                (booking.getListing().getHost() == null || !booking.getListing().getHost().getId().equals(user.getId()));

        if (!isAdminAction && (booking.getListing().getHost() == null || !booking.getListing().getHost().getId().equals(user.getId()))) {
            throw new BadRequestException("Only the listing host or an administrator can mark this booking as complete. " +
                    "You must be the owner of the listing to perform this action.");
        }

        User host = isAdminAction ? booking.getListing().getHost() : user;
        walletService.processEscrowRelease(booking.getId(), host != null ? host : user);
        
        if (isAdminAction) {
            auditService.logAdminAction(user, "BOOKING_COMPLETE", "Booking", id, 
                    String.format("Admin completed booking #%d (host: %d)", id, 
                            booking.getListing().getHost() != null ? booking.getListing().getHost().getId() : null));
        }
    }

    private BookingResponse toResponse(Booking booking) {
        Listing listing = booking.getListing();
        return BookingResponse.builder()
                .id(booking.getId())
                .listingId(listing.getId())
                .userId(booking.getUser().getId())
                .startDate(booking.getStartDate())
                .endDate(booking.getEndDate())
                .totalPrice(booking.getTotalPrice())
                .status(determineStatus(booking.getStartDate(), booking.getEndDate()))
                .listing(BookingListingSummary.builder()
                        .id(listing.getId())
                        .title(listing.getTitle())
                        .location(listing.getLocation())
                        .price(listing.getPrice())
                        .averageRating(listing.getAverageRating())
                        .reviewCount(listing.getReviewCount())
                        .build())
                .build();
    }

    private String determineStatus(LocalDate startDate, LocalDate endDate) {
        LocalDate today = LocalDate.now();
        if (endDate.isBefore(today)) {
            return "PAST";
        }
        if (startDate.isAfter(today)) {
            return "UPCOMING";
        }
        return "CURRENT";
    }

    private void validateDates(LocalDate startDate, LocalDate endDate) {
        if (endDate.isBefore(startDate) || endDate.equals(startDate)) {
            throw new BadRequestException("The end date must be after the start date. " +
                    "Please select a valid date range for your booking.");
        }
    }

    private void validateAvailability(Long listingId, LocalDate startDate, LocalDate endDate) {
        List<Booking> overlapping = bookingRepository.findOverlappingBookings(listingId, startDate, endDate);
        if (!overlapping.isEmpty()) {
            throw new BadRequestException("The listing is already booked for the selected dates (" + 
                    startDate + " to " + endDate + "). Please choose different dates or check the listing's availability calendar.");
        }
    }
}
