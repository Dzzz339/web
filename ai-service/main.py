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

print("[AI-SERVICE] Предзагрузка EasyOCR...", flush=True)
reader = easyocr.Reader(["ru", "en"], gpu=False, verbose=False)
print("[AI-SERVICE] EasyOCR готов к работе!", flush=True)

# ИНСТРУМЕНТ 1: Умный системный промпт с автокоррекцией опечаток OCR
SYSTEM_PROMPT = """
Ты — строгий аналитический парсер договоров Сбербанка. Извлеки данные и верни ТОЛЬКО ВАЛИДНЫЙ JSON.
Никаких вводных слов, пояснений и markdown! Только JSON-объект.
Обязательно исправляй оптические опечатки OCR в русских именах и словах (например, 'Надсжда' -> 'Надежда').

Правила полей:
- "id": Номер после "ЗАКАЗ НА ВЫПОЛНЕНИЕ РАБОТ №" (например, "СИБ-8288-18").
- "dateZayavki": Дата заказа в самом верху (формат YYYY-MM-DD).
- "vsp": Номер ВСП после слов "Объект: ВСП №" (например, "8558/7"). Только номер, без слова "ВСП".
- "address": Адрес после "по адресу". Отрезай этажи, комнаты и клиентские залы.
- "region": Только населенный пункт (например, "Кызыл-Озек").
- "workType": Полный текст строки после "Состав работ:" (например, "Монтаж нового порта СКС кат. 5e: 1 шт.").
- "inOrder": Количество портов перед "шт.". Игнорируй категорию кабеля (верни ТОЛЬКО ЧИСЛО, например, 1).
- "amount": Итоговая стоимость С УЧЕТОМ НДС (ищи фразу "а всего с учетом НДС", возьми число до скобок, например 19453). Удали пробелы. Только число.
- "manager": Текст после "Заказчик:" (ФИО и телефон из раздела "Контактная информация о Заказчике").
- "contact": Текст после "Сопровождающий на объекте:".
- "comment": Весь блок текста строго от слова "Комментарий:" до фразы "Подписи сторон" (саму фразу "Подписи сторон" не включай).
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
        # ИНСТРУМЕНТ 3: Zoom 2.5x в Grayscale дает максимальную резкость контуров мелких букв
        zoom = 2.5 
        mat = fitz.Matrix(zoom, zoom)

        for idx, page in enumerate(doc):
            t_page = time.time()
            yield log_line(f"Обработка и распознавание страницы {idx + 1}...")
            await asyncio.sleep(0.05)

            # Рендерим в чистый ч/б Grayscale (убирает цветовой шум вокруг букв)
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csGRAY)
            img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)

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
            "num_predict": 350,
            "num_ctx": 2048
        },
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Текст документа:\n\n{full_text}"}
        ]
    }

    try:
        t_ollama = time.time()
        resp = requests.post("http://host.docker.internal:11434/api/chat", json=payload, timeout=180)
        elapsed = round(time.time() - t_ollama, 1)
        yield log_line(f"Нейросеть обработала данные за {elapsed} сек.")
        await asyncio.sleep(0.05)
        
        resp.raise_for_status()
        content = resp.json()["message"]["content"]
        yield log_line("Стандартизируем адрес и заполняем форму...")
        
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