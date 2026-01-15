# Используем Node 18
FROM node:18-alpine

# Рабочая директория внутри контейнера
WORKDIR /app

# 1. Копируем package.json бэкенда и ставим зависимости
# Мы создаем структуру папок как в репозитории /app/backend
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci

# 2. Копируем исходный код бэкенда
COPY backend/ ./

# 3. Копируем фронтенд (чтобы бэкенд мог его раздавать)
# Структура будет: /app/frontend
COPY frontend/ ../frontend/

# Возвращаемся в папку бэкенда для запуска
WORKDIR /app/backend

# Открываем порт
EXPOSE 3000

# Команда запуска (по умолчанию dev, но в проде лучше build)
CMD ["npm", "run", "dev"]
