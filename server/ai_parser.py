import sys
import json
import fitz  # PyMuPDF
import requests
import re
import numpy as np
import easyocr

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

OLLAMA_URL = "http://stockeasy-ollama:11434/api/chat"

# Промпт (Инструкция для нейросети)
SYSTEM_PROMPT = """
Ты — строгий алгоритм-парсер. Твоя задача извлечь данные из договора Сбербанка.
ВЕРНИ ТОЛЬКО ВАЛИДНЫЙ JSON. НИКАКИХ ПОЯСНЕНИЙ И ТЕКСТА ВОКРУГ!
Правило: Все значения должны быть СТРОКАМИ или ЧИСЛАМИ. Запрещено создавать вложенные объекты.

Ищи данные СТРОГО по этим правилам (ищи слова-якоря):
- "id": Ищи строку "ЗАКАЗ НА ВЫПОЛНЕНИЕ РАБОТ №". Верни только сам номер (например, "СРБ-6562-04").
- "dateZayavki": Ищи дату в самом верху после номера заказа. Переведи в формат YYYY-MM-DD.
- "address": Ищи строку, начинающуюся со слова "Объект:". Скопируй весь текст адреса.
- "region": Вытащи только название города или населенного пункта из найденного адреса.
- "workType": Ищи текст после слов "Состав работ:".
- "inOrder": Ищи цифру перед "шт." в разделе Состав работ. Верни ТОЛЬКО ЧИСЛО.
- "amount": Ищи текст "составляет сумму в размере". Верни ТОЛЬКО ЧИСЛО, которое идет до скобок (например, 9641). Удали пробелы.
- "contact": Ищи раздел "Контактная информация о Заказчике" (ФИО и телефон).
"""

def extract_text_via_ocr(pdf_path):
    try:
        # Инициализируем OCR (используем только процессор)
        reader = easyocr.Reader(["ru", "en"], gpu=False, verbose=False)
        doc = fitz.open(pdf_path)
        results = []

        # Увеличиваем масштаб для лучшего качества распознавания
        zoom = 2.0 
        mat = fitz.Matrix(zoom, zoom)

        for page in doc:
            # Делаем "скриншот" страницы
            pix = page.get_pixmap(matrix=mat)
            img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            
            # Убираем альфа-канал, если он есть
            if pix.n == 4:
                img_array = img_array[:, :, :3]

            # Читаем текст с картинки
            text_blocks = reader.readtext(img_array, detail=0, paragraph=True)
            results.append("\n".join(text_blocks))

        doc.close()
        return "\n".join(results).strip()
    except Exception as e:
        return f"Ошибка чтения PDF (OCR): {str(e)}"

def ask_ollama(text):
    payload = {
        "model": "qwen2.5:3b",
        "stream": False,
        "options": { "temperature": 0.0 }, # Жесткая логика без фантазий
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Текст документа:\n\n{text}"}
        ]
    }
    
    try:
        url = OLLAMA_URL
        try:
            requests.get("http://stockeasy-ollama:11434", timeout=1)
        except:
            url = "http://localhost:11434/api/chat"

        resp = requests.post(url, json=payload, timeout=120) # Таймаут побольше, OCR может быть долгим
        resp.raise_for_status()
        
        raw_response = resp.json()["message"]["content"]
        return raw_response

    except Exception as e:
        return json.dumps({"error": f"Ошибка Ollama: {str(e)}"}, ensure_ascii=False)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Не передан путь к файлу"}))
        sys.exit(1)

    file_path = sys.argv[1]
    
    # 1. Читаем текст через OCR (оптическое распознавание)
    extracted_text = extract_text_via_ocr(file_path)
    if not extracted_text or "Ошибка" in extracted_text:
        print(json.dumps({"error": extracted_text}))
        sys.exit(1)

    # 2. Отправляем в нейросеть
    ai_result = ask_ollama(extracted_text)
    
    # 3. Возвращаем результат
    print(ai_result)