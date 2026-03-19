FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force && rm -rf /root/.npm /tmp/*
COPY --from=builder /app/dist ./dist
EXPOSE 3456
USER node
CMD ["node", "dist/cli.js", "serve"]
