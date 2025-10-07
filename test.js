import { checkRedisAndCheck3Commas } from "./index.js";

// Simple test to verify the function structure
async function testCheckRedisAndCheck3Commas () {
  console.log("Testing checkRedisAndCheck3Commas function...");

  try {
    const result = await checkRedisAndCheck3Commas();
    console.log("Function executed successfully");
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Function failed:", error);
  }
}

// Run the test if this file is executed directly
if (import.meta.main) {
  testCheckRedisAndCheck3Commas();
}

export { testCheckRedisAndCheck3Commas };