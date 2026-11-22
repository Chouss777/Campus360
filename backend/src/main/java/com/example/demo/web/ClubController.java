package com.example.demo.web;

import com.example.demo.service.ClubService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class ClubController {
    private final ClubService clubs;
    public ClubController(ClubService clubs) { this.clubs = clubs; }

    @GetMapping("/clubs")
    List<Map<String, Object>> list() { return clubs.list(false); }
    @GetMapping("/clubs/{id}")
    Map<String, Object> detail(@PathVariable UUID id) { return clubs.detail(id); }
    @GetMapping("/admin/clubs")
    List<Map<String, Object>> adminList() { return clubs.list(true); }
    @PostMapping("/admin/clubs")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> create(@Valid @RequestBody Requests.Club input) { return clubs.save(null, input); }
    @PutMapping("/admin/clubs/{id}")
    Map<String, Object> update(@PathVariable UUID id, @Valid @RequestBody Requests.Club input) { return clubs.save(id, input); }
    @PutMapping("/admin/clubs/{id}/responsible")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void nominate(@PathVariable UUID id, @Valid @RequestBody Requests.Responsible input) { clubs.nominate(id, input.etudiantId()); }
    @PostMapping("/clubs/{id}/memberships")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> join(@PathVariable UUID id) { return clubs.join(id); }
    @GetMapping("/me/memberships")
    List<Map<String, Object>> mine() { return clubs.mine(); }
    @GetMapping("/clubs/{id}/memberships")
    List<Map<String, Object>> members(@PathVariable UUID id) { return clubs.members(id); }
    @PatchMapping("/clubs/{id}/memberships/{membershipId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void decide(@PathVariable UUID id, @PathVariable UUID membershipId, @Valid @RequestBody Requests.Membership input) { clubs.decide(id, membershipId, input.statut()); }
    @DeleteMapping("/clubs/{id}/memberships/{membershipId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void remove(@PathVariable UUID id, @PathVariable UUID membershipId) { clubs.remove(id, membershipId); }
}
