package com.example.demo.service;

import com.example.demo.data.CampusStore;
import com.example.demo.web.ApiException;
import com.example.demo.web.Requests;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AccountServiceTests {
    private final CampusStore store = mock(CampusStore.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final MailService mail = mock(MailService.class);
    private final AccountService accounts = new AccountService(store, mock(AccessService.class), passwords, mail);

    @Test
    void lookalikeUniversityDomainsAreRejected() {
        assertThrows(ApiException.class, () -> AccountService.universityEmail("test@usms.ma.example"));
        assertThrows(ApiException.class, () -> AccountService.universityEmail("test@sub.usms.ma"));
        assertEquals("test@usms.ma", AccountService.universityEmail("TEST@USMS.MA"));
    }

    @Test
    void passwordsOverTheBcryptByteLimitAreRejectedBeforePersistence() {
        var input = new Requests.Signup("Test", "Test", "test@usms.ma", "é".repeat(40), null);
        var failure = assertThrows(ApiException.class, () -> accounts.signup(input));
        assertEquals("PASSWORD_TOO_LONG", failure.code);
        verifyNoInteractions(store);
    }

    @Test
    void expiredOtpCannotVerifyAnAccount() {
        Map<String, Object> user = new HashMap<>();
        user.put("id", UUID.randomUUID());
        user.put("estVerifie", false);
        user.put("verificationExpiresAt", Instant.now().minusSeconds(1));
        user.put("verificationAttempts", 0);
        when(store.one(anyString(), any())).thenReturn(user);

        var failure = assertThrows(ApiException.class,
                () -> accounts.verify(new Requests.Verification("test@usms.ma", "123456")));

        assertEquals("OTP_EXPIRED", failure.code);
        verifyNoInteractions(passwords);
        verify(store, never()).update(anyString(), any());
    }

    @Test
    void repeatedWrongCodesAreCountedWithoutVerifyingTheUser() {
        UUID id = UUID.randomUUID();
        var user = Map.<String, Object>of("id", id, "estVerifie", false,
                "verificationExpiresAt", Instant.now().plusSeconds(600), "verificationAttempts", 0,
                "codeVerificationOtp", "hashed-code");
        when(store.one(anyString(), any())).thenReturn(user);
        when(passwords.matches("123456", "hashed-code")).thenReturn(false);

        var failure = assertThrows(ApiException.class,
                () -> accounts.verify(new Requests.Verification("test@usms.ma", "123456")));

        assertEquals("OTP_INVALID", failure.code);
        verify(store).update("UPDATE utilisateur SET verification_attempts = verification_attempts + 1 WHERE id = ?", id);
    }

    @Test
    void expiredVerificationCanBeResentAndQueuedForEmail() {
        UUID id = UUID.randomUUID();
        when(store.list(anyString(), any())).thenReturn(List.of(Map.of("id", id, "estVerifie", false,
                "verificationSentAt", Instant.now().minusSeconds(1000))));
        when(passwords.encode(anyString())).thenReturn("new-hash");

        accounts.resend("test@usms.ma");

        verify(mail).enqueue(eq("test@usms.ma"), contains("Vérifiez"), matches("(?s).*\\b[0-9]{6}\\b.*"));
    }
}
