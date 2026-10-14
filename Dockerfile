FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src/ ./src/
COPY bin/ ./bin/
COPY public/ ./public/
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
