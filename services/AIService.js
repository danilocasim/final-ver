// services/AIService.js - GROQ ONLY AI Service

const OpenAI = require("openai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

class MultiAIService {
  constructor() {
    // Initialize AI clients - ONLY GROQ is enabled
    this.providers = {
      groq: {
        name: "Groq (Llama)",
        // Groq uses the OpenAI SDK but points to the Groq API endpoint
        client: process.env.GROQ_API_KEY
          ? new OpenAI({
              apiKey: process.env.GROQ_API_KEY,
              baseURL: "https://api.groq.com/openai/v1",
            })
          : null,
        enabled: !!process.env.GROQ_API_KEY,
        priority: 1, // <--- HIGHEST PRIORITY
        available: true,
      },
      gemini: {
        name: "Google Gemini",
        client: null, // Client is explicitly disabled
        enabled: false, // <--- DISABLED
        priority: 2,
        available: true,
      },
      openai: {
        name: "OpenAI (GPT-4)",
        client: null, // Client is explicitly disabled
        enabled: false, // <--- DISABLED
        priority: 3,
        available: true,
      },
    };

    this.lastError = {};
  }

  // (The rest of the MultiAIService class methods remain the same)

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

  async analyzeLegalSituation(transcript, category) {
    const providers = this.getAvailableProviders();

    if (providers.length === 0) {
      throw new Error("No AI providers available. Please check API keys.");
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
          console.warn(
            `💰 ${this.providers[provider].name} has insufficient balance`
          );
          this.markProviderUnavailable(provider, 3600000);
        } else {
          this.markProviderUnavailable(provider, 60000);
        }

        continue;
      }
    }

    throw new Error(
      `All AI providers failed. Last errors: ${JSON.stringify(this.lastError)}`
    );
  }

  async generateResponse(userMessage, context) {
    const providers = this.getAvailableProviders();

    console.log("📋 Available providers:", providers);

    if (providers.length === 0) {
      console.error("❌ NO PROVIDERS AVAILABLE");
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

        console.log(`✅ Success with ${this.providers[provider].name}`);
        console.log(`📝 Response: "${result?.substring(0, 100)}..."`);

        // Validate result
        if (!result || typeof result !== "string") {
          throw new Error(
            `Invalid response from ${provider}: ${typeof result}`
          );
        }

        return result;
      } catch (error) {
        console.error(
          `❌ ${this.providers[provider].name} failed:`,
          error.message
        );
        console.error("Stack trace:", error.stack);

        this.lastError[provider] = error.message;

        if (this._isBalanceError(error)) {
          console.warn(
            `💰 ${this.providers[provider].name} has insufficient balance`
          );
          this.markProviderUnavailable(provider, 3600000);
        } else {
          console.warn(
            `⏱️ Temporarily disabling ${this.providers[provider].name}`
          );
          this.markProviderUnavailable(provider, 60000);
        }

        // Continue to next provider
        continue;
      }
    }

    // All providers failed
    console.error("❌ ALL PROVIDERS FAILED");
    console.error("Last errors:", JSON.stringify(this.lastError, null, 2));

    return "Pasensya na, lahat ng AI providers ay hindi available sa ngayon. Please try again later.";
  }

  _isBalanceError(error) {
    const errorMessage = error.message?.toLowerCase() || "";
    const errorCode = error.status || error.code || "";

    return (
      errorMessage.includes("insufficient") ||
      errorMessage.includes("quota") ||
      errorMessage.includes("balance") ||
      errorMessage.includes("billing") ||
      errorMessage.includes("limit exceeded") ||
      errorCode === 429 ||
      errorCode === 402 ||
      errorCode === "insufficient_quota"
    );
  }

  // --- Only GROQ implementation needs to be defined for the switch ---
  async _analyzeLegalWithProvider(provider, transcript, category) {
    const prompt = `You are a Filipino legal advisor AI. Analyze this ${category} legal situation from the conversation transcript.

Transcript:
${transcript}

Provide a structured response in JSON format with:
1. situation: Brief summary of the legal issue
2. relevantLaws: Array of Philippine laws/articles that apply
3. recommendedSteps: Array of specific actionable steps (3-5 steps)
4. contacts: Object with relevant Philippine government contacts (barangay, DOLE, PAO, etc.)
5. nextAction: Most urgent next step with timeline

Consider Philippine law context: Civil Code, Labor Code, Barangay Justice System (Katarungang Pambarangay), RA 9653 (Rent Control Act), and other relevant laws.

Respond ONLY with valid JSON, no markdown or explanation.`;

    if (provider === "groq") {
      return await this._analyzeWithGroq(prompt);
    }
    // Fallback if somehow a disabled provider is called
    throw new Error(`Provider not configured: ${provider}`);
  }

  async _generateResponseWithProvider(provider, userMessage, context) {
    const prompt = `You are a highly competent Filipino legal advisor speaking in a VOICE CONVERSATION.

IMPORTANT INSTRUCTIONS:

Respond in 2–3 short sentences only (maximum 30 words total).

Use fluent Filipino with natural Taglish when appropriate.

Maintain a calm, professional, lawyer-like tone.

Be conversational, as if speaking on the phone.

Ask a brief follow-up question to clarify the legal situation.

Keep responses concise for voice output.

Context: ${context}
User just said: ${userMessage}

Respond naturally as if you’re a seasoned Filipino lawyer giving initial legal guidance.`;

    if (provider === "groq") {
      return await this._chatWithGroq(prompt);
    }
    // Fallback if somehow a disabled provider is called
    throw new Error(`Provider not configured: ${provider}`);
  }

  // Groq Implementation (using Llama 3)
  async _analyzeWithGroq(prompt) {
    const response = await this.providers.groq.client.chat.completions.create({
      model: "llama-3.1-70b-versatile", // Use a powerful Groq model for analysis
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: "json_object" }, // Request JSON output
    });
    const text = response.choices[0].message.content;
    return this._extractJSON(text);
  }

  async _chatWithGroq(prompt) {
    const response = await this.providers.groq.client.chat.completions.create({
      model: "llama-3.1-8b-instant", // Use a fast Groq model for chat
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 300,
    });
    return response.choices[0].message.content;
  }

  // (The rest of the helper functions: _extractJSON, getProviderStatus)

  _extractJSON(text) {
    try {
      return JSON.parse(text);
    } catch {
      const jsonMatch =
        text.match(/```json\s*([\s\S]*?)\s*```/) ||
        text.match(/```\s*([\s\S]*?)\s*```/) ||
        text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const contentToParse = jsonMatch[1] || jsonMatch[0];
          const cleanText = contentToParse
            .replace(/^```json\s*|```\s*$/g, "")
            .trim();
          return JSON.parse(cleanText);
        } catch (e) {
          console.error("JSON parse error on extracted text:", e);
        }
      }

      return {
        situation: "Unable to analyze situation automatically",
        relevantLaws: ["Please consult with a legal professional"],
        recommendedSteps: [
          "Contact PAO (Public Attorney's Office) at 929-9436",
          "Visit your local barangay hall",
          "Gather all relevant documents",
        ],
        contacts: {
          pao: "PAO Hotline: 929-9436",
          barangay: "Local Barangay Hall",
          dole: "DOLE Hotline: 1349",
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
