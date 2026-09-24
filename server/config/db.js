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
    CREATE TABLE IF NOT EXISTS task_items (
      id                SERIAL PRIMARY KEY,
      task_id           TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      work_type         TEXT NOT NULL,
      quantity          NUMERIC DEFAULT 1,
      unit              TEXT DEFAULT 'шт.',
      price_customer    NUMERIC DEFAULT 0,
      amount_customer   NUMERIC DEFAULT 0,
      contractor_id     INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
      contractor_name   TEXT,
      price_contractor  NUMERIC DEFAULT 0,
      amount_contractor NUMERIC DEFAULT 0,
      distance_km       NUMERIC DEFAULT 0,
      status            TEXT DEFAULT 'pending',
      comment           TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_items_task_id ON task_items(task_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_items_contractor_id ON task_items(contractor_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS specialists (
      id                      SERIAL PRIMARY KEY,
      full_name               TEXT NOT NULL,
      phone                   TEXT,
      passport_series_number  TEXT,
      passport_issued_by      TEXT,
      passport_issue_date     TEXT,
      passport_code           TEXT,
      passport_raw            TEXT,
      organization            TEXT DEFAULT 'ООО "Ультима"',
      position                TEXT DEFAULT 'Монтажник СКС',
      contractor_id           INTEGER REFERENCES contractors(id) ON DELETE SET NULL,
      user_id                 INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at              TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_specialists_name ON specialists(full_name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_specialists_contractor ON specialists(contractor_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS powers_of_attorney (
      id              SERIAL PRIMARY KEY,
      number          TEXT NOT NULL,
      issue_date      DATE,
      valid_until     DATE,
      person_name     TEXT NOT NULL,
      specialist_id   INTEGER REFERENCES specialists(id) ON DELETE SET NULL,
      contractor_name TEXT,
      organization    TEXT,
      status          TEXT DEFAULT 'active',
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_poa_specialist ON powers_of_attorney(specialist_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_poa_person ON powers_of_attorney(person_name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_poa_valid_until ON powers_of_attorney(valid_until)`);
  await pool.query(`ALTER TABLE powers_of_attorney ADD COLUMN IF NOT EXISTS contractor_id INTEGER REFERENCES contractors(id) ON DELETE SET NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_poa_contractor_id ON powers_of_attorney(contractor_id)`);

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

  // Дополнительные колонки для task_checklists
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS ports_install INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS ports_move INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS ports_dismantle INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS ports_restore INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS surface_type TEXT`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS socket_surface TEXT`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS ceiling_height NUMERIC DEFAULT 2.5`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS has_cable_channel BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS cable_channel_size TEXT`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS add_cable_channel_needed BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS add_cable_channel_meters NUMERIC DEFAULT 0`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS has_tray BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS has_floor_passage BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS has_server_room BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS has_telecom_closet BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS patch_panel_needed BOOLEAN DEFAULT false`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS patch_panel_free_num TEXT`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS port_marking TEXT`);
  await pool.query(`ALTER TABLE task_checklists ADD COLUMN IF NOT EXISTS raw_checklist_json JSONB DEFAULT '{}'`);

  // Таблица переписки с ИИ-ассистентом
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      mode        TEXT NOT NULL,          -- analytics | forecast | tech | general | parse_devices
      role        TEXT NOT NULL,          -- user | assistant
      content     TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_msg_user ON ai_messages(user_id, created_at)`);
  await pool.query(`ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS rating TEXT`);
  await pool.query(`ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS rating_comment TEXT`);
  await pool.query(`ALTER TABLE ai_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ai_msg_rating ON ai_messages(rating)`);

  // 1. Таблица материалов (ТМЦ)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS materials (
      id              SERIAL PRIMARY KEY,
      code            TEXT UNIQUE NOT NULL,
      name            TEXT NOT NULL,
      category        TEXT,                   -- 'cable', 'conduit', 'keystone', 'patchcord', 'hardware', 'box'
      unit            TEXT NOT NULL DEFAULT 'шт',
      package_qty     NUMERIC DEFAULT 1,     -- норма отгрузки / квант (бухта 305м, хлыст 2м)
      package_unit    TEXT,                   -- 'бухта 305м', 'хлыст 2м', 'упаковка 100шт'
      price_default   NUMERIC DEFAULT 0,
      min_stock_alert NUMERIC DEFAULT 0,     -- неснижаемый порог остатка
      is_active       BOOLEAN DEFAULT true,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_materials_code ON materials(code)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category)`);

  // 2. Таблица складов (центральные, региональные, виртуальные склады подрядчиков)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      type          TEXT NOT NULL DEFAULT 'contractor', -- 'central', 'regional', 'contractor', 'transit'
      contractor_id INTEGER REFERENCES contractors(id) ON DELETE CASCADE,
      region        TEXT,
      address       TEXT,
      is_active     BOOLEAN DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_warehouses_contractor ON warehouses(contractor_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_warehouses_type ON warehouses(type)`);

  // 3. Остатки ТМЦ на складах / у подрядчиков
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_balances (
      id             SERIAL PRIMARY KEY,
      warehouse_id   INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      material_id    INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      quantity       NUMERIC NOT NULL DEFAULT 0,  -- фактический остаток
      reserved_qty   NUMERIC NOT NULL DEFAULT 0,  -- зарезервировано под заявки
      in_transit_qty NUMERIC NOT NULL DEFAULT 0,  -- в пути
      updated_at     TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(warehouse_id, material_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_balances_wh ON stock_balances(warehouse_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_balances_mat ON stock_balances(material_id)`);

  // 4. Журнал товародвижений
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id                  SERIAL PRIMARY KEY,
      movement_type       TEXT NOT NULL,      -- 'receipt', 'transfer', 'task_consumption', 'return', 'adjustment'
      source_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
      target_warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
      task_id             TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      status              TEXT NOT NULL DEFAULT 'completed', -- 'draft', 'in_transit', 'completed', 'cancelled'
      doc_number          TEXT,
      comment             TEXT,
      created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      confirmed_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at        TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_task ON stock_movements(task_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type)`);

  // 5. Позиции товародвижения
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_movement_items (
      id          SERIAL PRIMARY KEY,
      movement_id INTEGER NOT NULL REFERENCES stock_movements(id) ON DELETE CASCADE,
      material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      quantity    NUMERIC NOT NULL,
      unit_price  NUMERIC DEFAULT 0
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_stock_movement_items_mov ON stock_movement_items(movement_id)`);

  // 6. Спецификация материалов заявки (план по типовику vs факт подрядчика)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_materials (
      id             SERIAL PRIMARY KEY,
      task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      material_id    INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      plan_qty       NUMERIC NOT NULL DEFAULT 0,
      fact_qty       NUMERIC DEFAULT 0,
      calc_details   TEXT,
      source         TEXT DEFAULT 'template', -- 'template', 'ai', 'manual'
      is_written_off BOOLEAN DEFAULT false,
      written_off_at TIMESTAMPTZ,
      UNIQUE(task_id, material_id)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_materials_task ON task_materials(task_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_task_materials_mat ON task_materials(material_id)`);

  // 7. Поставщики ТМЦ
  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id               SERIAL PRIMARY KEY,
      name             TEXT NOT NULL,
      contact          TEXT,
      phone            TEXT,
      email            TEXT,
      lead_time_days   INTEGER DEFAULT 14,
      min_order_amount NUMERIC DEFAULT 0,
      is_active        BOOLEAN DEFAULT true,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // 8. Заказы поставщикам
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id                     SERIAL PRIMARY KEY,
      order_number           TEXT UNIQUE NOT NULL,
      supplier_id            INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      target_warehouse_id    INTEGER REFERENCES warehouses(id) ON DELETE SET NULL,
      status                 TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'ordered', 'in_transit', 'received', 'cancelled'
      total_amount           NUMERIC DEFAULT 0,
      order_date             DATE DEFAULT CURRENT_DATE,
      expected_delivery_date DATE,
      received_date          DATE,
      notes                  TEXT,
      created_by             INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at             TIMESTAMPTZ DEFAULT NOW(),
      updated_at             TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)`);

  // 9. Позиции заказа поставщику
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id                SERIAL PRIMARY KEY,
      purchase_order_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      material_id       INTEGER NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
      quantity          NUMERIC NOT NULL,
      package_units     NUMERIC DEFAULT 1,
      unit_price        NUMERIC DEFAULT 0,
      total_price       NUMERIC DEFAULT 0
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items(purchase_order_id)`);

  await seedMaterialsAndWarehouses();

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

export async function seedMaterialsAndWarehouses() {
  try {
    // 1. Создаем Центральный склад по умолчанию
    await pool.query(`
      INSERT INTO warehouses (name, type, region, address)
      SELECT 'Центральный склад', 'central', 'Москва', 'г. Москва'
      WHERE NOT EXISTS (SELECT 1 FROM warehouses WHERE type = 'central');
    `);

    // 2. Создаем виртуальные склады для всех подрядчиков
    await pool.query(`
      INSERT INTO warehouses (name, type, contractor_id)
      SELECT 'Склад ' || name_short, 'contractor', id
      FROM contractors
      WHERE id NOT IN (SELECT contractor_id FROM warehouses WHERE contractor_id IS NOT NULL);
    `);

    // 3. Базовый справочник материалов СКС (типовик Сбера)
    const defaultMaterials = [
      { code: 'CABLE-UTP-5E-CU', name: 'Кабель UTP 4 пары Cat.5e Cu (бухта 305м)', category: 'cable', unit: 'м', package_qty: 305, package_unit: 'бухта 305м', price: 45, min_alert: 610 },
      { code: 'KEYSTONE-RJ45-5E', name: 'Модуль Keystone RJ-45 Cat.5e UTP', category: 'keystone', unit: 'шт', package_qty: 1, package_unit: 'шт', price: 120, min_alert: 50 },
      { code: 'PATCH-CORD-2M', name: 'Патч-корд UTP Cat.5e 2.0м', category: 'patchcord', unit: 'шт', package_qty: 1, package_unit: 'шт', price: 150, min_alert: 40 },
      { code: 'PATCH-CORD-1M', name: 'Патч-корд UTP Cat.5e 1.0м', category: 'patchcord', unit: 'шт', package_qty: 1, package_unit: 'шт', price: 110, min_alert: 40 },
      { code: 'FACEPLATE-1P', name: 'Лицевая панель / рамка суппорта 1 порт', category: 'hardware', unit: 'шт', package_qty: 1, package_unit: 'шт', price: 80, min_alert: 30 },
      { code: 'SURFACE-BOX-1P', name: 'Коробка накладная 1 порт RJ-45', category: 'box', unit: 'шт', package_qty: 1, package_unit: 'шт', price: 95, min_alert: 30 },
      { code: 'CORRUGATED-16', name: 'Труба гофрированная ПВХ ф16 с протяжкой', category: 'conduit', unit: 'м', package_qty: 100, package_unit: 'бухта 100м', price: 15, min_alert: 200 },
      { code: 'CABLE-TRUNK-40X25', name: 'Кабель-канал 40х25 мм с крышкой (хлыст 2м)', category: 'conduit', unit: 'м', package_qty: 2, package_unit: 'хлыст 2м', price: 110, min_alert: 40 },
      { code: 'CABLE-TRUNK-25X16', name: 'Кабель-канал 25х16 мм с крышкой (хлыст 2м)', category: 'conduit', unit: 'м', package_qty: 2, package_unit: 'хлыст 2м', price: 75, min_alert: 40 },
      { code: 'PATCH-PANEL-24', name: 'Патч-панель 19" 1U 24 порта Cat.5e', category: 'hardware', unit: 'шт', package_qty: 1, package_unit: 'шт', price: 2800, min_alert: 5 },
      { code: 'CABLE-ORG-1U', name: 'Кабельный органайзер 19" 1U', category: 'hardware', unit: 'шт', package_qty: 1, package_unit: 'шт', price: 650, min_alert: 5 },
      { code: 'MARKING-LABEL', name: 'Маркировочные этикетки / бирки', category: 'hardware', unit: 'шт', package_qty: 1, package_unit: 'шт', price: 5, min_alert: 100 }
    ];

    for (const m of defaultMaterials) {
      await pool.query(`
        INSERT INTO materials (code, name, category, unit, package_qty, package_unit, price_default, min_stock_alert)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (code) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          unit = EXCLUDED.unit,
          package_qty = EXCLUDED.package_qty,
          package_unit = EXCLUDED.package_unit
      `, [m.code, m.name, m.category, m.unit, m.package_qty, m.package_unit, m.price, m.min_alert]);
    }

    // 4. Базовые поставщики ТМЦ
    const defaultSuppliers = [
      { name: 'ТД ТЕЛЕКОМ-СНАБ', contact: 'Иванов С.В.', phone: '+7 (495) 123-45-67', email: 'sales@telecom-snab.ru', lead_time_days: 14, min_order: 50000 },
      { name: 'ЛКС Кабель-Системы', contact: 'Петрова Е.А.', phone: '+7 (495) 765-43-21', email: 'orders@lks-cable.ru', lead_time_days: 10, min_order: 30000 },
      { name: 'СпецЭлектроКомплект', contact: 'Смирнов Д.М.', phone: '+7 (812) 555-88-99', email: 'zakaz@specelectro.ru', lead_time_days: 7, min_order: 15000 }
    ];

    for (const s of defaultSuppliers) {
      await pool.query(`
        INSERT INTO suppliers (name, contact, phone, email, lead_time_days, min_order_amount)
        SELECT $1, $2, $3, $4, $5, $6
        WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE name = $1);
      `, [s.name, s.contact, s.phone, s.email, s.lead_time_days, s.min_order]);
    }
  } catch (err) {
    console.error('[DB] Ошибка сидирования материалов/складов:', err);
  }
}