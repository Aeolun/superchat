FROM node:20-alpine AS build

WORKDIR /workspace/binschema-website

# Install dependencies first to leverage Docker layer caching
COPY binschema-website/package.json ./
RUN npm install --no-fund --no-audit

# Copy application source and supporting BinSchema assets
COPY binschema-website/ ./
COPY tools/binschema ../tools/binschema

# Build the static site (includes docs preparation)
RUN npm run build

FROM nginx:1.27-alpine AS runtime

# Provide a simple SPA-friendly nginx configuration
COPY binschema-website/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled assets into the nginx web root
COPY --from=build /workspace/binschema-website/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
