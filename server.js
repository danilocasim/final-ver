// server.js - Robust Version
require("dotenv").config();

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise);
  console.error("❌ Reason:", reason);
  console.error("⚠️ Server will continue running...");
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  console.error("⚠️ Server will continue running...");
});

const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");
const multiAIService = require("./services/AIService");

// --- CRITICAL FIX: Correct Import for Agora ---
const AgoraAccessToken = require("agora-access-token");
const { RtcTokenBuilder, RtcRole } = AgoraAccessToken;

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.json());
app.use(express.static("public"));

// --- FILE SYSTEM SETUP ---
const DATA_DIR = path.join(__dirname, "data");
const REPORTS_DIR = path.join(__dirname, "reports");
const DB_FILES = {
  sessions: path.join(DATA_DIR, "sessions.json"),
  transcripts: path.join(DATA_DIR, "transcripts.json"),
  summaries: path.join(DATA_DIR, "summaries.json"),
  reports: path.join(DATA_DIR, "reports.json"),
};

async function initializeDatabase() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(REPORTS_DIR, { recursive: true });
    for (const filePath of Object.values(DB_FILES)) {
      try {
        await fs.access(filePath);
      } catch {
        await fs.writeFile(filePath, JSON.stringify([], null, 2));
      }
    }
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

// --- HELPER SERVICES ---
class JSONService {
  static async read(file) {
    try {
      const data = await fs.readFile(DB_FILES[file], "utf8");
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }
  static async append(file, item) {
    const data = await this.read(file);
    data.push(item);
    await fs.writeFile(DB_FILES[file], JSON.stringify(data, null, 2));
    return item;
  }
  static async findOne(file, predicate) {
    const data = await this.read(file);
    return data.find(predicate);
  }
  static async update(file, predicate, updates) {
    const data = await this.read(file);
    const index = data.findIndex(predicate);
    if (index !== -1) {
      data[index] = { ...data[index], ...updates };
      await fs.writeFile(DB_FILES[file], JSON.stringify(data, null, 2));
      return data[index];
    }
    return null;
  }
}

class AgoraService {
  static generateToken(channelName, uid) {
    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
      console.warn("⚠️ AGORA KEYS MISSING: Using mock token.");
      return { rtcToken: "mock_token", appId: "mock_app_id" };
    }

    const role = RtcRole.PUBLISHER;
    const expiration = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expiration;

    // Build the token
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid || 0,
      role,
      privilegeExpiredTs
    );

    return { rtcToken: token, appId, channelName, uid: uid || 0 };
  }
}

// --- ROUTES ---

// 1. Pages
app.get("/", (req, res) => res.render("index"));

app.get("/call/:sessionId", async (req, res) => {
  const session = await JSONService.findOne(
    "sessions",
    (s) => s.sessionId === req.params.sessionId
  );
  if (!session) return res.redirect("/");
  res.render("call", { session });
});

app.get("/summary/:sessionId", async (req, res) => {
  const session = await JSONService.findOne(
    "sessions",
    (s) => s.sessionId === req.params.sessionId
  );
  const summary = await JSONService.findOne(
    "summaries",
    (s) => s.sessionId === req.params.sessionId
  );
  const transcripts = (await JSONService.read("transcripts")).filter(
    (t) => t.sessionId === req.params.sessionId
  );
  res.render("summary", { session, summary, transcripts });
});

// 2. Session Management
app.post("/api/session/start", async (req, res) => {
  try {
    const session = {
      sessionId: uuidv4(),
      category: req.body.category || "GENERAL",
      status: "ACTIVE",
      startTime: Date.now(),
    };
    await JSONService.append("sessions", session);
    res.json(session);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to start session" });
  }
});

app.post("/api/session/end", async (req, res) => {
  await JSONService.update(
    "sessions",
    (s) => s.sessionId === req.body.sessionId,
    { status: "COMPLETED", endTime: Date.now() }
  );
  res.json({ success: true });
});

// 3. Transcript & AI
app.post("/api/transcript/save", async (req, res) => {
  const { sessionId, speaker, text } = req.body;
  await JSONService.append("transcripts", {
    sessionId,
    speaker,
    text,
    timestamp: Date.now(),
  });
  res.json({ success: true });
});

// --- CRITICAL ROUTE: AI CHAT ---
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { message, context } = req.body;

    console.log("\n💬 ============ AI CHAT REQUEST ============");
    console.log("Message:", message);
    console.log("Context:", context?.substring(0, 100) + "...");

    // Validate input
    if (!message || typeof message !== "string") {
      console.error("❌ Invalid message received");
      return res.json({
        response:
          "Sorry, I didn't receive your message properly. Please try again.",
      });
    }

    // Call AI Service with timeout protection
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AI request timeout after 30s")), 30000)
    );

    const aiPromise = multiAIService.generateResponse(message, context || "");

    const response = await Promise.race([aiPromise, timeoutPromise]);

    console.log("✅ AI Response:", response);
    console.log("============================================\n");

    res.json({ response });
  } catch (error) {
    console.error("\n❌ ============ AI CHAT ERROR ============");
    console.error("Error Type:", error.constructor.name);
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);
    console.error("==========================================\n");

    // IMPORTANT: Don't crash, send a response
    res.json({
      response: "Pasensya na, may problema sa AI. Maaari mo bang ulitin?",
    });
  }
});

app.post("/api/ai/process", async (req, res) => {
  try {
    const { sessionId, fullTranscript, category } = req.body;
    const analysis = await multiAIService.analyzeLegalSituation(
      fullTranscript,
      category
    );
    const summary = { sessionId, ...analysis, createdAt: Date.now() };
    await JSONService.append("summaries", summary);
    res.json(summary);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Processing failed" });
  }
});
// Add this test endpoint to your server.js to verify Groq works:

app.get("/api/test-groq", async (req, res) => {
  try {
    console.log("\n🧪 TESTING GROQ CONNECTION...");
    console.log(
      "API Key:",
      process.env.GROQ_API_KEY
        ? "✅ SET (length: " + process.env.GROQ_API_KEY.length + ")"
        : "❌ MISSING"
    );

    const OpenAI = require("openai");
    const groqClient = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });

    console.log("🤖 Sending test message to Groq...");

    const response = await groqClient.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: "Say 'Hello' in Tagalog" }],
      temperature: 0.7,
      max_tokens: 50,
    });

    const result = response.choices[0].message.content;
    console.log("✅ Groq Response:", result);

    res.json({
      success: true,
      response: result,
      provider: "Groq (Llama)",
    });
  } catch (error) {
    console.error("❌ GROQ TEST FAILED:", error.message);
    console.error("Error details:", error);

    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack,
    });
  }
});

// Then visit: http://localhost:8200/api/test-groq

// 4. Agora Token
app.post("/api/agora/token", (req, res) => {
  try {
    const token = AgoraService.generateToken(
      req.body.channelName || "default",
      0
    );
    res.json(token);
  } catch (e) {
    console.error("Agora Token Error:", e);
    res.status(500).json({ error: "Token generation failed" });
  }
});

// Start Server
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 AI Legal Buddy running on http://localhost:${PORT}`);
    console.log(`📝 Logs will appear below:\n`);
  });
});
