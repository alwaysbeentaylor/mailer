require('dotenv').config({ path: '.env.local' });

// Use the SAME SDK as send-email.js
const { GoogleGenAI } = require("@google/genai");

async function testConnection() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ NO API KEY FOUND");
        return;
    }
    console.log("🔑 API Key found (starts with):", apiKey.substring(0, 8) + "...");

    const googleAI = new GoogleGenAI({ apiKey });

    try {
        console.log("📡 Sending test request to gemini-2.5-flash (primary model)...");

        const response = await googleAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: "Zeg alleen 'Hallo SKYE!' - niets anders.",
            config: {
                temperature: 0.1,
                maxOutputTokens: 50,
            }
        });

        console.log("✅ STATUS: OK");
        console.log("🤖 RESPONSE:", response.text);
        return true;
    } catch (error) {
        console.error("❌ STATUS: FAILED");
        console.error("Error:", error.message);

        // Try fallback model
        try {
            console.log("\n🔄 Trying fallback model: gemini-1.5-flash...");
            const response = await googleAI.models.generateContent({
                model: "gemini-1.5-flash",
                contents: "Zeg alleen 'Hallo SKYE!' - niets anders.",
                config: {
                    temperature: 0.1,
                    maxOutputTokens: 50,
                }
            });
            console.log("✅ FALLBACK STATUS: OK");
            console.log("🤖 FALLBACK RESPONSE:", response.text);
            return true;
        } catch (fallbackError) {
            console.error("❌ FALLBACK STATUS: FAILED");
            console.error("Fallback Error:", fallbackError.message);
            return false;
        }
    }
}

testConnection();
