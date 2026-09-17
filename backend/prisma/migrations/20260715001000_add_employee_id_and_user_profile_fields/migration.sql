CREATE SEQUENCE IF NOT EXISTS employee_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_id TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS alternate_phone TEXT,
  ADD COLUMN IF NOT EXISTS designation TEXT,
  ADD COLUMN IF NOT EXISTS branch TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT;

WITH existing_valid AS (
  SELECT COALESCE(MAX((substring(employee_id from 4))::integer), 0) AS max_no
  FROM users
  WHERE employee_id ~ '^EMP[0-9]{6}$'
),
missing AS (
  SELECT
    id,
    row_number() OVER (ORDER BY created_at ASC, id ASC) + (SELECT max_no FROM existing_valid) AS employee_no
  FROM users
  WHERE employee_id IS NULL OR employee_id = ''
)
UPDATE users u
SET employee_id = 'EMP' || lpad(m.employee_no::text, 6, '0')
FROM missing m
WHERE u.id = m.id;

SELECT setval(
  'employee_id_seq',
  GREATEST(
    COALESCE((SELECT MAX((substring(employee_id from 4))::integer) FROM users WHERE employee_id ~ '^EMP[0-9]{6}$'), 0) + 1,
    1
  ),
  false
);

ALTER TABLE users
  ALTER COLUMN employee_id SET DEFAULT ('EMP' || lpad(nextval('employee_id_seq')::text, 6, '0')),
  ALTER COLUMN employee_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_key ON users(employee_id);
CREATE INDEX IF NOT EXISTS users_employee_id_idx ON users(employee_id);
CREATE INDEX IF NOT EXISTS users_branch_idx ON users(branch);
CREATE INDEX IF NOT EXISTS users_region_idx ON users(region);
CREATE INDEX IF NOT EXISTS users_designation_idx ON users(designation);
