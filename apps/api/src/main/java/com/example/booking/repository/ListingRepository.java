package com.example.booking.repository;

import com.example.booking.entity.Listing;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.List;

public interface ListingRepository extends JpaRepository<Listing, Long>, JpaSpecificationExecutor<Listing> {

    List<Listing> findByHostId(Long hostId);

    /** Serializes booking availability checks for a listing across concurrent requests. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT l FROM Listing l WHERE l.id = :listingId")
    Optional<Listing> findByIdForBooking(@Param("listingId") Long listingId);

    @Query("""
            SELECT l FROM Listing l
            WHERE LOWER(l.title) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(l.location) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(COALESCE(l.hostName, '')) LIKE LOWER(CONCAT('%', :q, '%'))
            """)
    Page<Listing> search(@Param("q") String q, Pageable pageable);
}
