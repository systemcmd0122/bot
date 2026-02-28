FROM node:22-slim

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the port (Koyeb default is often 8080)
EXPOSE 8080

# Start the application
CMD ["npm", "start"]
