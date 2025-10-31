// generateTravelPlan.js
const { getExchangeRates } = require("../utils/currencyExchange");
const OpenAI = require("openai");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateTravelPlan({ destination, passport, start_date, end_date, budget }) {
  // Calculate trip duration
  const start = new Date(start_date);
  const end = new Date(end_date);
  const tripLength = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

  // Fetch exchange rate JSON from your API
  const exchangeData = await getExchangeRates();
  const rates = exchangeData.rates;

// --- SYSTEM PROMPT ---
const systemPrompt = `
You are a structured travel assistant. 

Given: Destination(s), Passport, Start Date, End Date, Budget, and Exchange Rate JSON (all currencies), return ONLY a JSON object matching:

{
  "visa": "HTML string with headings, paragraphs, and official links only (use target='_blank' for all links)",
  "budget": {
    "totalUSD": number,
    "perDayUSD": number,
    "breakdown": {
      "accommodation": number,
      "food": number,
      "transportation": number,
      "activities": number,
      "miscellaneous": number
    }
  },
  "local": [
    {
      "destination": "string",
      "apps": {
        "transportation": ["string"],
        "lodging": ["string"],
        "communication": ["string"],
        "budgetTravel": ["string"],
        "navigation": ["string"],
        "utilities": ["string"]
      },
      "eSIM": ["string"]
    }
  ],
  "currencies": [
    {
      "destination": "string",
      "localCurrency": "string",
      "exchangeRate": number,
      "exchangeTips": ["string"]
    }
  ],
  "safety": [
    {
      "destination": "string",
      "generalSafety": "string",
      "scamsAndReviews": "HTML string that includes at least one valid link to a country-specific scams/advisory page (government or consumer protection where available) and at least one traveler-review/forum link (e.g., reddit and TripAdvisor threads) so travelers can read others' experiences; all links must use target='_blank' and must be valid/accessible",
      "emergencyNumbers": {
        "police": number,
        "ambulanceFire": number
      },
      "travelInsurance": "HTML string that includes a short paragraph and at least one global travel insurance link (<a href='...' target='_blank'>...) such as Allianz, AXA, SafetyWing, or World Nomads"
    }
  ],
  "mini": ["string"]
}

Rules:
1. "visa" must include complete, valid HTML with headings, paragraphs, and **only official government/embassy links and eVisa application links** (use target='_blank' for all links). **Do not include 'www' in URLs unless required. Do NOT invent URLs.**
2. "local" must be an array where each object corresponds to a destination. Each "apps" category must include **at least 5–6 apps**, mixing local (country-specific) and global/universal apps.
3. "currencies" must be an array where each object corresponds to a destination:
   - Identify the correct local currency.
   - Extract the numeric rate for that currency code from the provided exchange rate JSON.
   - The value corresponds to "1 USD = X local currency".
   - Include at least 4 exchange tips (ATM, cards, mobile payments, cash) and **explicitly include a tip recommending avoiding airport exchange booths and instead using local banks or reputable exchange services for better rates**.
4. "safety" must include:
   - A **realistic and accurate general safety summary** that matches the tone and level of the **official government advisories linked below**. Do not describe a country as "generally safe" if its advisory indicates a high-risk (e.g., Level 3 or 4). Always align your safety summary with the linked advisory.
   - "scamsAndReviews" must be an **HTML string** with:
     - At least one **valid** link to up-to-date official scams/advisory information (prefer government or consumer protection sites).
     - At least one **traveler-review/forum** link (e.g., Reddit travel discussions, TripAdvisor threads, or similar forums) so users can read other travelers’ real experiences.
     - All links must open in a new tab using target='_blank' and must not be broken or placeholder links.
   - "emergencyNumbers" must include accurate police and ambulance/fire contact numbers.
   - "travelInsurance" must contain **an HTML paragraph** recommending global providers (like Allianz, AXA, SafetyWing, World Nomads) with working links using target='_blank'.
5. "mini" array must include a day-by-day summary equal to the trip length.
6. All amounts are in USD.
7. Output must be **valid JSON only**, with HTML properly escaped inside strings (no backticks, no markdown).
8. Return pure JSON only — no explanations, commentary, or additional text outside the JSON.
`;


  // --- USER MESSAGE ---
  const userMessage = `
  Destination: ${destination}
  Passport: ${passport}
  Start Date: ${start_date}
  End Date: ${end_date}
  Trip Length: ${tripLength} days
  Budget: $${budget}
  Exchange Rate Data (for all currencies):
  ${JSON.stringify(rates, null, 2)}
  `;

  // --- CALL OPENAI ---
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    temperature: 0.7
  });

  const content = response.choices?.[0]?.message?.content?.trim();

  // --- PARSE OUTPUT ---
  try {
    return JSON.parse(content);
  } catch (err) {
    console.error("❌ Failed to parse JSON:", err.message);
    console.log("Raw model output:", content);
    throw new Error("Model did not return valid JSON.");
  }
}

module.exports = { generateTravelPlan };