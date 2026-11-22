package com.example.demo.web;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HealthControllerTests {

    @Test
    void reportsHealthyOnlyWhenTheDatabaseQuerySucceeds() {
        EntityManager entityManager = mock(EntityManager.class);
        Query query = mock(Query.class);
        when(entityManager.createNativeQuery("SELECT 1")).thenReturn(query);
        when(query.getSingleResult()).thenReturn(1);

        var response = new HealthController(entityManager).health();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(new HealthController.HealthResponse("UP", "UP"), response.getBody());
    }

    @Test
    void reportsUnavailableWhenTheDatabaseQueryFails() {
        EntityManager entityManager = mock(EntityManager.class);
        when(entityManager.createNativeQuery("SELECT 1"))
                .thenThrow(new IllegalStateException("Database unavailable"));

        var response = new HealthController(entityManager).health();

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
        assertEquals(new HealthController.HealthResponse("DOWN", "DOWN"), response.getBody());
    }
}
