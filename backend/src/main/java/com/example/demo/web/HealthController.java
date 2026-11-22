package com.example.demo.web;

import jakarta.persistence.EntityManager;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    private final EntityManager entityManager;

    public HealthController(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    @GetMapping("/api/v1/health")
    public ResponseEntity<HealthResponse> health() {
        try {
            entityManager.createNativeQuery("SELECT 1").getSingleResult();
            return ResponseEntity.ok(new HealthResponse("UP", "UP"));
        } catch (RuntimeException exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(new HealthResponse("DOWN", "DOWN"));
        }
    }

    public record HealthResponse(String status, String database) {
    }
}
