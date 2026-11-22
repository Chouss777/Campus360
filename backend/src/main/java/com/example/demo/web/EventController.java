package com.example.demo.web;

import com.example.demo.service.EventService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class EventController {
    private final EventService events;
    public EventController(EventService events) { this.events = events; }

    @GetMapping("/events")
    List<Map<String, Object>> list(@RequestParam(defaultValue="") String q,
                                   @RequestParam(required=false) String categorie,
                                   @RequestParam(required=false) LocalDate date,
                                   @RequestParam(required=false) UUID clubId,
                                   @RequestParam(defaultValue="false") boolean disponibles) {
        return events.catalogue(q, categorie, date, clubId, disponibles);
    }
    @GetMapping("/events/{id}")
    Map<String, Object> detail(@PathVariable UUID id) { return events.detail(id); }
    @GetMapping("/managed/events")
    List<Map<String, Object>> managed() { return events.managed(false); }
    @GetMapping("/admin/events")
    List<Map<String, Object>> admin() { return events.managed(true); }
    @PostMapping("/events")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> create(@Valid @RequestBody Requests.Event input) { return events.save(null, input); }
    @PutMapping("/events/{id}")
    Map<String, Object> update(@PathVariable UUID id, @Valid @RequestBody Requests.Event input) { return events.save(id, input); }
    @PostMapping("/admin/events/{id}/withdraw")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void withdraw(@PathVariable UUID id) { events.withdraw(id); }
    @PostMapping("/admin/events/{id}/suspend")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void suspend(@PathVariable UUID id) { events.suspend(id); }
    @PostMapping("/admin/events/{id}/restore")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void restore(@PathVariable UUID id) { events.restore(id); }
    @PostMapping("/admin/events/{id}/validate")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void validate(@PathVariable UUID id) { events.validate(id); }
    @PostMapping("/events/{id}/registrations")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> register(@PathVariable UUID id) { return events.register(id); }
    @GetMapping("/me/registrations")
    List<Map<String, Object>> planning() { return events.planning(); }
    @DeleteMapping("/me/registrations/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cancel(@PathVariable UUID id) { events.cancel(id); }
}
