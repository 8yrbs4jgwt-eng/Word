FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV HOST=0.0.0.0 DATA_DIR=/app/data
EXPOSE 10000
CMD ["npm", "start"]
