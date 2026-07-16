import sys
import json
import re

# Настройка кодировки для Windows/Linux
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stdin.reconfigure(encoding='utf-8')

def clean_data(json_input):
    try:
        data = json.loads(json_input)
        cleaned_rows = []
        
        # Список полей, которые должны стать числами
        numeric_fields = ['amount', 'distanceKm', 'pricePerUnit', 'tmc', 'extras', 'overdueDays', 'inOrder', 'fact']
        
        for row in data:
            new_row = {}
            for key, val in row.items():
                # 1. Очистка строк от битых символов и лишних пробелов
                if isinstance(val, str):
                    val = val.encode('utf-8', 'ignore').decode('utf-8').strip()
                    
                    # 2. Нормализация региона
                    if key == 'region':
                        val = val.capitalize()
                    
                    # 3. Преобразование строк в числа для финансовых полей
                    if key in numeric_fields:
                        # Убираем всё, кроме цифр, точки и минуса
                        num_str = re.sub(r'[^0-9.-]', '', val.replace(',', '.'))
                        try:
                            val = float(num_str) if num_str else 0.0
                        except:
                            val = 0.0
                
                # Если значение None, а поле числовое - ставим 0.0
                elif val is None and key in numeric_fields:
                    val = 0.0
                
                new_row[key] = val
            cleaned_rows.append(new_row)
            
        return json.dumps(cleaned_rows, ensure_ascii=False)
        
    except Exception as e:
        return json.dumps({"error": str(e)})

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        if input_data:
            print(clean_data(input_data))
    except Exception as e:
        print(json.dumps({"error": "Read error: " + str(e)}))