FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN node build-client.js
EXPOSE 3333
CMD ["node", "server.js"]
