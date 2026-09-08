FROM node:20-slim

WORKDIR /app

# Устанавливаем только Node.js зависимости
COPY package*.json ./
RUN npm install

# Копируем остальной код
COPY . .

EXPOSE 3000

CMD ["node", "server/index.js"]