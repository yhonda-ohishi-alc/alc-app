-- Integration test seed data
-- Runs AFTER migrations

SET search_path TO alc_api;

-- Test tenant
INSERT INTO tenants (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Test Tenant', 'test-tenant');

-- Test user (admin)
INSERT INTO users (id, tenant_id, google_sub, email, name, role) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'google-sub-test', 'test@example.com', 'Test Admin', 'admin');

-- Test employee
INSERT INTO employees (id, tenant_id, name, code, nfc_id) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Test Driver', 'E001', 'NFC-SEED-001');

-- Measurement
INSERT INTO measurements (id, tenant_id, employee_id, status) VALUES
  ('aaaaaaaa-0001-0001-0001-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'started');

-- Tenko schedule
INSERT INTO tenko_schedules (id, tenant_id, employee_id, tenko_type, responsible_manager_name, scheduled_at, instruction) VALUES
  ('aaaaaaaa-0002-0002-0002-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'pre_operation', 'Seed Manager', NOW() + interval '1 day', 'Seed instruction');

-- Tenko session (identity_verified is valid status)
INSERT INTO tenko_sessions (id, tenant_id, employee_id, schedule_id, tenko_type, status) VALUES
  ('aaaaaaaa-0003-0003-0003-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0002-0002-0002-aaaaaaaaaaaa', 'pre_operation', 'identity_verified');

-- Tenko record (record_data is NOT NULL JSONB)
INSERT INTO tenko_records (id, tenant_id, session_id, employee_id, employee_name, responsible_manager_name, tenko_type, status, record_data, record_hash, completed_at) VALUES
  ('aaaaaaaa-0004-0004-0004-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-0003-0003-0003-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333',
   'Test Driver', 'Seed Manager', 'pre_operation', 'completed', '{}', 'seed-hash', NOW());

-- Webhook config
INSERT INTO webhook_configs (id, tenant_id, event_type, url) VALUES
  ('aaaaaaaa-0005-0005-0005-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'tenko_completed', 'https://example.com/webhook-seed');

-- Equipment failure
INSERT INTO equipment_failures (id, tenant_id, failure_type, description) VALUES
  ('aaaaaaaa-0006-0006-0006-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'manual_report', 'Seed failure');

-- Device
INSERT INTO devices (id, tenant_id, device_name, status) VALUES
  ('aaaaaaaa-0007-0007-0007-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Seed Device', 'active');

-- Timecard card
INSERT INTO timecard_cards (id, tenant_id, card_id, employee_id) VALUES
  ('aaaaaaaa-0008-0008-0008-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'NFC-SEED-CARD', '33333333-3333-3333-3333-333333333333');

-- Carrying item
INSERT INTO carrying_items (id, tenant_id, item_name) VALUES
  ('aaaaaaaa-0009-0009-0009-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Seed Item');

-- Communication item (column is "content", not "body")
INSERT INTO communication_items (id, tenant_id, title, content) VALUES
  ('aaaaaaaa-000a-000a-000a-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Seed Notice', 'Seed content');

-- Guidance record
INSERT INTO guidance_records (id, tenant_id, employee_id, title) VALUES
  ('aaaaaaaa-000b-000b-000b-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'Seed Guidance');

-- Health baseline
INSERT INTO employee_health_baselines (tenant_id, employee_id, baseline_systolic, baseline_diastolic) VALUES
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 120, 80);

-- Device registration request (flow_type: qr_temp)
INSERT INTO device_registration_requests (id, tenant_id, registration_code, flow_type, status, expires_at) VALUES
  ('aaaaaaaa-000c-000c-000c-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'SEED-CODE', 'qr_temp', 'pending', NOW() + interval '1 hour');

-- ============================================================
-- Disposable resources for DELETE tests (dddddddd-* prefix)
-- Each DELETE test consumes one. Do not reference in GET/PUT tests.
-- ============================================================
INSERT INTO employees (id, tenant_id, name, code) VALUES
  ('dddddddd-0001-0001-0001-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'Del Employee', 'DEL1');
INSERT INTO tenko_schedules (id, tenant_id, employee_id, tenko_type, responsible_manager_name, scheduled_at, instruction) VALUES
  ('dddddddd-0002-0002-0002-dddddddddddd', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'post_operation', 'Del Manager', NOW() + interval '2 days', 'Del instruction');
INSERT INTO webhook_configs (id, tenant_id, event_type, url) VALUES
  ('dddddddd-0005-0005-0005-dddddddddddd', '11111111-1111-1111-1111-111111111111',
   'alcohol_detected', 'https://example.com/webhook-del');
INSERT INTO employee_health_baselines (tenant_id, employee_id, baseline_systolic) VALUES
  ('11111111-1111-1111-1111-111111111111', 'dddddddd-0001-0001-0001-dddddddddddd', 110);
INSERT INTO timecard_cards (id, tenant_id, card_id, employee_id) VALUES
  ('dddddddd-0008-0008-0008-dddddddddddd', '11111111-1111-1111-1111-111111111111',
   'NFC-DEL-CARD', '33333333-3333-3333-3333-333333333333');
INSERT INTO devices (id, tenant_id, device_name, status) VALUES
  ('dddddddd-0007-0007-0007-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'Del Device', 'active');
INSERT INTO carrying_items (id, tenant_id, item_name) VALUES
  ('dddddddd-0009-0009-0009-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'Del Item');
INSERT INTO guidance_records (id, tenant_id, employee_id, title) VALUES
  ('dddddddd-000b-000b-000b-dddddddddddd', '11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333', 'Del Guidance');
INSERT INTO communication_items (id, tenant_id, title, content) VALUES
  ('dddddddd-000a-000a-000a-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'Del Notice', 'Del content');
