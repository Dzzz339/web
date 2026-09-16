import sys
import json
import re
import docx

def parse_docx(docx_path):
    doc = docx.Document(docx_path)
    t = doc.tables[0]
    specialists = []
    for r_idx in range(3, len(t.rows)):
        cells = [c.text.strip() for c in t.rows[r_idx].cells]
        row_vals = []
        for c in cells:
            if not row_vals or c != row_vals[-1]:
                row_vals.append(c)
        if len(row_vals) >= 4 and row_vals[0]:
            last_name = row_vals[0]
            first_name = row_vals[1] if len(row_vals) > 1 else ''
            middle_name = row_vals[2] if len(row_vals) > 2 else ''
            passport = row_vals[3] if len(row_vals) > 3 else ''
            phone = row_vals[4] if len(row_vals) > 4 else ''
            full_name = f"{last_name} {first_name} {middle_name}".strip()
            
            # extract series/number if present
            # e.g. "50 08 №446468", "5014 252604", "5020 №058454"
            sn_match = re.search(r'(\d{2}\s*\d{2})\s*(?:№\s*)?(\d{6})', passport)
            passport_sn = f"{sn_match.group(1).replace(' ', '')} {sn_match.group(2)}" if sn_match else ''
            
            # extract issue date if present
            date_match = re.search(r'(\d{2}\.\d{2}\.\d{4})', passport)
            passport_date = date_match.group(1) if date_match else ''

            pos = 'Руководитель проекта (ПМ)' if 'Чайка Алексей' in full_name else 'Монтажник СКС'
            
            specialists.append({
                'full_name': full_name,
                'phone': phone,
                'passport_raw': passport,
                'passport_series_number': passport_sn,
                'passport_issue_date': passport_date,
                'organization': 'ООО "Ультима"',
                'position': pos
            })
    return specialists

if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else r'c:\stockeasy_local\документы\Dlya_poluchenia_dopuska.docx'
    data = parse_docx(path)
    sys.stdout.reconfigure(encoding='utf-8')
    print(json.dumps(data, ensure_ascii=False, indent=2))
