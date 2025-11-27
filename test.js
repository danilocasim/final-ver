// test-api-keys.js - Test your API keys individually
require("dotenv").config();

const Anthropic = require("@anthropic-ai/sdk");
const OpenAI = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

console.log("\n🔍 Testing API Keys...\n");

// Test Anthropic
async function testAnthropic() {
  try {
    console.log("1️⃣ Testing ANTHROPIC...");
    console.log("   Key exists:", !!process.env.ANTHROPIC_API_KEY);
    console.log(
      "   Key starts with:",
      process.env.ANTHROPIC_API_KEY?.substring(0, 15) + "..."
    );

    if (!process.env.ANTHROPIC_API_KEY) {
      console.log("   ❌ No API key found in .env\n");
      return;
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 50,
      messages: [{ role: "user", content: "Say 'Hello, I work!'" }],
    });

    console.log("   ✅ SUCCESS! Response:", response.content[0].text);
    console.log("");
  } catch (error) {
    console.log("   ❌ FAILED:", error.message);
    console.log("   Error details:", error.error || error);
    console.log("");
  }
}

// Test OpenAI
async function testOpenAI() {
  try {
    console.log("2️⃣ Testing OPENAI...");
    console.log("   Key exists:", !!process.env.OPENAI_API_KEY);
    console.log(
      "   Key starts with:",
      process.env.OPENAI_API_KEY?.substring(0, 15) + "..."
    );

    if (!process.env.OPENAI_API_KEY) {
      console.log("   ❌ No API key found in .env\n");
      return;
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Say 'Hello, I work!'" }],
      max_tokens: 50,
    });

    console.log(
      "   ✅ SUCCESS! Response:",
      response.choices[0].message.content
    );
    console.log("");
  } catch (error) {
    console.log("   ❌ FAILED:", error.message);
    console.log("");
  }
}

// Test Gemini
async function testGemini() {
  try {
    console.log("3️⃣ Testing GEMINI...");
    console.log("   Key exists:", !!process.env.GEMINI_API_KEY);
    console.log(
      "   Key starts with:",
      process.env.GEMINI_API_KEY?.substring(0, 15) + "..."
    );

    if (!process.env.GEMINI_API_KEY) {
      console.log("   ❌ No API key found in .env\n");
      return;
    }

    const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = client.getGenerativeModel({ model: "gemini-1.5-flash" });

    const result = await model.generateContent("Say 'Hello, I work!'");
    const response = result.response.text();

    console.log("   ✅ SUCCESS! Response:", response);
    console.log("");
  } catch (error) {
    console.log("   ❌ FAILED:", error.message);
    console.log("");
  }
}

// Test Groq
async function testGroq() {
  try {
    console.log("4️⃣ Testing GROQ...");
    console.log("   Key exists:", !!process.env.GROQ_API_KEY);
    console.log(
      "   Key starts with:",
      process.env.GROQ_API_KEY?.substring(0, 15) + "..."
    );

    if (!process.env.GROQ_API_KEY) {
      console.log("   ❌ No API key found in .env\n");
      return;
    }

    const client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "Say 'Hello, I work!'" }],
      max_tokens: 50,
    });

    console.log(
      "   ✅ SUCCESS! Response:",
      response.choices[0].message.content
    );
    console.log("");
  } catch (error) {
    console.log("   ❌ FAILED:", error.message);
    console.log("");
  }
}

// Run all tests
async function runTests() {
  await testAnthropic();
  await testOpenAI();
  await testGemini();
  await testGroq();

  console.log("✅ Testing complete!\n");
}

runTests();
