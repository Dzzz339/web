import sys
import json
import pandas as pd

# Принудительно настраиваем стандартный ввод и вывод на UTF-8
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stdin.reconfigure(encoding='utf-8')

def clean_data(json_input):
    try:
        data = json.loads(json_input)
        df = pd.DataFrame(data)

        # Функция для очистки строк от "суррогатных" (битых) символов
        def fix_encoding(val):
            if isinstance(val, str):
                # Кодируем в utf-8 с игнорированием ошибок и декодируем обратно
                return val.encode('utf-8', 'ignore').decode('utf-8')
            return val

        # Применяем очистку ко всем ячейкам
        df = df.map(fix_encoding)

        # 1. Удаляем лишние пробелы
        df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)

        # 2. Нормализация регистра для регионов
        if 'region' in df.columns:
            df['region'] = df['region'].astype(str).str.capitalize()
        
        # 3. Чистим поле amount (оставляем только цифры и точку)
        if 'amount' in df.columns:
            df['amount'] = pd.to_numeric(
                df['amount'].astype(str).replace(r'[^0-9.]', '', regex=True), 
                errors='coerce'
            ).fillna(0)

        # force_ascii=True (по умолчанию) превратит кириллицу в \u коды, 
        # это САМЫЙ надежный способ передачи данных обратно в Node.js без ошибок кодировки
        return df.to_json(orient='records', force_ascii=True)
        
    except Exception as e:
        # Если всё совсем плохо, возвращаем ошибку в JSON
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if input_data:
            print(clean_data(input_data))
    except Exception as e:
        print(json.dumps({"error": "Read error: " + str(e)}))