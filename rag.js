require("dotenv").config();
const fs = require("fs");
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const EMBED_MODEL = "gemini-embedding-001"; // if it errors, run models.js and pick one with "embedding" in the name
const STORE = "knowledge.json";

async function embed(texts) {
  const res = await ai.models.embedContent({ model: EMBED_MODEL, contents: texts });
  return res.embeddings.map((e) => e.values);
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function chunkText(text, size = 350, overlap = 50) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += size - overlap) {
    chunks.push(words.slice(i, i + size).join(" "));
    if (i + size >= words.length) break;
  }
  return chunks;
}

let store = null;
async function search(query, k = 4) {
  if (!store) {
    if (!fs.existsSync(STORE)) return [];
    store = JSON.parse(fs.readFileSync(STORE, "utf8"));
  }
  const [q] = await embed([query]);
  return store
    .map((c) => ({ text: c.text, source: c.source, score: cosine(q, c.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

module.exports = { embed, chunkText, search, STORE };