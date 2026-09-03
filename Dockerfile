# Используем чистый Linux с Node.js 20
FROM node:20-slim

# Устанавливаем Python 3, pip и системные библиотеки для OpenCV/EasyOCR
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    git \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Ставим пакеты Node.js
COPY package*.json ./
RUN npm install

# Копируем список библиотек Питона
COPY requirements.txt ./

# СТАВИМ ЛИБЫ ГЛОБАЛЬНО
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# ЧИТ-КОД: Заранее скачиваем языковые модели EasyOCR в образ, чтобы не ждать при первой заявке
RUN python3 -c "import easyocr; easyocr.Reader(['ru', 'en'], gpu=False)"

# Копируем остальной код
COPY . .

EXPOSE 3000

CMD ["node", "server/index.js"]