// services/AIService.js - With Final Summarization Support

const OpenAI = require("openai");

class MultiAIService {
  constructor() {
    this.providers = {
      groq: {
        name: "Groq (Llama)",
        client: process.env.GROQ_API_KEY
          ? new OpenAI({
              apiKey: process.env.GROQ_API_KEY,
              baseURL: "https://api.groq.com/openai/v1",
            })
          : null,
        enabled: !!process.env.GROQ_API_KEY,
        priority: 1,
        available: true,
      },
    };
    this.lastError = {};
  }

  getAvailableProviders() {
    return Object.entries(this.providers)
      .filter(([_, config]) => config.enabled && config.available)
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([key, _]) => key);
  }

  markProviderUnavailable(provider, duration = 300000) {
    if (!this.providers[provider]) return;
    console.warn(
      `⚠️ Provider ${this.providers[provider].name} marked unavailable`
    );
    this.providers[provider].available = false;
    setTimeout(() => {
      if (this.providers[provider]) {
        this.providers[provider].available = true;
        console.log(`✅ Provider ${this.providers[provider].name} re-enabled`);
      }
    }, duration);
  }

  // ========== NEW METHOD: FINAL COMPREHENSIVE SUMMARIZATION ==========
  async generateFinalSummary(fullTranscript, category) {
    console.log("\n🔍 ============ GENERATE FINAL SUMMARY ============");
    console.log("Transcript length:", fullTranscript.length);
    console.log("Category:", category);

    const providers = this.getAvailableProviders();
    console.log("Available providers:", providers);

    if (providers.length === 0) {
      console.error("❌ No AI providers available");
      throw new Error("No AI providers available for summarization");
    }

    const prompt = `You are a Filipino legal expert and paralegal assistant.  
Your job is to analyze the user's situation and produce a clear, structured consultation summary.

CONVERSATION TRANSCRIPT:
${fullTranscript}

LEGAL CATEGORY: ${category}

Always include the following sections:

1. SITUATION SUMMARY  
   - Rewrite the user's story clearly and neutrally.  
   - Avoid legal conclusions unless obvious from facts.

2. RELEVANT PHILIPPINE LAWS  
   - List only applicable statutes, rules, and government regulations.  
   - Use layman explanations.

3. RECOMMENDED STEPS (VERY IMPORTANT)  
   - List practical steps the user must take next.  
   - Include both legal actions and safety precautions.  
   - Make the steps simple, numbered, and beginner-friendly.

4. WHAT TO WATCH OUT FOR (RED FLAGS)  
   - Add a warning list.  
   - Identify risks, illegal behavior, signs of escalation, or deadlines (ex: prescription periods).

5. IMPORTANT CONTACTS & HOTLINES  
   Include at least the relevant ones below:  
   - **PNP**: 911 (emergency), 8888 (non-emergency reporting)  
   - **Barangay**: Local barangay hall hotline  
   - **PAO (Public Attorney's Office)**: (02) 8426-2075 / nearest district office  
   - **DSWD**: 1343 Actionline  
   - **NBI**: (02) 8523-8231  
   - **PWC or VAWC Desk** for abuse cases  
   - **Cybercrime Hotlines** for online threats: (02) 723-0401 local 7483

6. NEXT ACTION (URGENT)  
   - One clear, prioritized task they must do immediately.

FORMAT THE OUTPUT AS A JSON OBJECT:
{
  "situation": "",
  "relevantLaws": [],
  "recommendedSteps": [],
  "watchOutFor": [],
  "contacts": {},
  "nextAction": ""
}

Your tone must be:  
- Professional  
- Calm  
- Lawyer-like  
- Supportive but factual  
- Never give false certainty

Respond ONLY with valid JSON, no markdown or explanation.`;

    console.log("📤 Prompt prepared, length:", prompt.length);

    for (const provider of providers) {
      try {
        console.log(`🤖 Attempting with ${this.providers[provider].name}...`);

        if (provider === "groq") {
          console.log("🔄 Calling Groq API...");

          const response =
            await this.providers.groq.client.chat.completions.create({
              model: "llama-3.3-70b-versatile", // Updated to newer model
              messages: [{ role: "user", content: prompt }],
              temperature: 0.7,
              max_tokens: 3000,
              response_format: { type: "json_object" },
            });

          console.log("📥 Groq API responded");

          const text = response.choices[0].message.content;
          console.log("📝 Raw response length:", text.length);
          console.log("📝 First 200 chars:", text.substring(0, 200));

          const summary = this._extractJSON(text);
          console.log("✅ JSON parsed successfully");
          console.log("📋 Summary fields:", Object.keys(summary));

          return summary;
        }
      } catch (error) {
        console.error(`❌ ${this.providers[provider].name} failed:`);
        console.error("Error message:", error.message);
        console.error("Error type:", error.constructor.name);
        console.error("Full error:", error);

        this.lastError[provider] = error.message;

        if (this._isBalanceError(error)) {
          console.warn("💰 Balance/quota issue detected");
          this.markProviderUnavailable(provider, 3600000);
        } else {
          console.warn("⏱️ Temporary failure, will retry");
          this.markProviderUnavailable(provider, 60000);
        }
        continue;
      }
    }

    console.error("❌ All providers exhausted");
    throw new Error(
      `Failed to generate summary with all providers. Last errors: ${JSON.stringify(
        this.lastError
      )}`
    );
  }
  // ====================================================================

  // EXISTING METHOD: Quick in-call analysis
  async analyzeLegalSituation(transcript, category) {
    const providers = this.getAvailableProviders();

    if (providers.length === 0) {
      throw new Error("No AI providers available");
    }

    for (const provider of providers) {
      try {
        console.log(`🤖 Trying ${this.providers[provider].name}...`);
        const result = await this._analyzeLegalWithProvider(
          provider,
          transcript,
          category
        );
        console.log(`✅ Success with ${this.providers[provider].name}`);
        return result;
      } catch (error) {
        console.error(
          `❌ ${this.providers[provider].name} failed:`,
          error.message
        );
        this.lastError[provider] = error.message;

        if (this._isBalanceError(error)) {
          this.markProviderUnavailable(provider, 3600000);
        } else {
          this.markProviderUnavailable(provider, 60000);
        }
        continue;
      }
    }

    throw new Error(`All AI providers failed`);
  }

  async generateResponse(userMessage, context) {
    const providers = this.getAvailableProviders();

    if (providers.length === 0) {
      return "Pasensya na, walang available na AI service. Please check your API keys.";
    }

    for (const provider of providers) {
      try {
        console.log(`🤖 Trying ${this.providers[provider].name} for chat...`);
        const result = await this._generateResponseWithProvider(
          provider,
          userMessage,
          context
        );

        if (!result || typeof result !== "string") {
          throw new Error(`Invalid response from ${provider}`);
        }

        return result;
      } catch (error) {
        console.error(
          `❌ ${this.providers[provider].name} failed:`,
          error.message
        );
        this.lastError[provider] = error.message;

        if (this._isBalanceError(error)) {
          this.markProviderUnavailable(provider, 3600000);
        } else {
          this.markProviderUnavailable(provider, 60000);
        }
        continue;
      }
    }

    return "Pasensya na, lahat ng AI providers ay hindi available sa ngayon.";
  }

  _isBalanceError(error) {
    const errorMessage = error.message?.toLowerCase() || "";
    const errorCode = error.status || error.code || "";

    return (
      errorMessage.includes("insufficient") ||
      errorMessage.includes("quota") ||
      errorMessage.includes("balance") ||
      errorCode === 429 ||
      errorCode === 402
    );
  }

  async _analyzeLegalWithProvider(provider, transcript, category) {
    const prompt = `You are a Filipino legal advisor AI. Analyze this ${category} legal situation briefly.

Transcript: ${transcript}

Provide JSON with:
1. situation: Brief summary
2. relevantLaws: Array of Philippine laws
3. recommendedSteps: Array of 3-5 actionable steps
4. contacts: Object with government contacts
5. nextAction: Most urgent step

Respond ONLY with valid JSON.`;

    if (provider === "groq") {
      const response = await this.providers.groq.client.chat.completions.create(
        {
          model: "llama-3.3-70b-versatile", // Updated to newer model
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 2000,
          response_format: { type: "json_object" },
        }
      );
      return this._extractJSON(response.choices[0].message.content);
    }

    throw new Error(`Provider not configured: ${provider}`);
  }

  async _generateResponseWithProvider(provider, userMessage, context) {
    const prompt = `You are a Filipino legal advisor in a VOICE CONVERSATION.

Respond in 2–3 short sentences only (maximum 30 words total).
Use fluent Filipino with natural Taglish when appropriate.
Be conversational and professional like a lawyer on the phone.
Ask a brief follow-up question to clarify the legal situation.

Context: ${context}
User: ${userMessage}

Respond naturally:`;

    if (provider === "groq") {
      const response = await this.providers.groq.client.chat.completions.create(
        {
          model: "llama-3.3-70b-versatile", // Updated to newer model (faster for chat)
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 300,
        }
      );
      return response.choices[0].message.content;
    }

    throw new Error(`Provider not configured: ${provider}`);
  }

  _extractJSON(text) {
    try {
      const parsed = JSON.parse(text);

      // Normalize the nextAction field if it's an object
      if (parsed.nextAction && typeof parsed.nextAction === "object") {
        parsed.nextAction =
          parsed.nextAction.step ||
          `${parsed.nextAction.step} (Timeline: ${parsed.nextAction.timeline})` ||
          "Seek legal counsel immediately";
      }

      return parsed;
    } catch {
      const jsonMatch =
        text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const contentToParse = jsonMatch[1] || jsonMatch[0];
          const cleanText = contentToParse
            .replace(/^```json\s*|```\s*$/g, "")
            .trim();
          const parsed = JSON.parse(cleanText);

          // Normalize the nextAction field
          if (parsed.nextAction && typeof parsed.nextAction === "object") {
            parsed.nextAction =
              parsed.nextAction.step ||
              `${parsed.nextAction.step} (Timeline: ${parsed.nextAction.timeline})` ||
              "Seek legal counsel immediately";
          }

          return parsed;
        } catch (e) {
          console.error("JSON parse error:", e);
        }
      }

      // Enhanced fallback with watchOutFor field
      return {
        situation: "Unable to analyze situation automatically",
        relevantLaws: ["Please consult with a legal professional"],
        recommendedSteps: [
          "Contact PAO (Public Attorney's Office) at (02) 8426-2075",
          "Visit your local barangay hall",
          "Gather all relevant documents",
        ],
        watchOutFor: [
          "Ensure all claims are documented with evidence",
          "Be aware of prescription periods for filing cases",
        ],
        contacts: {
          pao: "PAO: (02) 8426-2075",
          barangay: "Local Barangay Hall",
          pnp: "PNP Emergency: 911",
          dswd: "DSWD Hotline: 1343",
        },
        nextAction: "Seek immediate legal counsel from PAO",
      };
    }
  }

  getProviderStatus() {
    return Object.entries(this.providers).map(([key, config]) => ({
      provider: key,
      name: config.name,
      enabled: config.enabled,
      available: config.available,
      priority: config.priority,
      lastError: this.lastError[key] || null,
    }));
  }
}

module.exports = new MultiAIService();
