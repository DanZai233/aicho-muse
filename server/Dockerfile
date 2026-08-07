# ===== 阶段 1：构建前端 =====
FROM node:22-alpine AS web-builder
WORKDIR /build
COPY web/package*.json ./
RUN npm install
COPY web/ ./
RUN npm run build

# ===== 阶段 2：构建后端 =====
FROM node:22-alpine
WORKDIR /app

# 系统字体（PDF 中文渲染）
RUN apk add --no-cache fontconfig ttf-dejavu ttf-freefont

COPY server/package*.json ./
RUN npm install --omit=dev

COPY server/ ./
COPY --from=web-builder /build/dist ./public

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/index.js"]
