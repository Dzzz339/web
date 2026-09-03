# Используем чистый Linux с Node.js 20
FROM node:20-slim

# Устанавливаем Python 3 и глобальный pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Ставим пакеты Node.js
COPY package*.json ./
RUN npm install

# Копируем список библиотек Питона
COPY requirements.txt ./

# СТАВИМ ЛИБЫ ГЛОБАЛЬНО
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages

# Копируем остальной код
COPY . .

EXPOSE 3000

CMD ["node", "server/index.js"]