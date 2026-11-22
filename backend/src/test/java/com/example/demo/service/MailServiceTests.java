package com.example.demo.service;

import com.example.demo.data.CampusStore;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MailServiceTests {
    @Test
    void smtpFailureKeepsTheMessageQueuedForRetry() {
        CampusStore store = mock(CampusStore.class);
        JavaMailSender sender = mock(JavaMailSender.class);
        UUID id = UUID.randomUUID();
        when(store.list(anyString())).thenReturn(List.of(Map.of("id", id,
                "recipient", "test@usms.ma", "subject", "Confirmation", "body", "Inscription confirmée")));
        doThrow(new MailSendException("SMTP unavailable")).when(sender).send(any(SimpleMailMessage.class));

        new MailService(store, sender, "campus360@usms.ma").deliver();

        verify(store).update("UPDATE outbound_email SET next_attempt_at = now() + interval '30 seconds' WHERE id = ?", id);
        verify(store, never()).update("DELETE FROM outbound_email WHERE id = ?", id);
    }
}
