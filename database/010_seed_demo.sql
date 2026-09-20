-- Agrologistik Marketplace
-- Deterministic, fake Competition MVP data. Safe to rerun without duplicating
-- rows; existing demo rows are not reset so test progress is preserved.
-- Run after database/001_extensions.sql through database/009_indexes.sql.

BEGIN;

INSERT INTO roles (name)
VALUES ('ADMIN'), ('FARMER'), ('BUYER'), ('TRANSPORTER')
ON CONFLICT (name) DO NOTHING;

-- Reserved demo identities only. The .invalid domain cannot receive email and
-- the +99800 numbers are deliberate placeholders, not personal contact data.
INSERT INTO users (id, phone, email, full_name, status)
VALUES
    ('10000000-0000-4000-8000-000000000001', '+998000000001',
     'admin@agrologistik.invalid', 'Demo Administrator', 'ACTIVE'),
    ('20000000-0000-4000-8000-000000000001', '+998000000101',
     'farmer1@agrologistik.invalid', 'Demo Farmer One', 'ACTIVE'),
    ('20000000-0000-4000-8000-000000000002', '+998000000102',
     'farmer2@agrologistik.invalid', 'Demo Farmer Two', 'ACTIVE'),
    ('30000000-0000-4000-8000-000000000001', '+998000000201',
     'buyer1@agrologistik.invalid', 'Demo Buyer One', 'ACTIVE'),
    ('30000000-0000-4000-8000-000000000002', '+998000000202',
     'buyer2@agrologistik.invalid', 'Demo Buyer Two', 'ACTIVE'),
    ('40000000-0000-4000-8000-000000000001', '+998000000301',
     'transporter1@agrologistik.invalid', 'Demo Transporter One', 'ACTIVE'),
    ('40000000-0000-4000-8000-000000000002', '+998000000302',
     'transporter2@agrologistik.invalid', 'Demo Transporter Two', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

WITH role_seed (id, user_id, role_name) AS (
    VALUES
        ('50000000-0000-4000-8000-000000000001'::UUID,
         '10000000-0000-4000-8000-000000000001'::UUID, 'ADMIN'),
        ('50000000-0000-4000-8000-000000000002'::UUID,
         '20000000-0000-4000-8000-000000000001'::UUID, 'FARMER'),
        ('50000000-0000-4000-8000-000000000003'::UUID,
         '20000000-0000-4000-8000-000000000002'::UUID, 'FARMER'),
        ('50000000-0000-4000-8000-000000000004'::UUID,
         '30000000-0000-4000-8000-000000000001'::UUID, 'BUYER'),
        ('50000000-0000-4000-8000-000000000005'::UUID,
         '30000000-0000-4000-8000-000000000002'::UUID, 'BUYER'),
        ('50000000-0000-4000-8000-000000000006'::UUID,
         '40000000-0000-4000-8000-000000000001'::UUID, 'TRANSPORTER'),
        ('50000000-0000-4000-8000-000000000007'::UUID,
         '40000000-0000-4000-8000-000000000002'::UUID, 'TRANSPORTER')
)
INSERT INTO user_roles (id, user_id, role_id)
SELECT rs.id, rs.user_id, r.id
FROM role_seed AS rs
JOIN roles AS r ON r.name = rs.role_name
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO farmer_profiles (
    user_id, farm_name, region, district, description, verification_status
)
VALUES
    ('20000000-0000-4000-8000-000000000001', 'Demo Qibray Agro',
     'Toshkent viloyati', 'Qibray', 'Demo vegetables and potato farm.', 'VERIFIED'),
    ('20000000-0000-4000-8000-000000000002', 'Demo Parkent Boglari',
     'Toshkent viloyati', 'Parkent', 'Demo fruit and melon farm.', 'VERIFIED')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO buyer_profiles (
    user_id, buyer_type, organization_name, region, district
)
VALUES
    ('30000000-0000-4000-8000-000000000001', 'INDIVIDUAL', NULL,
     'Toshkent shahri', 'Mirzo Ulugbek'),
    ('30000000-0000-4000-8000-000000000002', 'BUSINESS',
     'Demo Toshkent Savdo MChJ', 'Toshkent shahri', 'Chilonzor')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO transporter_profiles (user_id, service_region, availability_status)
VALUES
    ('40000000-0000-4000-8000-000000000001',
     'Toshkent shahri va Toshkent viloyati', 'AVAILABLE'),
    ('40000000-0000-4000-8000-000000000002',
     'Toshkent va Sirdaryo viloyatlari', 'BUSY')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO vehicles (
    id, transporter_id, vehicle_type, plate_number, capacity_kg,
    refrigerated, status
)
VALUES
    ('60000000-0000-4000-8000-000000000001',
     '40000000-0000-4000-8000-000000000001', 'TRUCK',
     'DEMO-TRUCK-01', 5000.00, TRUE, 'ACTIVE'),
    ('60000000-0000-4000-8000-000000000002',
     '40000000-0000-4000-8000-000000000002', 'VAN',
     'DEMO-VAN-02', 1800.00, FALSE, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (name)
VALUES ('Kartoshka'), ('Sabzavot'), ('Meva'), ('Poliz')
ON CONFLICT (name) DO NOTHING;

WITH product_seed (id, category_name, name, unit_type) AS (
    VALUES
        ('70000000-0000-4000-8000-000000000001'::UUID,
         'Kartoshka', 'Gala kartoshka', 'KG'),
        ('70000000-0000-4000-8000-000000000002'::UUID,
         'Sabzavot', 'Pomidor', 'KG'),
        ('70000000-0000-4000-8000-000000000003'::UUID,
         'Sabzavot', 'Sabzi', 'KG'),
        ('70000000-0000-4000-8000-000000000004'::UUID,
         'Meva', 'Olma', 'KG'),
        ('70000000-0000-4000-8000-000000000005'::UUID,
         'Meva', 'Uzum', 'KG'),
        ('70000000-0000-4000-8000-000000000006'::UUID,
         'Poliz', 'Tarvuz', 'PIECE'),
        ('70000000-0000-4000-8000-000000000007'::UUID,
         'Poliz', 'Qovun', 'PIECE')
)
INSERT INTO products (id, category_id, name, unit_type)
SELECT ps.id, c.id, ps.name, ps.unit_type
FROM product_seed AS ps
JOIN categories AS c ON c.name = ps.category_name
ON CONFLICT (category_id, name) DO NOTHING;

WITH listing_seed (
    id, farmer_id, category_name, product_name, title, description,
    original_quantity, available_quantity, unit, price_per_unit,
    region, district, latitude, longitude, status
) AS (
    VALUES
        ('80000000-0000-4000-8000-000000000001'::UUID,
         '20000000-0000-4000-8000-000000000001'::UUID,
         'Kartoshka', 'Gala kartoshka', 'Qibray Gala kartoshkasi',
         'Competition MVP uchun faol demo kartoshka loti.',
         2000.00, 2000.00, 'KG', 4500.00,
         'Toshkent viloyati', 'Qibray', 41.389700, 69.465000, 'ACTIVE'),
        ('80000000-0000-4000-8000-000000000002'::UUID,
         '20000000-0000-4000-8000-000000000001'::UUID,
         'Sabzavot', 'Pomidor', 'Issiqxona pomidori',
         'Yangi uzilgan demo pomidor mahsuloti.',
         800.00, 800.00, 'KG', 11000.00,
         'Toshkent viloyati', 'Qibray', 41.381000, 69.478000, 'ACTIVE'),
        ('80000000-0000-4000-8000-000000000003'::UUID,
         '20000000-0000-4000-8000-000000000001'::UUID,
         'Sabzavot', 'Sabzi', 'Saralangan sabzi',
         'Omborda saqlangan saralangan demo sabzi.',
         1200.00, 900.00, 'KG', 5500.00,
         'Toshkent viloyati', 'Qibray', 41.370000, 69.450000, 'ACTIVE'),
        ('80000000-0000-4000-8000-000000000004'::UUID,
         '20000000-0000-4000-8000-000000000002'::UUID,
         'Meva', 'Olma', 'Parkent olmasi',
         'Demo bogdan saralangan mavsumiy olma.',
         1500.00, 1500.00, 'KG', 9000.00,
         'Toshkent viloyati', 'Parkent', 41.294000, 69.676000, 'ACTIVE'),
        ('80000000-0000-4000-8000-000000000005'::UUID,
         '20000000-0000-4000-8000-000000000002'::UUID,
         'Meva', 'Uzum', 'Parkent uzumi',
         'Competition MVP uchun demo uzum loti.',
         600.00, 600.00, 'KG', 16000.00,
         'Toshkent viloyati', 'Parkent', 41.303000, 69.690000, 'ACTIVE'),
        ('80000000-0000-4000-8000-000000000006'::UUID,
         '20000000-0000-4000-8000-000000000002'::UUID,
         'Poliz', 'Tarvuz', 'Toshkent tarvuzlari',
         'Donalab sotiladigan demo tarvuz partiyasi.',
         200.00, 200.00, 'PIECE', 25000.00,
         'Toshkent viloyati', 'Parkent', 41.280000, 69.660000, 'ACTIVE'),
        ('80000000-0000-4000-8000-000000000007'::UUID,
         '20000000-0000-4000-8000-000000000002'::UUID,
         'Poliz', 'Qovun', 'Demo qovun partiyasi',
         'Keyingi demo bosqichi uchun qoralama listing.',
         120.00, 120.00, 'PIECE', 18000.00,
         'Toshkent viloyati', 'Parkent', 41.286000, 69.670000, 'DRAFT')
)
INSERT INTO listings (
    id, farmer_id, product_id, title, description, original_quantity,
    available_quantity, unit, price_per_unit, region, district,
    latitude, longitude, status
)
SELECT
    ls.id, ls.farmer_id, p.id, ls.title, ls.description,
    ls.original_quantity, ls.available_quantity, ls.unit,
    ls.price_per_unit, ls.region, ls.district,
    ls.latitude, ls.longitude, ls.status
FROM listing_seed AS ls
JOIN categories AS c ON c.name = ls.category_name
JOIN products AS p
  ON p.category_id = c.id
 AND p.name = ls.product_name
ON CONFLICT (id) DO NOTHING;

COMMIT;
