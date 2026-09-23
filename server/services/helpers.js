import XLSX from 'xlsx';

// Конвертируем snake_case из БД в camelCase для фронтенда
export function rowToTask(r) {
  return {
    id:           r.id,
    sheet:        r.sheet,
    title:        r.id + (r.address ? ' — ' + r.address.slice(0,80) : ''),
    region:       r.region,
    address:      r.address,
    workType:     r.work_type,
    tipObj:       r.tip_obj,
    gosb:         r.gosb,
    vsp:          r.vsp,
    dateZayavki:  r.date_zayavki   ? new Date(r.date_zayavki).toLocaleDateString('en-CA') : null,
    deadline:     r.deadline       ? new Date(r.deadline).toLocaleDateString('en-CA') : null,
    currentDate:  r.date_vnesen   ? new Date(r.date_vnesen).toLocaleDateString('en-CA') : null,
    manager:      r.manager,
    contact:      r.contact,
    contractor:   r.contractor,
    inOrder:      Number(r.in_order)      || 0,
    fact:         Number(r.fact)          || 0,
    obsledovanie: r.obsledovanie,
    dostup:       r.dostup,
    dataVyhoda:   r.data_vyhoda  ? new Date(r.data_vyhoda).toLocaleDateString('en-CA') : null,
    priemka:      r.priemka,
    oplata:       r.oplata,
    idStatus:     r.id_status,
    amount:       Number(r.amount)        || 0,
    kmRate:       Number(r.km_rate) || 0,
    distanceKm:   Number(r.distance_km)  || 0,
    pricePerUnit: Number(r.price_per_unit)|| 0,
    techLink:     r.tech_link,
    edoNumber:    r.edo_number,
    invoiceInfo:  r.invoice_info,
    vedoStatus:   r.vedo_status,
    excelComment: r.excel_comment,
    status:       r.status,
    priority:     r.priority,
    overdueDays:  Number(r.overdue_days) || 0,
    stage:        r.stage,
    archived:     r.archived,
    assignee:     r.assignee,
    assignmentStatus: r.assignment_status,
    controller:   r.controller,
    comment:      r.comment,
    distributedAt: r.distributed_at ? new Date(r.distributed_at).toLocaleDateString('en-CA') : null,
    _history:     r.history || [],
    rawData:      r.raw_data || {},
    tmc:          Number(r.tmc) || 0,
    extras:       Number(r.extras) || 0,
    supplierOrderSigned: r.supplier_order_signed || false,
    supplierIdUploaded:  r.supplier_id_uploaded || false,
    overdueReason: r.overdue_reason,
    customer:      r.customer || 'ПАО Сбербанк',
    stageNum:      Number(r.stage_num) || 0,
    version:       Number(r.version) || 0,
    managerId:     r.manager_id ? Number(r.manager_id) : null,
    designerId:    r.designer_id ? Number(r.designer_id) : null,
    materialsLink: r.materials_link || '',
    idLink:        r.id_link || '',
    stageDue:      r.stage_due ? new Date(r.stage_due).toISOString() : null,
    macroStatus:   r.macro_status || 'new',
    activeProcesses: r.active_processes || ['0'],
    customerId:    r.customer_id ? Number(r.customer_id) : null,
    openRemarksCount: Number(r.open_remarks_count) || 0,
  };
}

export function safeDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let iso = null;
  // YYYY-MM-DD или YYYY-MM-DDTHH:MM:SS
  const isoMatch = s.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoMatch)) iso = isoMatch;
  // ДД.ММ.ГГГГ
  else {
    const ru = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
    if (ru) iso = `${ru[3]}-${ru[2]}-${ru[1]}`;
    else {
      const sl = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (sl) iso = `${sl[3]}-${sl[2]}-${sl[1]}`;
    }
  }
  if (!iso) return null;
  // Проверяем что дата реально существует (31 июня, 29 февраля и т.п.)
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return iso;
}

export function computeStats(tasks) {
  const total = tasks.length;
  const done = tasks.filter(r => r.status === 'done').length;
  const cancelled = tasks.filter(r => r.status === 'cancelled').length;
  const overdue = tasks.filter(r => r.overdueDays > 0).length;
  const revenue = tasks.reduce((s,r) => s + (Number(r.amount)||0), 0);
  return {
    tasks:   { total, done, pending: total-done-cancelled, cancelled },
    orders:  { total, pending: total-done-cancelled, done },
    supply:  { steps: 6, completed: done, overdue },
    revenue: { total: revenue, month: revenue }
  };
}

export function buildChainsFromRows(tasks) {
  const byRegion = {};
  for (const r of tasks) {
    const key = r.region || 'Прочее';
    if (!byRegion[key]) byRegion[key] = [];
    byRegion[key].push(r);
  }
  const steps = ['Заявка','Обследование','Монтаж','Контроль','Приёмка','Оплата'];
  return Object.entries(byRegion).map(([region, items]) => {
    const total = items.length;
    const done = items.filter(i => i.status === 'done').length;
    const cancelled = items.filter(i => i.status === 'cancelled').length;
    const ratio = total > 0 ? done / total : 0;
    const currentStep = Math.min(Math.floor(ratio * steps.length), steps.length - 1);
    return {
      id: region, name: `${region} (${total} заявок)`,
      status: done === total ? 'completed' : 'in_progress',
      steps, currentStep, totalTasks: total, doneTasks: done,
      cancelledTasks: cancelled, inProgressTasks: total - done - cancelled,
      totalAmount: items.reduce((s,i) => s + (Number(i.amount)||0), 0)
    };
  }).sort((a,b) => b.totalTasks - a.totalTasks);
}

export function calcPricePerPort(ports) { return ports >= 3 ? 3750 : ports === 2 ? 4250 : 5000; }
export function calcTransport(km) {
  if (!km || km <= 0) return 0;
  if (km > 200) return km*2*35;
  if (km > 100) return km*2*30;
  if (km > 50)  return km*2*25;
  if (km > 10)  return km*2*15;
  return 0;
}
export function calcTotal(ports, km) { return calcTransport(km) + calcPricePerPort(ports)*ports; }
export function fmtDate(d) {
  if (!d) return new Date().toLocaleDateString('ru-RU');
  try { return new Date(d).toLocaleDateString('ru-RU'); } catch { return String(d); }
}
export function numToWords(n) {
  if (!n) return 'Ноль рублей 00 копеек.';
  n = Math.round(n);
  const e1f=['','одна','две','три','четыре','пять','шесть','семь','восемь','девять'];
  const e1m=['','один','два','три','четыре','пять','шесть','семь','восемь','девять'];
  const e2=['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
  const e3=['','','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
  const e4=['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];
  function morph(n,one,two,five){ if(n%100>=11&&n%100<=19)return five; if(n%10===1)return one; if(n%10>=2&&n%10<=4)return two; return five; }
  function block(n,fem){ const arr=fem?e1f:e1m; let r=''; const h=Math.floor(n/100); if(h)r+=e4[h]+' '; const t=Math.floor((n%100)/10),u=n%10; if(t===1)return r+e2[u]+' '; if(t)r+=e3[t]+' '; if(u)r+=arr[u]+' '; return r; }
  const m=Math.floor(n/1000000),th=Math.floor((n%1000000)/1000),r=n%1000;
  let res='';
  if(m) res+=block(m,false)+morph(m,'миллион','миллиона','миллионов')+' ';
  if(th)res+=block(th,true)+morph(th,'тысяча','тысячи','тысяч')+' ';
  if(r) res+=block(r,false);
  res=res.trim();
  return res.charAt(0).toUpperCase()+res.slice(1)+' рублей  00 копеек.';
}

export function buildApp2(task, contractorName = null, items = []) {
  const wb = XLSX.utils.book_new();
  const ports = task.fact || task.inOrder || 0;
  const km = Number(task.distanceKm) || 0;
  const tr = calcTransport(km);
  const ppp = calcPricePerPort(ports);
  const fallbackTotal = calcTotal(ports, km);

  const executor = contractorName || task.assignee || task.contractor || '—';

  let data = [
    ['Приложение №2'],
    ['к Договору № _____ от "__" _______ 202_г.'],
    ['Заявка на выполнение работ (Заказ-наряд)'],
    ['Исполнитель (Подрядчик)', executor],
    ['Дата распределения', task.distributedAt || fmtDate()],
    ['Куратор от Заказчика', task.manager || '—'],
    [],
    ['1. Содержание заявки, контактная и техническая информация, сроки выполнения'],
    ['Регион (договор)', task.region || '—'],
    ['Номер заявки', task.id],
    ['Дата заявки', task.deadline || '—'],
    ['Срок выполнения', task.deadline || '—'],
    ['Кол-во дней просрочки', task.overdueDays || 0],
    ['Адрес выполнения работ', task.address || '—'],
    ['Контакт / сопровождающий', task.contact || task.contractor || '—'],
    ['Ссылка на Тех.Информацию', task.techLink || '—'],
    ['Комментарий', task.comment || '']
  ];

  let totalWorksCost = 0;

  if (items && items.length > 0) {
    data.push([]);
    data.push(['2. Спецификация поручаемых работ и материалов:']);
    data.push(['№', 'Вид работ / Оборудование', 'Кол-во', 'Ед.', 'Цена за ед., руб.', 'Сумма, руб.']);
    items.forEach((it, idx) => {
      const q = Number(it.quantity) || 1;
      const price = Number(it.price_contractor) || 0;
      const rowSum = Number(it.amount_contractor) || (q * price);
      totalWorksCost += rowSum;
      data.push([
        idx + 1,
        it.work_type || '—',
        q,
        it.unit || 'шт.',
        price,
        rowSum
      ]);
    });
  } else {
    data.push(['ТИП РАБОТ', task.workType || '—']);
    data.push(['Количество портов (В заказе / Факт)', `${task.inOrder || 0} / ${task.fact || 0}`]);
    totalWorksCost = ppp * ports;
  }

  const grandTotal = (totalWorksCost > 0 ? totalWorksCost : fallbackTotal) + tr;

  data.push([]);
  data.push(['3. Стоимость работ и транспортные расходы:']);
  data.push(['Стоимость работ по спецификации, руб.', totalWorksCost > 0 ? totalWorksCost : ppp * ports]);
  data.push(['Удалённость объекта, км', km]);
  data.push(['Транспортные расходы, руб.', tr]);
  data.push(['ИТОГО к оплате Подрядчику, руб.', grandTotal]);
  data.push([]);
  data.push(['От Заказчика', '', '', 'Директор __________________ /И.О. Городович/']);
  data.push(['От Подрядчика', '', '', `${executor} _________________ / ___________________ /`]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 8 }, { wch: 55 }, { wch: 10 }, { wch: 8 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Приложение №2');
  return wb;
}

export function buildInvoice(task) {
  const wb=XLSX.utils.book_new(),ports=task.fact||task.inOrder||0,km=Number(task.distanceKm)||0;
  const ppp=calcPricePerPort(ports),tr=calcTransport(km),total=calcTotal(ports,km);
  const desc=`Работы по заявке ${task.id} ${task.address||''} ${task.workType||''}, цена ${ppp} рублей, ${tr} руб. компенсация транспортных расходов.`;
  const data=[
    ['Подрядчик','','Заказчик'],[task.contractor||task.assignee||'—','','ПАО Сбербанк России'],
    [],[],[],[],[],
    ['Счёт на оплату №',task.id,'от',fmtDate(task.deadline)],
    ['№','Товары и услуги','Кол-во','Цена, руб.','Сумма, руб.'],[1,desc,1,total,total],
    ['Всего наименований 1 на сумму','',total,'',''],[numToWords(total)],[],[],
    ['От Подрядчика','','','','гр. РФ _________________ / ___________________ /'],
  ];
  const ws=XLSX.utils.aoa_to_sheet(data); ws['!cols']=[{wch:5},{wch:70},{wch:8},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb,ws,'Счёт'); return wb;
}

export function buildAct(task) {
  const wb=XLSX.utils.book_new(),ports=task.fact||task.inOrder||0,km=Number(task.distanceKm)||0;
  const ppp=calcPricePerPort(ports),tr=calcTransport(km),total=calcTotal(ports,km);
  const desc=`Работы по заявке ${task.id} ${task.address||''} ${task.workType||''}, цена ${ppp} рублей, ${tr} руб. компенсация транспортных расходов.`;
  const actRows=[
    [`АКТ № ${task.id}`,'','','от',fmtDate(task.deadline)],['','приёмки выполненных работ'],
    ['','к Договору № _____ от "__" _______ 202_г.'],['Заказчик'],['','ПАО Сбербанк России'],
    ['Исполнитель'],['',task.contractor||task.assignee||'—'],
    ['Основание',`Договор №_____  от ${fmtDate(task.deadline)}`],[],
    ['№','Товары и услуги','Кол-во','Цена, руб.','Сумма, руб.'],[1,desc,1,total,total],
    ['Всего наименований 1 на сумму','',total],[numToWords(total)],[],
    ['От Заказчика','','','','Директор __________________ /И.О. Городович/'],
    ['От Подрядчика','','','','гр. РФ _________________ / ___________________ /'],[],[],
  ];
  const data=[...actRows,['─────────────────────── линия отреза ───────────────────────'],[],[...actRows]];
  const ws=XLSX.utils.aoa_to_sheet(data); ws['!cols']=[{wch:12},{wch:60},{wch:8},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb,ws,'АКТ'); return wb;
}
