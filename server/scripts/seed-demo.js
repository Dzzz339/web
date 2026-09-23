// server/scripts/seed-demo.js - Безопасный генератор эталонной демонстрационной базы StockEasy
// Полностью изолирован от боевой базы данных stockeasy_db!
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { initDB } from '../config/db.js';
import { generateSubcontractOrder, generatePermitLetter, generatePowerOfAttorney, generateIdRegistry } from '../services/docxGenerator.js';
import fs from 'fs';
import path from 'path';
import { UPLOADS_DIR } from '../middleware/upload.js';

const { Client, Pool } = pg;

const rawDbUrl = process.env.DATABASE_URL || 'postgres://postgres:M9L4E22DPU4sUrU3tAnN@localhost:5433/stockeasy_demo';

async function ensureDemoDatabaseExists() {
  console.log('[DemoSeeder] Проверка наличия базы stockeasy_demo...');
  // Подключаемся к системной БД postgres для проверки/создания stockeasy_demo
  const adminUrl = rawDbUrl.replace(/\/stockeasy_demo(?:\?.*)?$/, '/postgres');
  const client = new Client({ connectionString: adminUrl });
  try {
    await client.connect();
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'stockeasy_demo'");
    if (res.rows.length === 0) {
      console.log('[DemoSeeder] Создание чистой базы stockeasy_demo...');
      await client.query('CREATE DATABASE stockeasy_demo');
      console.log('[DemoSeeder] База stockeasy_demo успешно создана!');
    } else {
      console.log('[DemoSeeder] База stockeasy_demo уже существует.');
    }
  } catch (err) {
    console.warn('[DemoSeeder] Ошибка проверки pg_database (возможно, база уже есть):', err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

async function seedDemoData() {
  await ensureDemoDatabaseExists();

  const pool = new Pool({ connectionString: rawDbUrl });

  try {
    // 1. Инициализируем схему таблиц
    console.log('[DemoSeeder] Инициализация таблиц схемы...');
    await initDB();

    // 2. Проверяем количество задач: если демо-задачи уже есть, не дублируем
    const tasksCountRes = await pool.query('SELECT COUNT(*) FROM tasks');
    const existingCount = parseInt(tasksCountRes.rows[0].count);
    if (existingCount >= 10) {
      console.log(`[DemoSeeder] В демо-базе уже содержится ${existingCount} задач. Пропускаем повторное сидирование.`);
      await pool.end();
      return;
    }

    console.log('[DemoSeeder] Наполнение демонстрационными пользователями (8 ролей)...');
    const salt = await bcrypt.genSalt(10);
    const demoPasswordHash = await bcrypt.hash('123456', salt);
    const milanaPasswordHash = await bcrypt.hash('chaykaxxx228', salt);

    const demoUsers = [
      { username: 'milana', hash: milanaPasswordHash, role: 'director', full_name: 'Милана Городович' },
      { username: 'nikita', hash: milanaPasswordHash, role: 'admin', full_name: 'Никита Чайка' },
      { username: 'manager1', hash: demoPasswordHash, role: 'manager', full_name: 'Алексей Менеджеров' },
      { username: 'to_spec', hash: demoPasswordHash, role: 'to_engineer', full_name: 'Сергей Инженеров' },
      { username: 'logist1', hash: demoPasswordHash, role: 'logistics', full_name: 'Дмитрий Снабженцев' },
      { username: 'designer1', hash: demoPasswordHash, role: 'designer', full_name: 'Елена Проектировщикова' },
      { username: 'buh1', hash: demoPasswordHash, role: 'accountant', full_name: 'Ольга Бухгалтерова' },
      { username: 'worker1', hash: demoPasswordHash, role: 'installer', full_name: 'Иван Монтажников' }
    ];

    for (const u of demoUsers) {
      await pool.query(`
        INSERT INTO users (username, password_hash, role, full_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role, full_name = EXCLUDED.full_name
      `, [u.username, u.hash, u.role, u.full_name]);
    }

    console.log('[DemoSeeder] Создание демонстрационных подрядчиков...');
    const demoContractors = [
      {
        inn: '7810123450',
        name_short: 'ООО «СеверСвязьМонтаж»',
        name_full: 'Общество с ограниченной ответственностью «СеверСвязьМонтаж»',
        type: 'subcontractor',
        director: 'Смирнов Андрей Николаевич',
        phone: '+7 (911) 222-33-44',
        address_legal: 'г. Санкт-Петербург, Лиговский пр-кт, д. 50'
      },
      {
        inn: '7702987654',
        name_short: 'ИП Иванов П.С. (Оптика/ВОЛС)',
        name_full: 'Индивидуальный предприниматель Иванов Петр Сергеевич',
        type: 'subcontractor',
        director: 'Иванов Петр Сергеевич',
        phone: '+7 (926) 333-44-55',
        address_legal: 'г. Москва, ул. Профсоюзная, д. 12'
      },
      {
        inn: '2901456789',
        name_short: 'ООО «ПоморТелеком»',
        name_full: 'Общество с ограниченной ответственностью «ПоморТелеком»',
        type: 'subcontractor',
        director: 'Васильев Олег Игоревич',
        phone: '+7 (8182) 44-55-66',
        address_legal: 'г. Архангельск, Троицкий пр-кт, д. 20'
      }
    ];

    const contractorIds = {};
    for (const c of demoContractors) {
      const res = await pool.query(`
        INSERT INTO contractors (inn, name_short, name_full, type, director, phone, address_legal, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
        ON CONFLICT (inn) DO UPDATE SET name_short = EXCLUDED.name_short
        RETURNING id
      `, [c.inn, c.name_short, c.name_full, c.type, c.director, c.phone, c.address_legal]);
      contractorIds[c.name_short] = res.rows[0].id;
    }

    console.log('[DemoSeeder] Генерация 15 эталонных синтетических заявок по регионам...');
    const demoTasks = [
      {
        id: 'ДЕМО-7801-26',
        region: 'Санкт-Петербург',
        address: 'г. Санкт-Петербург, Невский пр-кт, д. 104',
        tip_obj: 'Отделение банка',
        work_type: 'Монтаж СКС Cat.5e 6 портов',
        vsp: '9055/0142',
        gosb: 'Северо-Западный банк',
        date_zayavki: '2026-09-10',
        deadline: '2026-09-28',
        manager: 'Алексей Менеджеров',
        contractor: 'ООО «СеверСвязьМонтаж»',
        in_order: 6,
        fact: 6,
        amount: 54000,
        macro_status: 'install',
        stage_num: 4
      },
      {
        id: 'ДЕМО-7802-26',
        region: 'Санкт-Петербург',
        address: 'г. Санкт-Петербург, Московский пр-кт, д. 220',
        tip_obj: 'Офис самообслуживания',
        work_type: 'Установка и подключение 2 банкоматов',
        vsp: '9055/0819',
        gosb: 'Северо-Западный банк',
        date_zayavki: '2026-09-12',
        deadline: '2026-09-30',
        manager: 'Алексей Менеджеров',
        contractor: 'ООО «СеверСвязьМонтаж»',
        in_order: 2,
        fact: 2,
        amount: 28000,
        macro_status: 'id_in_progress',
        stage_num: 5
      },
      {
        id: 'ДЕМО-7701-26',
        region: 'Москва',
        address: 'г. Москва, ул. Вавилова, д. 19',
        tip_obj: 'Центральный офис',
        work_type: 'Модернизация серверной и СКС 24 порта',
        vsp: '9038/0101',
        gosb: 'Московский банк',
        date_zayavki: '2026-09-01',
        deadline: '2026-09-20',
        manager: 'Алексей Менеджеров',
        contractor: 'ИП Иванов П.С. (Оптика/ВОЛС)',
        in_order: 24,
        fact: 24,
        amount: 216000,
        macro_status: 'accepted',
        stage_num: 7
      },
      {
        id: 'ДЕМО-7702-26',
        region: 'Москва',
        address: 'г. Москва, Ленинградский пр-кт, д. 36',
        tip_obj: 'Отделение банка',
        work_type: 'Прокладка ВОЛС 8 волокон + СКС 8 портов',
        vsp: '9038/0450',
        gosb: 'Московский банк',
        date_zayavki: '2026-09-15',
        deadline: '2026-10-05',
        manager: 'Алексей Менеджеров',
        contractor: 'ИП Иванов П.С. (Оптика/ВОЛС)',
        in_order: 8,
        fact: 0,
        amount: 88000,
        macro_status: 'assigned',
        stage_num: 2
      },
      {
        id: 'ДЕМО-2901-26',
        region: 'Архангельская обл.',
        address: 'г. Архангельск, ул. Воскресенская, д. 11',
        tip_obj: 'Отделение ВСП',
        work_type: 'Монтаж СКС 4 порта',
        vsp: '8637/0055',
        gosb: 'Архангельское отделение №8637',
        date_zayavki: '2026-09-05',
        deadline: '2026-09-22',
        manager: 'Алексей Менеджеров',
        contractor: 'ООО «ПоморТелеком»',
        in_order: 4,
        fact: 4,
        amount: 36000,
        macro_status: 'id_delivered',
        stage_num: 6
      },
      {
        id: 'ДЕМО-2902-26',
        region: 'Архангельская обл.',
        address: 'г. Северодвинск, ул. Ломоносова, д. 85',
        tip_obj: 'Допофис',
        work_type: 'Аварийно-восстановительные работы ВОЛС',
        vsp: '8637/0112',
        gosb: 'Архангельское отделение №8637',
        date_zayavki: '2026-09-18',
        deadline: '2026-09-25',
        manager: 'Алексей Менеджеров',
        contractor: 'ООО «ПоморТелеком»',
        in_order: 1,
        fact: 0,
        amount: 22000,
        macro_status: 'in_progress',
        stage_num: 1
      },
      {
        id: 'ДЕМО-1601-26',
        region: 'Татарстан',
        address: 'г. Казань, ул. Баумана, д. 58',
        tip_obj: 'Флагманский офис',
        work_type: 'Монтаж СКС 16 портов + Wi-Fi точки',
        vsp: '8610/0034',
        gosb: 'Отделение «Банк Татарстан»',
        date_zayavki: '2026-09-02',
        deadline: '2026-09-19',
        manager: 'Алексей Менеджеров',
        contractor: 'ООО «СеверСвязьМонтаж»',
        in_order: 16,
        fact: 16,
        amount: 144000,
        macro_status: 'billing',
        stage_num: 8
      },
      {
        id: 'ДЕМО-6601-26',
        region: 'Свердловская обл.',
        address: 'г. Екатеринбург, пр-кт Ленина, д. 25',
        tip_obj: 'Отделение банка',
        work_type: 'Монтаж СКС Cat.6 12 портов',
        vsp: '7003/0010',
        gosb: 'Уральский банк',
        date_zayavki: '2026-08-20',
        deadline: '2026-09-10',
        manager: 'Алексей Менеджеров',
        contractor: 'ИП Иванов П.С. (Оптика/ВОЛС)',
        in_order: 12,
        fact: 12,
        amount: 108000,
        macro_status: 'paid',
        stage_num: 9
      },
      {
        id: 'ДЕМО-7803-26',
        region: 'Санкт-Петербург',
        address: 'г. Санкт-Петербург, ул. Савушкина, д. 126',
        tip_obj: 'Офис самообслуживания',
        work_type: 'Обследование и монтаж 2 рабочих мест',
        vsp: '9055/0432',
        gosb: 'Северо-Западный банк',
        date_zayavki: '2026-09-22',
        deadline: '2026-10-10',
        manager: 'Алексей Менеджеров',
        contractor: '',
        in_order: 2,
        fact: 0,
        amount: 24000,
        macro_status: 'new',
        stage_num: 0
      }
    ];

    for (const t of demoTasks) {
      await pool.query(`
        INSERT INTO tasks (
          id, region, address, tip_obj, work_type, vsp, gosb,
          date_zayavki, deadline, manager, contractor, in_order, fact,
          amount, macro_status, stage_num, status, customer
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'progress', 'ПАО Сбербанк')
        ON CONFLICT (id) DO UPDATE SET macro_status = EXCLUDED.macro_status
      `, [
        t.id, t.region, t.address, t.tip_obj, t.work_type, t.vsp, t.gosb,
        t.date_zayavki, t.deadline, t.manager, t.contractor, t.in_order, t.fact,
        t.amount, t.macro_status, t.stage_num
      ]);
    }

    // 3. Создаем образцовый субподряд и генерируем реальные документы для ДЕМО-7801-26
    console.log('[DemoSeeder] Создание образцовых субподрядов и генерация DOCX документов...');
    const subRes = await pool.query(`
      INSERT INTO task_subcontracts (
        task_id, contractor_id, work_type, status, price_agreed, deadline,
        installer_fio, installer_phone, installer_passport, auto_number, comment
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      'ДЕМО-7801-26',
      contractorIds['ООО «СеверСвязьМонтаж»'],
      'Монтаж СКС 6 портов',
      'in_progress',
      27000,
      '2026-09-28',
      'Иван Монтажников',
      '+7 (911) 987-65-43',
      '4014 987654, выдан УМВД по СПб',
      'в123ух 178 (ГАЗель)',
      'Ключи от серверной у дежурного инженера ВСП'
    ]);
    const demoSub = subRes.rows[0];

    // Генерируем реальные файлы Word в uploads/documents
    const docsDir = path.join(UPLOADS_DIR, 'documents');
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    const sampleTask = demoTasks[0];
    const sampleContractor = demoContractors[0];

    const bufOrder = await generateSubcontractOrder({
      task: sampleTask,
      subcontract: demoSub,
      contractor: sampleContractor,
      orderNumber: 'ЗН-ДЕМО-7801-01'
    });
    const orderFileName = `order_subcontract_demo_7801.docx`;
    fs.writeFileSync(path.join(docsDir, orderFileName), bufOrder);

    await pool.query(`
      INSERT INTO task_documents (task_id, subcontract_id, doc_type, doc_number, title, file_url)
      VALUES ($1, $2, 'order_subcontract', 'ЗН-ДЕМО-7801-01', 'Заказ-наряд № ЗН-ДЕМО-7801-01 (ООО СеверСвязьМонтаж)', $3)
    `, ['ДЕМО-7801-26', demoSub.id, `/uploads/documents/${orderFileName}`]);

    const bufPermit = await generatePermitLetter({
      task: sampleTask,
      specialists: [{
        full_name: 'Иван Монтажников',
        passport_series_number: '4014 987654',
        passport_issued_by: 'УМВД по СПб',
        passport_issue_date: '10.04.2019',
        phone: '+7 (911) 987-65-43',
        auto_number: 'в123ух 178'
      }],
      contractor: sampleContractor,
      letterNumber: 'ИСХ-ДЕМО-7801-ДОП'
    });
    const permitFileName = `permit_letter_demo_7801.docx`;
    fs.writeFileSync(path.join(docsDir, permitFileName), bufPermit);

    await pool.query(`
      INSERT INTO task_documents (task_id, subcontract_id, doc_type, doc_number, title, file_url)
      VALUES ($1, $2, 'permit_letter', 'ИСХ-ДЕМО-7801-ДОП', 'Письмо на допуск монтажников (ВСП 9055/0142)', $3)
    `, ['ДЕМО-7801-26', demoSub.id, `/uploads/documents/${permitFileName}`]);

    console.log('[DemoSeeder] ДЕМО-БАЗА stockeasy_demo УСПЕШНО НАПОЛНЕНА!');
    console.log('Пользователи для входа:');
    console.log('  1. Руководитель (Милана Городович):  логин "milana", пароль "chaykaxxx228"');
    console.log('  2. Администратор (Никита Чайка):    логин "nikita", пароль "chaykaxxx228"');
    console.log('  3. Менеджер проектов:                логин "manager1", пароль "123456"');
    console.log('  4. Монтажник:                        логин "worker1", пароль "123456"');
    console.log('  5. Проектировщик:                    логин "designer1", пароль "123456"');
    console.log('  6. Финансист:                        логин "buh1", пароль "123456"');
  } catch (err) {
    console.error('[DemoSeeder] Ошибка сидирования демо-базы:', err);
  } finally {
    await pool.end();
  }
}

seedDemoData();
