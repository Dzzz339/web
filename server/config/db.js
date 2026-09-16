import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || '';
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1') || connectionString.includes('@db:') || connectionString.includes('stockeasy-db');

export const pool = new Pool({
  connectionString: connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

export async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'worker', 
      full_name     TEXT,                           
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Создание таблицы подрядчиков
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractors (
      id            SERIAL PRIMARY KEY,
      inn           TEXT UNIQUE NOT NULL,
      kpp           TEXT,
      name_short    TEXT NOT NULL,
      name_full     TEXT,
      address_legal TEXT,
      director      TEXT,
      bank_name     TEXT,
      bik           TEXT,
      account_corr  TEXT,
      account_pay   TEXT,
      phone         TEXT,
      email         TEXT,
      status        TEXT DEFAULT 'active',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contractors_inn ON contractors(inn)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contractors_name ON contractors(name_short)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      sheet       TEXT,
      region      TEXT,
      address     TEXT,
      work_type   TEXT,
      tip_obj     TEXT,
      gosb        TEXT,
      vsp         TEXT,
      date_zayavki DATE,
      deadline    DATE,
      date_vnesen DATE,
      manager     TEXT,
      contact     TEXT,
      contractor  TEXT,
      in_order    INTEGER DEFAULT 0,
      fact        INTEGER DEFAULT 0,
      obsledovanie TEXT,
      dostup      TEXT,
      data_vyhoda DATE,
      priemka     TEXT,
      oplata      TEXT,
      id_status   TEXT,
      amount      NUMERIC DEFAULT 0,
      distance_km NUMERIC DEFAULT 0,
      price_per_unit NUMERIC DEFAULT 0,
      tech_link   TEXT,
      edo_number  TEXT,
      invoice_info TEXT,
      vedo_status TEXT,
      excel_comment TEXT,
      status      TEXT DEFAULT 'progress',
      priority    TEXT DEFAULT 'low',
      overdue_days INTEGER DEFAULT 0,
      stage       TEXT,
      archived    BOOLEAN DEFAULT false,
      assignee    TEXT,
      controller  TEXT,
      comment     TEXT,
      distributed_at DATE,
      history     JSONB DEFAULT '[]',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      raw_data    JSONB DEFAULT '{}'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS marches (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      base_city   TEXT,
      km_rate     NUMERIC DEFAULT 70,
      points      JSONB DEFAULT '[]',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_meta (
      id          INTEGER PRIMARY KEY DEFAULT 1,
      imported_from TEXT,
      imported_at TIMESTAMPTZ,
      row_count   INTEGER DEFAULT 0
    )
  `);

  await pool.query(`
    INSERT INTO import_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_region   ON tasks(region)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_sheet    ON tasks(sheet)`);

  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS date_vnesen DATE`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}'`);
  await pool.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS km_rate NUMERIC DEFAULT 0');
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tmc NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extras NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS geo_lat TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS geo_lon TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS clean_address TEXT`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS supplier_order_signed BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS supplier_id_uploaded BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS overdue_reason TEXT`);
  await pool.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignment_status TEXT DEFAULT NULL');

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS passport_series_number TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS passport_issued_by TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS passport_issue_date DATE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS passport_code TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS passport_scan_url TEXT`);

  await pool.query(`ALTER TABLE contractors ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'executor'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contractors_type ON contractors(type)`);

  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS customer TEXT DEFAULT 'ПАО Сбербанк'`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_customer ON tasks(customer)`);

  await pool.query(`
    INSERT INTO contractors (inn, name_short, name_full, type, status)
    VALUES ('7707083893', 'ПАО СБЕРБАНК', 'Публичное акционерное общество «Сбербанк России»', 'customer', 'active')
    ON CONFLICT (inn) DO UPDATE SET type = 'customer';
  `);
  await pool.query(`
    INSERT INTO contractors (inn, name_short, name_full, type, status)
    VALUES ('540208866750', 'ООО «К10»', 'Общество с ограниченной ответственностью «К10»', 'internal', 'active')
    ON CONFLICT (inn) DO UPDATE SET type = 'internal';
  `);

  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_num INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS designer_id INTEGER REFERENCES users(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS materials_link TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS id_link TEXT DEFAULT ''`);
  await pool.query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stage_due TIMESTAMPTZ`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_stage_num ON tasks(stage_num)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_manager_id ON tasks(manager_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_designer_id ON tasks(designer_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS remarks (
      id              TEXT PRIMARY KEY,
      task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      body            TEXT NOT NULL,
      link            TEXT DEFAULT '',
      created_by      INTEGER NOT NULL REFERENCES users(id),
      created_name    TEXT NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      resolved_at     TIMESTAMPTZ,
      resolved_by     INTEGER REFERENCES users(id),
      resolved_name   TEXT,
      resolution      TEXT,
      resolution_link TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_remarks_task ON remarks(task_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id         SERIAL PRIMARY KEY,
      name       TEXT,
      type       TEXT NOT NULL DEFAULT 'direct',
      task_id    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_members (
      id        SERIAL PRIMARY KEY,
      room_id   INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
      user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(room_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id           SERIAL PRIMARY KEY,
      room_id      INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE,
      sender_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      message_text TEXT NOT NULL,
      attachments  JSONB DEFAULT '[]',
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      body       TEXT,
      link       TEXT,
      is_read    BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id            SERIAL PRIMARY KEY,
      task_id       TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      type          TEXT NOT NULL,
      file_path     TEXT NOT NULL,
      original_name TEXT,
      mime_type     TEXT,
      size_bytes    INTEGER,
      uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      comment       TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON task_attachments(task_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id            SERIAL PRIMARY KEY,
      task_id       TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      doc_type      TEXT NOT NULL DEFAULT 'invoice',
      version       INTEGER NOT NULL DEFAULT 1,
      status        TEXT NOT NULL DEFAULT 'draft',
      amount        NUMERIC,
      snapshot      JSONB,
      issued_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      issued_at     TIMESTAMPTZ,
      approved_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoices_task_id ON invoices(task_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_ports (
      id            SERIAL PRIMARY KEY,
      task_id       TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      port_number   TEXT,
      patch_panel   TEXT,
      room          TEXT,
      marking       TEXT,
      cable_length  NUMERIC,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_ports_task_id ON task_ports(task_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_checklists (
      id                          SERIAL PRIMARY KEY,
      task_id                     TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      inspection_date             DATE,
      zno_number                  TEXT,
      address                     TEXT,
      room_name                   TEXT,
      inspector_name              TEXT,
      sbs_contact                 TEXT,
      work_type                   TEXT,
      ports_install_qty           INTEGER DEFAULT 0,
      ports_relocate_qty          INTEGER DEFAULT 0,
      ports_dismantle_qty         INTEGER DEFAULT 0,
      ports_restore_qty           INTEGER DEFAULT 0,
      mount_surface               TEXT,
      has_floor_hatches           BOOLEAN DEFAULT false,
      has_drops                   BOOLEAN DEFAULT false,
      outlet_surface              TEXT,
      table_exists                BOOLEAN DEFAULT false,
      workplace_occupied          BOOLEAN DEFAULT false,
      table_install_date          DATE,
      raised_floor                BOOLEAN DEFAULT false,
      ceiling_height_mm           INTEGER DEFAULT 0,
      has_interfloor_pass         BOOLEAN DEFAULT false,
      interfloor_has_space        BOOLEAN DEFAULT false,
      has_metal_tray              BOOLEAN DEFAULT false,
      metal_tray_has_space        BOOLEAN DEFAULT false,
      has_trunking                BOOLEAN DEFAULT false,
      trunking_brand_size         TEXT,
      trunking_size               TEXT,
      trunking_install_needed     BOOLEAN DEFAULT false,
      trunking_install_meters     NUMERIC DEFAULT 0,
      electric_sockets_ready      BOOLEAN DEFAULT false,
      electric_sockets_mount_type TEXT,
      has_server_room             BOOLEAN DEFAULT false,
      server_room_info            TEXT,
      has_telecom_rack            BOOLEAN DEFAULT false,
      telecom_rack_info           TEXT,
      patch_panel_install_needed  BOOLEAN DEFAULT false,
      free_patch_panel_num        TEXT,
      ports_marking               TEXT,
      materials_needed            BOOLEAN DEFAULT false,
      mat_patch_panels_qty        INTEGER DEFAULT 0,
      mat_cable_organizers_qty    INTEGER DEFAULT 0,
      mat_keystone_black_qty      INTEGER DEFAULT 0,
      mat_keystone_white_qty      INTEGER DEFAULT 0,
      mat_faceplates_frames_qty   INTEGER DEFAULT 0,
      mat_cable_meters            NUMERIC DEFAULT 0,
      mat_surface_boxes_qty       INTEGER DEFAULT 0,
      notes                       TEXT,
      raw_checklist_data          JSONB DEFAULT '{}',
      created_by                  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at                  TIMESTAMPTZ DEFAULT NOW(),
      updated_at                  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_checklists_task_id ON task_checklists(task_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_checklists_zno ON task_checklists(zno_number)`);

  const userCount = await pool.query('SELECT COUNT(*) FROM users');
  if (parseInt(userCount.rows[0].count) === 0) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('chaykaxxx228', salt); 
    
    await pool.query(
      'INSERT INTO users (username, password_hash, role, full_name) VALUES ($1, $2, $3, $4)',
      ['nikita', hash, 'admin', 'Администратор']
    );
    console.log('Default admin user created');
  }

  try {
    await pool.query(`
      UPDATE tasks SET stage = CASE
        WHEN LOWER(COALESCE(oplata, '')) ~ '(оплач|да|\\+)' OR status = 'paid' OR LOWER(COALESCE(id_status, '')) ~ 'оплач' THEN 'payment'
        WHEN LOWER(COALESCE(priemka, '')) ~ '(принят|да|\\+)' OR status = 'done' OR LOWER(COALESCE(id_status, '')) ~ 'принят' THEN 'acceptance'
        WHEN fact > 0 AND in_order > 0 AND fact >= in_order THEN 'control'
        WHEN data_vyhoda IS NOT NULL OR fact > 0 OR status = 'progress' THEN 'install'
        WHEN obsledovanie IS NOT NULL AND obsledovanie NOT IN ('', '-', 'нет') THEN 'survey'
        ELSE 'request'
      END
      WHERE stage IS NULL OR stage = '' OR (stage = 'install' AND status = 'pending' AND fact = 0 AND data_vyhoda IS NULL);
    `);
    await pool.query(`
      UPDATE tasks SET stage_num = CASE
        WHEN LOWER(COALESCE(oplata, '')) ~ '(оплач|да|\\+)' OR status = 'paid' OR LOWER(COALESCE(id_status, '')) ~ 'оплач' THEN 9
        WHEN LOWER(COALESCE(priemka, '')) ~ '(принят|да|\\+)' OR status = 'done' OR LOWER(COALESCE(id_status, '')) ~ 'принят' THEN 7
        WHEN stage = 'payment' THEN 7
        WHEN stage = 'acceptance' THEN 6
        WHEN stage = 'control' THEN 3
        WHEN stage = 'install' OR stage = 'survey' THEN 1
        ELSE 0
      END
      WHERE stage_num IS NULL OR stage_num = 0;
    `);
  } catch(err) {
    console.error('Stage backfill migration error:', err.message);
  }

  console.log('DB initialized');
}