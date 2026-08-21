import dotenv from "dotenv";

dotenv.config();

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_MODEL = "openai/gpt-oss-20b";

function loadAiProviderConfig() {
  const apiKey = process.env.AI_PROVIDER_API_KEY;

  if (!apiKey) {
    console.error(
      "Missing required environment variable: AI_PROVIDER_API_KEY. Check your .env file against .env.example."
    );
    process.exit(1);
  }

  return {
    apiKey,
    baseUrl: process.env.AI_PROVIDER_BASE_URL ?? DEFAULT_BASE_URL,
    model: process.env.AI_PROVIDER_MODEL ?? DEFAULT_MODEL,
  };
}

export const aiProvider = loadAiProviderConfig();
