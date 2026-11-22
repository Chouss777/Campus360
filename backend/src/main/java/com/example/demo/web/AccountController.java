package com.example.demo.web;

import com.example.demo.service.AccountService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class AccountController {
    private final AccountService accounts;
    private final SessionRegistry sessions;

    public AccountController(AccountService accounts, SessionRegistry sessions) {
        this.accounts = accounts;
        this.sessions = sessions;
    }

    @GetMapping("/auth/csrf")
    Map<String, String> csrf(CsrfToken token) { return Map.of("token", token.getToken()); }

    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> signup(@Valid @RequestBody Requests.Signup input) { return accounts.signup(input); }

    @PostMapping("/auth/verify")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void verify(@Valid @RequestBody Requests.Verification input) { accounts.verify(input); }

    @PostMapping("/auth/verification/resend")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void resend(@Valid @RequestBody Requests.EmailInput input) { accounts.resend(input.email()); }

    @PostMapping("/auth/session")
    Map<String, Object> login(@Valid @RequestBody Requests.Login input, HttpServletRequest request) {
        var user = accounts.authenticate(input);
        var session = request.getSession(true);
        sessions.removeSessionInformation(session.getId());
        request.changeSessionId();
        var authentication = UsernamePasswordAuthenticationToken.authenticated(user.get("id").toString(), null,
                List.of(new SimpleGrantedAuthority("ROLE_" + user.get("role"))));
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
        sessions.registerNewSession(session.getId(), user.get("id").toString());
        return accounts.me();
    }

    @DeleteMapping("/auth/session")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout(HttpServletRequest request) {
        var session = request.getSession(false);
        if (session != null) {
            sessions.removeSessionInformation(session.getId());
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
    }

    @GetMapping("/me")
    Map<String, Object> me() { return accounts.me(); }

    @PatchMapping("/me/profile")
    Map<String, Object> profile(@Valid @RequestBody Requests.Profile input) { return accounts.updateProfile(input); }

    @GetMapping("/admin/users")
    List<Map<String, Object>> users(@RequestParam(defaultValue="") String q,
                                    @RequestParam(required=false) String role,
                                    @RequestParam(required=false) Boolean actif) {
        return accounts.users(q, role, actif);
    }

    @PatchMapping("/admin/users/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void update(@PathVariable UUID id, @Valid @RequestBody Requests.Account input) {
        accounts.updateAccount(id, input);
        // Expire every existing session after a suspension or role change.
        if (Boolean.FALSE.equals(input.actif()) || input.role() != null) {
            sessions.getAllSessions(id.toString(), false).forEach(session -> session.expireNow());
        }
    }
}
