INSERT INTO b02_device(
    tenant_id, site_id, device_id, external_id, name, type_code, type_name,
    zone_id, zone_name, protocol, created_at, updated_at, version)
VALUES (
    'tenant-a', 'site-a', 'device-a-soil-tcp-01', 'A-SOIL-TCP-01',
    'A Soil Sensor TCP 01', 'SOIL_SENSOR', 'Soil sensor',
    'zone-c', 'Bed C', 'TCP_BINARY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
ON CONFLICT (tenant_id, device_id) DO UPDATE SET
    site_id = EXCLUDED.site_id,
    external_id = EXCLUDED.external_id,
    name = EXCLUDED.name,
    type_code = EXCLUDED.type_code,
    type_name = EXCLUDED.type_name,
    zone_id = EXCLUDED.zone_id,
    zone_name = EXCLUDED.zone_name,
    protocol = EXCLUDED.protocol,
    updated_at = CURRENT_TIMESTAMP;
