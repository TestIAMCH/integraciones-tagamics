# Stage 1: Build the application
FROM node:18-alpine as build-stage

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Serve the application with Nginx
FROM nginx:stable-alpine as production-stage

# Copy nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from build-stage to Nginx default public directory
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Expose port (default Nginx is 80)
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
