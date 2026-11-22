package com.example.demo.web;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ProblemDetail;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ProblemDetail uploadTooLarge(MaxUploadSizeExceededException exception) {
        return ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(413), "Choisissez une image de 2 Mo maximum.");
    }
    @ExceptionHandler(ApiException.class)
    ProblemDetail business(ApiException exception) {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(exception.status), exception.getMessage());
        problem.setProperty("code", exception.code);
        return problem;
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail validation(MethodArgumentNotValidException exception) {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(422), "Vérifiez les champs du formulaire.");
        problem.setProperty("code", "VALIDATION");
        problem.setProperty("errors", exception.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + " " + error.getDefaultMessage()).toList());
        return problem;
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ProblemDetail malformed(Exception exception) {
        return ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(400), "Format de requête invalide.");
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail conflict(DataIntegrityViolationException exception) {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(409), "Cette opération entre en conflit avec les données existantes.");
        problem.setProperty("code", "CONFLICT");
        return problem;
    }
}
