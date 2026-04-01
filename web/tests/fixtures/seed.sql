-- Integration test seed data
-- Runs AFTER migrations, using alc_api_app role context

SET search_path TO alc_api;

-- Test tenant
INSERT INTO tenants (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Test Tenant', 'test-tenant');

-- Test user (admin)
INSERT INTO users (id, tenant_id, google_sub, email, name, role) VALUES
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
   'google-sub-test', 'test@example.com', 'Test Admin', 'admin');

-- Test employees
INSERT INTO employees (id, tenant_id, name, code) VALUES
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Test Driver', 'E001');

-- Grant RLS access for integration tests
-- (postgres superuser bypasses RLS, but alc_api_app does not)
