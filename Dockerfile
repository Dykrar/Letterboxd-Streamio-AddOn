FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts ./scripts
ENV PORT=7001
EXPOSE 7001
VOLUME /app/data
CMD ["node", "src/server.js"]
