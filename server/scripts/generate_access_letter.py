import sys
import json
import docx

def generate_letter(config):
    template_path = config.get('template_path', r'c:\stockeasy_local\документы\Dlya_poluchenia_dopuska.docx')
    output_path = config.get('output_path')
    contractor_name = config.get('contractor_name', 'ООО "Ультима"')
    responsible_info = config.get('responsible_info', '8(923) 102-40-42, ПМ – Чайка Алексей Николаевич')
    task_info = config.get('task_info', '')
    specialists = config.get('specialists', [])

    doc = docx.Document(template_path)
    t = doc.tables[0]

    # Row 0: Contractor name
    for c in t.rows[0].cells:
        c.text = f'Наименование организации Подрядчика: {contractor_name}'

    # Row 1: Responsible person
    resp_text = f'Контактный номер телефона, должность и ФИО ответственного за выполнение работ: {responsible_info}'
    if task_info:
        resp_text += f'\nОбъект / Основание: {task_info}'
    for c in t.rows[1].cells:
        c.text = resp_text

    # We want rows 0, 1, 2 (2 is header)
    # Delete rows from index 3 to the end
    while len(t.rows) > 3:
        # remove last row
        row_element = t.rows[-1]._tr
        t._tbl.remove(row_element)

    # Add rows for selected specialists
    for s in specialists:
        row = t.add_row()
        # Row has 6 physical cells due to table structure, but logically 5 columns
        cells = row.cells
        # Deduplicate cell references (merged cells)
        unique_cells = []
        for c in cells:
            if not unique_cells or c._tc != unique_cells[-1]._tc:
                unique_cells.append(c)
        
        last_name = s.get('last_name') or (s.get('full_name', '').split(' ')[0] if s.get('full_name') else '')
        first_name = s.get('first_name') or (s.get('full_name', '').split(' ')[1] if len(s.get('full_name', '').split(' ')) > 1 else '')
        parts = s.get('full_name', '').split(' ')
        middle_name = s.get('middle_name') or (' '.join(parts[2:]) if len(parts) > 2 else '')
        passport = s.get('passport_raw') or s.get('passport_data') or s.get('passport_series_number', '')
        phone = s.get('phone', '')

        if len(unique_cells) >= 5:
            unique_cells[0].text = last_name
            unique_cells[1].text = first_name
            unique_cells[2].text = middle_name
            unique_cells[3].text = passport
            unique_cells[4].text = phone
        elif len(cells) >= 5:
            cells[0].text = last_name
            cells[1].text = first_name
            cells[2].text = middle_name
            cells[3].text = passport
            cells[4].text = phone

    doc.save(output_path)
    return True

if __name__ == '__main__':
    config_file = sys.argv[1]
    with open(config_file, 'r', encoding='utf-8') as f:
        cfg = json.load(f)
    generate_letter(cfg)
    print("SUCCESS")
