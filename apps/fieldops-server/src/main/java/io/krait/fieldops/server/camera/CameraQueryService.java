package io.krait.fieldops.server.camera;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

@Service
@Profile("b04-camera")
public class CameraQueryService {
    private final JdbcClient jdbc;

    public CameraQueryService(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<CameraRow> list(String tenantId, String siteId) {
        return jdbc.sql("""
                SELECT camera_id, tenant_id, site_id, name, zone_name, protocol
                FROM b04_camera
                WHERE tenant_id = :tenantId AND site_id = :siteId
                ORDER BY camera_id
                """)
                .param("tenantId", tenantId)
                .param("siteId", siteId)
                .query(CameraQueryService::row)
                .list();
    }

    public CameraRow get(String tenantId, String cameraId) {
        return jdbc.sql("""
                SELECT camera_id, tenant_id, site_id, name, zone_name, protocol
                FROM b04_camera
                WHERE tenant_id = :tenantId AND camera_id = :cameraId
                """)
                .param("tenantId", tenantId)
                .param("cameraId", cameraId)
                .query(CameraQueryService::row)
                .optional()
                .orElseThrow(CameraNotFoundException::new);
    }

    private static CameraRow row(java.sql.ResultSet result, int ignored) throws java.sql.SQLException {
        return new CameraRow(result.getString("camera_id"), result.getString("tenant_id"),
                result.getString("site_id"), result.getString("name"),
                result.getString("zone_name"), result.getString("protocol"));
    }

    public record CameraRow(String id, String tenantId, String siteId, String name,
            String zoneName, String protocol) {}
}
