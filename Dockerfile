# Use the official Node.js 18 image as a parent image
FROM node:18-alpine AS builder

# Set the working directory in the container to /app
WORKDIR /app

# Copy package.json and package-lock.json into the container
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --ignore-scripts

# Copy the rest of the application code into the container
COPY src/ ./src/
COPY tsconfig.json ./

# Build the project
RUN npm run build

# Use a minimal node image as the base image for running
FROM node:18-alpine AS runner

WORKDIR /app

# Copy compiled code from the builder stage
COPY --from=builder /app/build ./build
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --production --ignore-scripts

# Set environment variable for the Exa API key
ENV EXA_API_KEY=your-api-key-here

# Set default port for HTTP transport
ENV PORT=8081

# Expose the port the app runs on (8081 is the default for HTTP transport)
EXPOSE 8081

# Default to HTTP transport for containerized deployment
# Users can override with: docker run -it image-name --transport stdio
ENTRYPOINT ["node", "build/index.js", "--transport", "http"]