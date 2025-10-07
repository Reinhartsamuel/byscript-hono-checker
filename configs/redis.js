import { createClient } from "redis";

// Create Redis client with connection options
export const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 10000, // 10 seconds
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.log("Too many retries on Redis. Giving up.");
        return new Error("Too many retries");
      }
      return Math.min(retries * 100, 3000); // Exponential backoff up to 3 seconds
    }
  }
});

// Error handling
redisClient.on("error", (err) => {
  console.log("Redis Client Error:", err.message);
});

redisClient.on("connect", () => {
  console.log("Redis Client Connected");
});

redisClient.on("ready", () => {
  console.log("Redis Client Ready");
});

redisClient.on("disconnect", () => {
  console.log("Redis Client Disconnected");
});

// Connection function that handles missing REDIS_URL gracefully
export async function connectRedis () {
  if (!process.env.REDIS_URL) {
    console.log("REDIS_URL not set, skipping Redis connection");
    return false;
  }

  try {
    await redisClient.connect();
    console.log("Successfully connected to Redis");
    return true;
  } catch (error) {
    console.log("Failed to connect to Redis:", error.message);
    return false;
  }
}

// Helper function to safely use Redis operations
export async function safeRedisOperation (operation, fallbackValue = null) {
  if (!redisClient.isOpen) {
    console.log("Redis client not connected, using fallback value");
    return fallbackValue;
  }

  try {
    return await operation();
  } catch (error) {
    console.log("Redis operation failed:", error.message);
    return fallbackValue;
  }
}