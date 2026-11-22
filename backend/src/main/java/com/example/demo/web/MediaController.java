package com.example.demo.web;

import com.example.demo.service.AccessService;
import com.example.demo.data.CampusStore;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import javax.imageio.ImageIO;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class MediaController {
    private final Path directory;
    private final AccessService access;
    private final CampusStore store;

    public MediaController(@Value("${campus360.upload-dir}") String directory, AccessService access, CampusStore store) {
        this.directory = Path.of(directory).toAbsolutePath().normalize();
        this.access = access;
        this.store = store;
    }

    @PostMapping(value="/media", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public Map<String, String> upload(@RequestParam MultipartFile image) throws IOException {
        var user = access.current();
        if (!"ETUDIANT".equals(user.get("role")) && !"ADMINISTRATEUR".equals(user.get("role"))) throw new ApiException(403, "FORBIDDEN", "Accès non autorisé.");
        if (image.isEmpty() || image.getSize() > 2 * 1024 * 1024) throw new ApiException(422, "IMAGE_SIZE", "Choisissez une image PNG ou JPEG de 2 Mo maximum.");
        String extension;
        try (var stream = ImageIO.createImageInputStream(image.getInputStream())) {
            var readers = ImageIO.getImageReaders(stream);
            if (!readers.hasNext()) throw new ApiException(422, "IMAGE_INVALID", "Image PNG ou JPEG requise.");
            var reader = readers.next();
            try {
                reader.setInput(stream);
                String format = reader.getFormatName();
                if (!format.equalsIgnoreCase("png") && !format.equalsIgnoreCase("jpeg")) throw new ApiException(422, "IMAGE_INVALID", "Image PNG ou JPEG requise.");
                if (reader.getWidth(0) > 4096 || reader.getHeight(0) > 4096) throw new ApiException(422, "IMAGE_DIMENSIONS", "Dimensions maximales de 4096 × 4096 pixels.");
                extension = format.equalsIgnoreCase("png") ? ".png" : ".jpg";
            } finally {
                reader.dispose();
            }
        }
        Files.createDirectories(directory);
        String name = UUID.randomUUID() + extension;
        Path file = directory.resolve(name);
        try (var input = image.getInputStream()) {
            Files.copy(input, file);
            store.update("INSERT INTO uploaded_media(filename, owner_id, public_read) VALUES (?, ?, ?)", name, user.get("id"), "ADMINISTRATEUR".equals(user.get("role")));
        } catch (IOException | RuntimeException exception) {
            Files.deleteIfExists(file);
            throw exception;
        }
        return Map.of("url", "/api/v1/media/" + name);
    }

    @GetMapping("/media/{name}")
    public ResponseEntity<Resource> read(@PathVariable String name) {
        if (!name.matches("[a-f0-9-]{36}\\.(png|jpg)")) throw new ApiException(404, "NOT_FOUND", "Image introuvable.");
        var metadata = store.one("SELECT owner_id, public_read FROM uploaded_media WHERE filename = ?", name);
        if (!Boolean.TRUE.equals(metadata.get("publicRead")) && !access.current().get("id").equals(metadata.get("ownerId"))) {
            throw new ApiException(403, "IMAGE_FORBIDDEN", "Accès non autorisé à cette image.");
        }
        Path file = directory.resolve(name).normalize();
        if (!file.startsWith(directory) || !Files.isRegularFile(file)) throw new ApiException(404, "NOT_FOUND", "Image introuvable.");
        MediaType type = name.endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG;
        return ResponseEntity.ok().contentType(type).body(new FileSystemResource(file));
    }
}
