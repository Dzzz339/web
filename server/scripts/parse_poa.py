#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, re, json

MONTHS_RU = {
    'января': '01', 'янв': '01',
    'февраля': '02', 'фев': '02',
    'марта': '03', 'мар': '03',
    'апреля': '04', 'апр': '04',
    'мая': '05',
    'июня': '06', 'июн': '06',
    'июля': '07', 'июл': '07',
    'августа': '08', 'авг': '08',
    'сентября': '09', 'сен': '09',
    'октября': '10', 'окт': '10',
    'ноября': '11', 'ноя': '11',
    'декабря': '12', 'дек': '12',
}

def parse_ru_date(text):
    if not text:
        return None
    text = text.strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}$', text):
        return text
    m1 = re.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{4})$', text)
    if m1:
        d, m, y = m1.groups()
        return f"{y}-{int(m):02d}-{int(d):02d}"
    m2 = re.search(r'(\d{1,2})\s+([а-яёА-ЯЁ]+)\s+(\d{4})', text)
    if m2:
        d, mon, y = m2.groups()
        mon_lower = mon.lower()
        if mon_lower in MONTHS_RU:
            return f"{y}-{MONTHS_RU[mon_lower]}-{int(d):02d}"
    return None

def extract_pdf_text(pdf_path):
    text = ""
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text += "\n" + t
    except Exception as e:
        try:
            from pypdf import PdfReader
            reader = PdfReader(pdf_path)
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    text += "\n" + t
        except Exception as e2:
            pass
    return text

def parse_poa(pdf_path):
    text = extract_pdf_text(pdf_path)
    res = {
        "number": None,
        "issue_date": None,
        "valid_until": None,
        "person_name": None,
        "organization": None,
        "contractor_name": None,
        "passport_series": None,
        "passport_number": None,
        "passport_issued_by": None,
        "passport_issue_date": None,
        "account_pay": None,
        "bank_name": None,
        "bik": None,
        "account_corr": None,
        "raw_text": text[:1500] if text else ""
    }

    if not text:
        return res

    # 1. Number
    m_num = re.search(r'ДОВЕРЕННОСТЬ\s*№\s*(\S+)', text, re.IGNORECASE)
    if not m_num:
        m_num = re.search(r'Номер\s+доверенности\s*[\r\n]+(?:[^\r\n]+[\r\n]+)?(\S+)', text, re.IGNORECASE)
    if m_num:
        res["number"] = m_num.group(1).strip()

    # 2. Dates
    m_issue = re.search(r'Дата\s*выдачи:\s*(\d{1,2}\s+[а-яА-ЯёЁ]+\s+\d{4})', text, re.IGNORECASE)
    if not m_issue:
        m_issue = re.search(r'Дата\s*выдачи\s*[\r\n]+(?:[^\r\n]+[\r\n]+)?(?:\S+\s+)?(\d{2}\.\d{2}\.\d{4})', text, re.IGNORECASE)
    if m_issue:
        res["issue_date"] = parse_ru_date(m_issue.group(1))

    m_valid = re.search(r'действительна\s*по:\s*(\d{1,2}\s+[а-яА-ЯёЁ]+\s+\d{4})', text, re.IGNORECASE)
    if not m_valid:
        m_valid = re.search(r'Срок\s*действия\s*[\r\n]+(?:[^\r\n]+[\r\n]+)?(?:\S+\s+)?(?:\S+\s+)?(\d{2}\.\d{2}\.\d{4})', text, re.IGNORECASE)
    if m_valid:
        res["valid_until"] = parse_ru_date(m_valid.group(1))

    # 3. Organization
    m_org = re.search(r'наименование\s*организации\s*[\r\n]+(ООО\s*"[^"]+")', text, re.IGNORECASE)
    if not m_org:
        m_org = re.search(r'(ООО\s*"[^"]+")(?=.*ИНН)', text, re.IGNORECASE)
    if not m_org:
        m_org = re.search(r'(ООО\s*"[^"]+")', text, re.IGNORECASE)
    if m_org:
        res["organization"] = m_org.group(1).strip()

    # 4. Person Name
    m_person = re.search(r'Доверенность\s*выдана\s+([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)', text)
    if not m_person:
        m_person = re.search(r'([А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+)(?=\s*[\r\n]+.*Расписка)', text)
    if m_person:
        res["person_name"] = m_person.group(1).strip()

    # 5. Contractor (Supplier)
    m_contr = re.search(r'На\s*получение\s*от\s+([^\r\n]+)', text, re.IGNORECASE)
    if not m_contr:
        m_contr = re.search(r'Поставщик\s*[\r\n]+(?:[^\r\n]+[\r\n]+)?([^\r\n]+)', text, re.IGNORECASE)
    if m_contr:
        c_name = m_contr.group(1).strip()
        c_name = re.sub(r'\s*наименование.*$', '', c_name, flags=re.IGNORECASE)
        res["contractor_name"] = c_name.strip()

    # 6. Passport
    m_pass = re.search(r'Паспорт:\s*серия\s*([\d\s]+)\s*№\s*(\d+)', text, re.IGNORECASE)
    if m_pass:
        res["passport_series"] = m_pass.group(1).strip()
        res["passport_number"] = m_pass.group(2).strip()

    m_issued_by = re.search(r'Кем\s*выдан\s+([^\r\n]+)', text, re.IGNORECASE)
    if m_issued_by:
        res["passport_issued_by"] = m_issued_by.group(1).strip()

    m_pass_date = re.search(r'Дата\s*выдачи\s+(\d{1,2}\s+[а-яА-ЯёЁ]+\s+\d{4})', text, re.IGNORECASE)
    if m_pass_date:
        res["passport_issue_date"] = parse_ru_date(m_pass_date.group(1)) or m_pass_date.group(1).strip()

    # 7. Bank accounts
    m_acc = re.search(r'р/с\s*(\d{20})', text, re.IGNORECASE)
    if m_acc:
        res["account_pay"] = m_acc.group(1).strip()

    m_bik = re.search(r'БИК\s*(\d{9})', text, re.IGNORECASE)
    if m_bik:
        res["bik"] = m_bik.group(1).strip()

    m_corr = re.search(r'к/с\s*(\d{20})', text, re.IGNORECASE)
    if m_corr:
        res["account_corr"] = m_corr.group(1).strip()

    return res

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)
    try:
        data = parse_poa(sys.argv[1])
        # Ensure utf-8 output without windows cp1251 escapes
        sys.stdout.buffer.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
        sys.exit(0)
    except Exception as e:
        sys.stdout.buffer.write(json.dumps({"error": str(e)}, ensure_ascii=False).encode('utf-8'))
        sys.exit(1)
