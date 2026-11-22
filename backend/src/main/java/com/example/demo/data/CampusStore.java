package com.example.demo.data;

import com.example.demo.web.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Repository
public class CampusStore {
    private final JdbcTemplate jdbc;

    public CampusStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Map<String, Object>> list(String sql, Object... parameters) {
        return jdbc.query(sql, (row, index) -> readRow(row), parameters);
    }

    public Map<String, Object> one(String sql, Object... parameters) {
        var results = list(sql, parameters);
        if (results.isEmpty()) throw new ApiException(404, "NOT_FOUND", "Ressource introuvable.");
        return results.getFirst();
    }

    public int update(String sql, Object... parameters) {
        return jdbc.update(sql, parameters);
    }

    public boolean exists(String sql, Object... parameters) {
        return !list(sql, parameters).isEmpty();
    }

    private Map<String, Object> readRow(ResultSet row) throws SQLException {
        Map<String, Object> result = new LinkedHashMap<>();
        var metadata = row.getMetaData();
        for (int index = 1; index <= metadata.getColumnCount(); index++) {
            String key = metadata.getColumnLabel(index);
            StringBuilder name = new StringBuilder();
            boolean uppercase = false;
            for (char character : key.toCharArray()) {
                if (character == '_') {
                    uppercase = true;
                } else {
                    name.append(uppercase ? Character.toUpperCase(character) : character);
                    uppercase = false;
                }
            }
            Object value = row.getObject(index);
            if (value instanceof Timestamp timestamp) value = timestamp.toInstant();
            if (value instanceof java.sql.Array array) {
                value = new ArrayList<>(List.of((Object[]) array.getArray()));
                array.free();
            }
            result.put(name.toString(), value);
        }
        return result;
    }
}
