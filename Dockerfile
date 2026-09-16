FROM node:20-slim

WORKDIR /app

# Устанавливаем Python 3 для скриптов (OR-Tools CP-SAT, pdfplumber, cleaner)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Устанавливаем зависимости Node.js и Python
COPY package*.json requirements.txt ./
RUN npm install
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt || pip3 install --no-cache-dir -r requirements.txt

# Копируем остальной код
COPY . .

EXPOSE 3000

CMD ["node", "server/index.js"]