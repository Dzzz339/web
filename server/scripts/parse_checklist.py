import sys
import json
import re
import os

# Настройка UTF-8 для Windows/Linux
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def parse_bool(val):
    if not val:
        return False
    s = str(val).strip().lower()
    return s in ['да', 'yes', 'true', '+', '1']

def parse_num(val, default=0):
    if not val:
        return default
    s = str(val).strip().replace(',', '.')
    m = re.search(r'[-+]?\d*\.?\d+', s)
    if m:
        try:
            num = float(m.group(0))
            return int(num) if num.is_integer() else num
        except Exception:
            return default
    return default

def clean_str(val):
    if not val:
        return ''
    return str(val).strip().replace('\n', ' ')

def parse_checklist_pdf(pdf_path):
    if not os.path.exists(pdf_path):
        return {"error": f"Файл не найден: {pdf_path}"}

    import pdfplumber

    extracted_rows = []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                # 1. Пробуем извлечь таблицы
                tables = page.extract_tables()
                for table in tables:
                    for row in table:
                        if not row or len(row) < 2:
                            continue
                        
                        # Если 3 колонки: [№, Наименование, Примечание]
                        if len(row) >= 3:
                            num = clean_str(row[0])
                            name = clean_str(row[1])
                            val = clean_str(row[2])
                        else:
                            num = ''
                            name = clean_str(row[0])
                            val = clean_str(row[1])
                            
                        if name and name.lower() != 'наименование':
                            extracted_rows.append({"num": num, "name": name, "val": val})

                # Если таблица не определилась — пробуем текстовое извлечение построчно
                if not extracted_rows:
                    text = page.extract_text() or ''
                    for line in text.split('\n'):
                        line = line.strip()
                        m = re.match(r'^(\d{1,2})\s+(.+?)\s+([«"0-9а-яА-Яa-zA-Z].*)$', line)
                        if m:
                            extracted_rows.append({"num": m.group(1), "name": m.group(2).strip(), "val": m.group(3).strip()})

    except Exception as e:
        return {"error": f"Ошибка чтения PDF: {str(e)}"}

    # Словарь сопоставления по номерам или подстрокам
    lookup = {}
    for r in extracted_rows:
        num = r['num']
        name_lower = r['name'].lower()
        val = r['val']
        if num and num.isdigit():
            lookup[int(num)] = val
        lookup[name_lower] = val

    def get_field(num, *keywords):
        if num in lookup and lookup[num]:
            return lookup[num]
        for kw in keywords:
            kw_l = kw.lower()
            for k, v in lookup.items():
                if isinstance(k, str) and kw_l in k and v:
                    return v
        return ''

    # Извлекаем все 43 параметра
    result = {
        "survey_date": get_field(1, "дата проведения обследования"),
        "zno_number": get_field(2, "№ зно", "зно"),
        "address": get_field(3, "адрес"),
        "room_name": get_field(4, "номер/наименование помещения", "помещения"),
        "work_type": get_field(5, "вид работ") or "монтаж",
        "ports_install": parse_num(get_field(6, "к монтажу"), 1),
        "ports_move": parse_num(get_field(7, "к переносу"), 0),
        "ports_dismantle": parse_num(get_field(8, "к демонтажу"), 0),
        "ports_restore": parse_num(get_field(9, "к восстановлению"), 0),
        "surface_type": get_field(10, "поверхность монтажа") or "Фальш-потолок(Армстронг)",
        "has_hatches": parse_bool(get_field(11, "монтажных лючков")),
        "has_drops": parse_bool(get_field(12, "монтажных опусков")),
        "socket_surface": get_field(13, "поверхность установки розетки") or "в столе",
        "desk_present": parse_bool(get_field(14, "стол в наличии")),
        "employee_working": parse_bool(get_field(15, "уже работает сотрудник")),
        "floor_installation": parse_bool(get_field(17, "за фальш-полом")),
        "ceiling_height": parse_num(get_field(18, "высота потолков"), 2.0),
        "has_floor_passage": parse_bool(get_field(19, "межэтажных проходов")),
        "has_tray": parse_bool(get_field(21, "металлического лотка")),
        "has_cable_channel": parse_bool(get_field(23, "наличие кабель-канала")),
        "cable_channel_vendor": get_field(24, "производитель кабель-канала"),
        "cable_channel_size": get_field(25, "размер кабель канала", "размер кабель-канала"),
        "add_cable_channel_needed": parse_bool(get_field(26, "требуется установка доп")),
        "add_cable_channel_meters": parse_num(get_field(27, "метраж установки доп"), 0),
        "sockets_mounted": parse_bool(get_field(28, "электрические розетки уже смонтированы")),
        "socket_mount_type": get_field(29, "способ монтажа электрических розеток"),
        "has_server_room": parse_bool(get_field(30, "есть серверная/кроссовая")),
        "has_telecom_closet": parse_bool(get_field(31, "есть телекоммуникационный шкаф")),
        "patch_panel_needed": parse_bool(get_field(32, "требуется установка патч-панелей")),
        "patch_panel_free_num": get_field(33, "номер патч-панели со свободными портами") or "1",
        "port_marking": get_field(34, "маркировка планируемых к установке портов") or "ССМ 1",
        "sbs_contact": get_field(35, "контакты сотрудника сбс"),
        "materials_needed": parse_bool(get_field(36, "нужны ли материалы подрядчику")),
        "materials_patch_panels": parse_num(get_field(37, "количество патч панелей"), 0),
        "materials_organizers": parse_num(get_field(38, "количество кабельных органайзеров"), 0),
        "materials_modules_black": parse_num(get_field(39, "модулей black"), 0),
        "materials_modules_white": parse_num(get_field(40, "модулей white"), 0),
        "materials_faceplates": parse_num(get_field(41, "рамок суппорта", "лицевых панелей"), 0),
        "materials_cable_meters": parse_num(get_field(42, "метров кабеля"), 0),
        "materials_surface_boxes": parse_num(get_field(43, "накладных розеток"), 0),
        "raw_rows": extracted_rows
    }

    if result["zno_number"]:
        m = re.search(r'([А-ЯA-Z0-9_-]{5,})', result["zno_number"])
        if m:
            result["zno_number"] = m.group(1)

    return result

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Укажите путь к PDF файлу в аргументах"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    res = parse_checklist_pdf(pdf_path)
    print(json.dumps(res, ensure_ascii=False, indent=2))
