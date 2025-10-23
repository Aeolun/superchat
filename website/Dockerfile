# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY website/package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY website/ ./

# Copy docs used during static site generation
COPY docs /docs

# Build the site
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY website/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
