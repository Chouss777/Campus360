package com.example.demo.service;

import com.example.demo.data.CampusStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MailService {
    private static final Logger log = LoggerFactory.getLogger(MailService.class);
    private final CampusStore store;
    private final JavaMailSender sender;
    private final String from;

    public MailService(CampusStore store, JavaMailSender sender,
                       @Value("${campus360.mail.from:campus360@usms.ma}") String from) {
        this.store = store;
        this.sender = sender;
        this.from = from;
    }

    public void enqueue(String recipient, String subject, String body) {
        store.update("INSERT INTO outbound_email(recipient, subject, body) VALUES (?, ?, ?)", recipient, subject, body);
    }

    @Scheduled(fixedDelay=5000)
    @Transactional
    public void deliver() {
        var messages = store.list("SELECT * FROM outbound_email WHERE next_attempt_at <= now() ORDER BY next_attempt_at LIMIT 10 FOR UPDATE SKIP LOCKED");
        for (var row : messages) {
            try {
                var message = new SimpleMailMessage();
                message.setFrom(from);
                message.setTo((String) row.get("recipient"));
                message.setSubject((String) row.get("subject"));
                message.setText((String) row.get("body"));
                sender.send(message);
                store.update("DELETE FROM outbound_email WHERE id = ?", row.get("id"));
            } catch (RuntimeException exception) {
                store.update("UPDATE outbound_email SET next_attempt_at = now() + interval '30 seconds' WHERE id = ?", row.get("id"));
                log.warn("Email delivery failed for queued message {}. Delivery will be retried.", row.get("id"));
            }
        }
    }
}
