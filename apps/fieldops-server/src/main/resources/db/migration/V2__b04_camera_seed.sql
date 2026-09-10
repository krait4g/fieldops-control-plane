CREATE TABLE b04_camera (
    tenant_id VARCHAR(64) NOT NULL,
    site_id VARCHAR(64) NOT NULL,
    camera_id VARCHAR(64) NOT NULL,
    name VARCHAR(128) NOT NULL,
    zone_name VARCHAR(128) NOT NULL,
    protocol VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    PRIMARY KEY (tenant_id, camera_id),
    UNIQUE (tenant_id, site_id, camera_id),
    FOREIGN KEY (tenant_id, site_id) REFERENCES b02_site(tenant_id, site_id)
);

INSERT INTO b04_camera VALUES
    ('tenant-a', 'site-a', 'camera-a-01', 'Greenhouse Camera 01', 'Bed A', 'ONVIF',
     '2026-09-09T00:00:00Z', '2026-09-09T00:00:00Z');

INSERT INTO b02_membership_permission VALUES
    ('${oidcIssuer}', '00000000-0000-0000-0000-0000000000a1', 'tenant-a', 'CAMERA_READ'),
    ('${oidcIssuer}', '00000000-0000-0000-0000-0000000000a1', 'tenant-a', 'CAMERA_CONTROL'),
    ('${oidcIssuer}', '00000000-0000-0000-0000-0000000000b2', 'tenant-a', 'CAMERA_READ');
