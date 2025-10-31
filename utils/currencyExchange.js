// utils/currencyExchange.js
const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.resolve(__dirname, "../exchangeRates.json");
const CACHE_DURATION_HOURS = 12;

/**
 * Check if the cached exchange rate file is still valid
 */
function isCacheValid(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stats = fs.statSync(filePath);
  const ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);
  return ageHours < CACHE_DURATION_HOURS;
}

/**
 * Fetch live exchange rates (cached for 12 hours)
 */
async function getExchangeRates(base = "USD") {
  if (isCacheValid(CACHE_FILE)) {
    console.log("📦 Using cached exchange rates");
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  }

  console.log("🔄 Fetching live exchange rates...");
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  if (!res.ok) throw new Error(`Failed to fetch exchange rates (${res.status})`);
  const data = await res.json();

  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  console.log("✅ Cached latest exchange rates");
  return data;
}

/**
 * Fetch live exchange rates once a day (no caching)
 */
async function getExchangeRatesOnceADay(base = "USD") {
  console.log("🔄 Fetching live exchange rates once a day...");
  const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
  if (!res.ok) throw new Error(`Failed to fetch exchange rates (${res.status})`);
  const data = await res.json();
  return data.rates || {};
}

module.exports = { getExchangeRates, getExchangeRatesOnceADay };