import sys
import json
import time
import requests
import pymupdf as fitz
import numpy as np
import easyocr

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Функция для отправки живых логов в браузер
def send_log(msg):
    print(f"LOG: {msg}", flush=True)

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
        send_log("Открываем документ...")
        doc = fitz.open(pdf_path)
        send_log(f"Документ загружен (страниц: {len(doc)}). Запуск OCR...")

        t_ocr_init = time.time()
        reader = easyocr.Reader(["ru", "en"], gpu=False, verbose=False)
        
        results = []
        zoom = 2.0 
        mat = fitz.Matrix(zoom, zoom)

        for idx, page in enumerate(doc):
            t_page = time.time()
            send_log(f"Рендеринг и распознавание страницы {idx + 1}...")
            
            pix = page.get_pixmap(matrix=mat)
            img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            if pix.n == 4:
                img_array = img_array[:, :, :3]

            text_blocks = reader.readtext(img_array, detail=0, paragraph=True)
            page_text = "\n".join(text_blocks)
            results.append(page_text)
            
            elapsed_page = round(time.time() - t_page, 1)
            send_log(f"Страница {idx + 1} распознана за {elapsed_page} сек.")

        doc.close()
        full_text = "\n".join(results).strip()
        send_log(f"OCR завершен! Найдено символов: {len(full_text)}")
        return full_text
    except Exception as e:
        err = f"Ошибка OCR: {str(e)}"
        send_log(err)
        return err

def ask_ollama(text):
    send_log("Отправляем текст в нейросеть...")
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
        t_ollama = time.time()
        
        resp = requests.post(url, json=payload, timeout=180)
        elapsed = round(time.time() - t_ollama, 1)
        send_log(f"Нейросеть обработала данные за {elapsed} сек.")
        resp.raise_for_status()
        
        content = resp.json()["message"]["content"]
        send_log("Заполняем поля формы...")
        return content

    except requests.exceptions.ReadTimeout:
        err = "Нейросеть думала слишком долго (таймаут 180 сек)."
        send_log(f"Ошибка: {err}")
        return json.dumps({"error": err}, ensure_ascii=False)
    except Exception as e:
        err = f"Сбой нейросети: {str(e)}"
        send_log(f"Ошибка: {err}")
        return json.dumps({"error": err}, ensure_ascii=False)
    
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"RESULT: {json.dumps({'error': 'Не передан путь к файлу'})}", flush=True)
        sys.exit(1)

    file_path = sys.argv[1]
    
    extracted_text = extract_text_via_ocr(file_path)
    if not extracted_text or "Ошибка" in extracted_text:
        print(f"RESULT: {json.dumps({'error': extracted_text})}", flush=True)
        sys.exit(1)

    ai_result = ask_ollama(extracted_text)
    
    # Отправляем финальный результат с префиксом RESULT:
    print(f"RESULT: {ai_result}", flush=True)