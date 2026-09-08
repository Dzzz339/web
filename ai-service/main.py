import sys
import json
import time
import requests
import pymupdf as fitz
import numpy as np
import easyocr
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import StreamingResponse
import asyncio

app = FastAPI()

# Инициализируем OCR один раз при старте контейнера, чтобы не тратить время при запросах
print("[AI-SERVICE] Предзагрузка EasyOCR...", flush=True)
reader = easyocr.Reader(["ru", "en"], gpu=False, verbose=False)
print("[AI-SERVICE] EasyOCR готов к работе!", flush=True)

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
- "inOrder": Ищи количество портов перед словом "шт." (ВНИМАНИЕ: категорию кабеля вроде "5е" игнорируй, бери только цифру перед "шт."). Верни ТОЛЬКО ЧИСЛО.
- "amount": Ищи текст "составляет сумму в размере". Верни ТОЛЬКО ЧИСЛО, которое идет до скобок (например, 9641). Удали пробелы.
- "contact": Ищи раздел "Контактная информация о Заказчике" (ФИО и телефон).
"""

async def process_pdf_generator(file_bytes):
    def log_line(msg):
        return json.dumps({"type": "log", "message": msg}, ensure_ascii=False) + "\n"

    yield log_line("Открываем документ...")
    await asyncio.sleep(0.05)

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        yield log_line(f"Документ загружен (страниц: {len(doc)}). Запуск OCR...")
        await asyncio.sleep(0.05)

        results = []
        zoom = 2.0 
        mat = fitz.Matrix(zoom, zoom)

        for idx, page in enumerate(doc):
            t_page = time.time()
            yield log_line(f"Рендеринг и распознавание страницы {idx + 1}...")
            await asyncio.sleep(0.05)

            pix = page.get_pixmap(matrix=mat)
            img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            if pix.n == 4:
                img_array = img_array[:, :, :3]

            text_blocks = reader.readtext(img_array, detail=0, paragraph=True)
            page_text = "\n".join(text_blocks)
            results.append(page_text)

            elapsed_page = round(time.time() - t_page, 1)
            yield log_line(f"Страница {idx + 1} распознана за {elapsed_page} сек.")
            await asyncio.sleep(0.05)

        doc.close()
        full_text = "\n".join(results).strip()
        yield log_line(f"OCR завершен! Найдено символов: {len(full_text)}")
        await asyncio.sleep(0.05)

    except Exception as e:
        yield json.dumps({"type": "error", "message": f"Ошибка OCR: {str(e)}"}, ensure_ascii=False) + "\n"
        return

    # Запрос в нейросеть
    yield log_line("Отправляем текст в нейросеть...")
    await asyncio.sleep(0.05)

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
            {"role": "user", "content": f"Текст документа:\n\n{full_text}"}
        ]
    }

    try:
        t_ollama = time.time()
        # В Docker Windows Ollama доступна по host.docker.internal
        resp = requests.post("http://host.docker.internal:11434/api/chat", json=payload, timeout=180)
        elapsed = round(time.time() - t_ollama, 1)
        yield log_line(f"Нейросеть обработала данные за {elapsed} сек.")
        await asyncio.sleep(0.05)
        
        resp.raise_for_status()
        content = resp.json()["message"]["content"]
        yield log_line("Заполняем поля формы...")
        
        parsed_json = json.loads(content)
        yield json.dumps({"type": "result", "data": parsed_json}, ensure_ascii=False) + "\n"

    except requests.exceptions.ReadTimeout:
        yield json.dumps({"type": "error", "message": "Нейросеть думала слишком долго (таймаут 180 сек)."}, ensure_ascii=False) + "\n"
    except Exception as e:
        yield json.dumps({"type": "error", "message": f"Ошибка нейросети: {str(e)}"}, ensure_ascii=False) + "\n"


@app.post("/parse")
async def parse_pdf(file: UploadFile = File(...)):
    file_bytes = await file.read()
    return StreamingResponse(process_pdf_generator(file_bytes), media_type="application/x-ndjson")