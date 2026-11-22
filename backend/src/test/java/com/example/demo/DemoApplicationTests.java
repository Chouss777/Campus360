package com.example.demo;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.beans.factory.annotation.Autowired;
import com.example.demo.web.HealthController;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
class DemoApplicationTests {

	@Autowired
	private HealthController healthController;

	@Test
	void contextLoads() {
		assertEquals(HttpStatus.OK, healthController.health().getStatusCode());
	}

}
