import sys
import json
import fitz
import requests
import re

# Принудительная кодировка для Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Внутри Docker сеть устроена так, что контейнеры общаются по их именам.
# Наша Ollama называется 'stockeasy-ollama'
OLLAMA_URL = "http://stockeasy-ollama:11434/api/chat"

# Промпт (Инструкция для нейросети)
SYSTEM_PROMPT = """
Ты — точный и строгий парсер документов. Твоя задача — извлечь данные из 'ЗАКАЗА НА ВЫПОЛНЕНИЕ РАБОТ' и вернуть ИХ СТРОГО В ФОРМАТЕ JSON. 
ЗАПРЕЩЕНО придумывать данные. Если данных нет в тексте, пиши null. ЗАПРЕЩЕНО писать любой текст кроме JSON.

Правила поиска полей:
- "id": Ищи в самом начале после слов "ЗАКАЗ НА ВЫПОЛНЕНИЕ РАБОТ №". Выведи только сам номер.
- "dateZayavki": Ищи дату рядом с номером заказа (после слова "от"). Формат YYYY-MM-DD.
- "address": Ищи строго после слов "Объект: ВСП" или "по адресу". Выведи сам адрес объекта.
- "region": Выведи только название населенного пункта/города из найденного адреса.
- "workType": Ищи в разделе "Состав работ:" или "Монтаж". Кратко опиши, что нужно сделать.
- "inOrder": Ищи количество (шт, портов) в разделе "Состав работ". Верни ТОЛЬКО ЧИСЛО.
- "amount": Ищи в разделе "Общая стоимость Работ по Заказу составляет сумму в размере". Верни ТОЛЬКО ЧИСЛО (без пробелов и копеек).
- "contact": Ищи в разделе "Контактная информация о Заказчике" (ФИО и телефон).
"""

def extract_text(pdf_path):
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text("text") + "\n"
        doc.close()
        return text.strip()
    except Exception as e:
        return f"Ошибка чтения PDF: {str(e)}"

def ask_ollama(text):
    payload = {
        "model": "qwen2.5:3b",
        "stream": False,
        "options": { "temperature": 0.1 }, # Низкая температура для точных ответов
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"Текст документа:\n\n{text}"}
        ]
    }
    
    try:
        # Пробуем достучаться до Docker-контейнера. Если мы запускаем локально на Win, то localhost.
        url = OLLAMA_URL
        try:
            requests.get("http://stockeasy-ollama:11434", timeout=1)
        except:
            url = "http://localhost:11434/api/chat"

        resp = requests.post(url, json=payload, timeout=60)
        resp.raise_for_status()
        
        raw_response = resp.json()["message"]["content"]
        
        # Очищаем ответ от маркдауна (если ИИ обернул JSON в ```json ... ```)
        clean_json = re.sub(r"```(?:json)?\s*", "", raw_response).replace("```", "").strip()
        return clean_json

    except Exception as e:
        return json.dumps({"error": f"Ошибка Ollama: {str(e)}"}, ensure_ascii=False)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Не передан путь к файлу"}))
        sys.exit(1)

    file_path = sys.argv[1]
    
    # 1. Читаем текст
    extracted_text = extract_text(file_path)
    if not extracted_text or "Ошибка" in extracted_text:
        print(json.dumps({"error": "Не удалось извлечь текст из PDF"}))
        sys.exit(1)

    # 2. Отправляем в нейросеть
    ai_result = ask_ollama(extracted_text)
    
    # 3. Возвращаем результат в Node.js
    print(ai_result)