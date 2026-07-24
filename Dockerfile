FROM node:20-slim

# Устанавливаем Python 3 (для работы cleaner.py)
RUN apt-get update && apt-get install -y python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Устанавливаем зависимости Node.js
COPY package*.json ./
RUN npm install

# Копируем весь остальной код
COPY . .

EXPOSE 3000

# Команда запуска сервера
CMD ["node", "server/index.js"]