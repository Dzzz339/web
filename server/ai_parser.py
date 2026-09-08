import sys
import json
import time
import requests
import pymupdf as fitz  # Исправленный импорт без варнингов
import numpy as np
import easyocr

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Функция для вывода логов прямо в консоль Docker (мимо stdout)
def log(msg):
    print(f"[AI-PY] {msg}", file=sys.stderr, flush=True)

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
        t0 = time.time()
        log(f"Открываем PDF: {pdf_path}")
        doc = fitz.open(pdf_path)
        log(f"PDF открыт успешно. Всего страниц: {len(doc)}")

        log("Инициализация EasyOCR (CPU)...")
        t_ocr_init = time.time()
        reader = easyocr.Reader(["ru", "en"], gpu=False, verbose=False)
        log(f"EasyOCR инициализирован за {round(time.time() - t_ocr_init, 2)} сек")

        results = []
        zoom = 2.0 
        mat = fitz.Matrix(zoom, zoom)

        for idx, page in enumerate(doc):
            t_page = time.time()
            log(f"--- Обработка страницы {idx + 1} из {len(doc)} ---")
            
            pix = page.get_pixmap(matrix=mat)
            img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            if pix.n == 4:
                img_array = img_array[:, :, :3]

            log(f"Рендеринг в картинку готов ({pix.width}x{pix.height}). Запуск распознавания...")
            text_blocks = reader.readtext(img_array, detail=0, paragraph=True)
            page_text = "\n".join(text_blocks)
            results.append(page_text)
            
            log(f"Страница {idx + 1} распознана за {round(time.time() - t_page, 2)} сек! Найдено символов: {len(page_text)}")

        doc.close()
        full_text = "\n".join(results).strip()
        log(f"ВСЕГО OCR занял: {round(time.time() - t0, 2)} сек")

        log("========== ТЕКСТ ПОСЛЕ OCR (ЧТО УВИДИТ НЕЙРОСЕТЬ) ==========")
        log(full_text if full_text else "[ПУСТО: OCR ничего не распознал!]")
        log("=============================================================")

        return full_text
    except Exception as e:
        err = f"Ошибка в extract_text_via_ocr: {str(e)}"
        log(err)
        return err

def ask_ollama(text):
    log("Формируем запрос в Ollama (модель qwen2.5:7b)...")
    payload = {
        "model": "qwen2.5:7b",
        "stream": False,
        "format": "json",
        "options": {
            "temperature": 0.0,
            "num_predict": 300,
            "num_ctx": 2048
        },
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Текст документа:\n\n{text}"}
        ]
    }
    
    try:
        url = "http://host.docker.internal:11434/api/chat"
        log(f"Отправляем HTTP POST на {url} (таймаут 180 сек)...")
        t_ollama = time.time()
        
        resp = requests.post(url, json=payload, timeout=180)
        elapsed = round(time.time() - t_ollama, 2)
        log(f"Ответ от Ollama получен за {elapsed} сек! Код статуса: {resp.status_code}")
        resp.raise_for_status()
        
        content = resp.json()["message"]["content"]
        log(f"Сырой ответ от Ollama:\n{content}")
        return content

    except requests.exceptions.ReadTimeout:
        err = "Нейросеть думала слишком долго (таймаут 180 сек)."
        log(f"ОШИБКА: {err}")
        return json.dumps({"error": err}, ensure_ascii=False)
    except requests.exceptions.ConnectionError:
        err = "Докер не может достучаться до Ollama на хосте (http://host.docker.internal:11434)."
        log(f"ОШИБКА: {err}")
        return json.dumps({"error": err}, ensure_ascii=False)
    except Exception as e:
        err = f"Ошибка Ollama: {str(e)}"
        log(f"ОШИБКА: {err}")
        return json.dumps({"error": err}, ensure_ascii=False)
    
if __name__ == "__main__":
    t_start = time.time()
    log("=== Старт ai_parser.py ===")
    
    if len(sys.argv) < 2:
        log("ОШИБКА: Не передан путь к файлу в аргументах")
        print(json.dumps({"error": "Не передан путь к файлу"}))
        sys.exit(1)

    file_path = sys.argv[1]
    
    extracted_text = extract_text_via_ocr(file_path)
    if not extracted_text or "Ошибка" in extracted_text:
        log("Завершение из-за ошибки OCR")
        print(json.dumps({"error": extracted_text}))
        sys.exit(1)

    ai_result = ask_ollama(extracted_text)
    
    log(f"=== Завершение ai_parser.py. Общее время: {round(time.time() - t_start, 2)} сек ===")
    
    # Только финальный чистый JSON отправляется в stdout для Node.js
    print(ai_result, flush=True)