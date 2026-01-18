FROM node:20-alpine

WORKDIR /app/backend

COPY backend/package*.json ./

RUN npm install

COPY backend/ .

COPY frontend/ ../frontend/

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/index.js"]
