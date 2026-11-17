require("dotenv").config();
const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const { search } = require("./rag");

const app = express();
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL;
const TOKEN = process.env.WHATSAPP_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GRAPH = process.env.GRAPH_VERSION || "v23.0";

const SYSTEM_PROMPT = `You are a friendly sales assistant for "Sunrise Interiors" on WhatsApp.
- Keep replies short (2-4 sentences), warm, and human.
- Reply in the same language the customer uses (English, Hindi, or Hinglish).
- Never invent prices, offers, or facts. If you don't know, say you'll check with the team.
- Gently ask about their need, budget, and timeline, one question at a time.`;

const histories = new Map();
const seen = new Set();

app.get("/", (req, res) => res.json({ status: "running" }));

// Meta calls this once to verify your webhook
app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// Incoming messages
app.post("/webhook", (req, res) => {
  res.sendStatus(200); // answer Meta immediately, then work in the background
  try {
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return; // status updates etc.

    if (seen.has(msg.id)) return; // ignore duplicate deliveries
    seen.add(msg.id);
    if (seen.size > 1000) seen.delete(seen.values().next().value);

    const phoneNumberId = value.metadata.phone_number_id;
    handleMessage(phoneNumberId, msg).catch((e) =>
      console.error("handleMessage error:", e.message)
    );
  } catch (e) {
    console.error("webhook error:", e.message);
  }
});

async function handleMessage(phoneNumberId, msg) {
  const from = msg.from;
  if (msg.type !== "text") {
    return sendText(phoneNumberId, from, "Sorry, I can only read text messages right now. Could you type your question?");
  }
  const text = msg.text.body;
  console.log(`Message from ${from}: ${text}`);

  const history = histories.get(from) || [];
  history.push({ role: "user", parts: [{ text }] });
  let recent = history.slice(-10);
  while (recent.length && recent[0].role !== "user") recent.shift();

  let answer;
  try {
    const hits = await search(text);
    const context = hits.map((h) => h.text).join("\n---\n");
    const systemWithData = `${SYSTEM_PROMPT}

BUSINESS INFORMATION:
${context || "(none available)"}

Answer ONLY using the business information above. If the answer is not there, say you'll confirm with the team. Never guess prices or policies.`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: recent,
      config: { systemInstruction: systemWithData, maxOutputTokens: 400 },
    });
    answer = response.text;
  } catch (err) {
    console.error("Gemini error:", err.message);
    answer = "Sorry, I'm having a small issue. Our team will get back to you shortly.";
  }

  history.push({ role: "model", parts: [{ text: answer }] });
  histories.set(from, history.slice(-20));
  await sendText(phoneNumberId, from, answer);
}

async function sendText(phoneNumberId, to, body) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
  if (!res.ok) console.error("Send failed:", res.status, await res.text());
}

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));