require("dotenv").config();
const express = require("express");
const { twiml } = require("twilio");
const { GoogleGenAI } = require("@google/genai");
const { search } = require("./rag");

const app = express();
app.use(express.urlencoded({ extended: false }));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = "gemini-3.5-flash-lite"; // copy the current Flash model name from AI Studio

const SYSTEM_PROMPT = `You are a friendly sales assistant for "Demo Business" on WhatsApp.
- Keep replies short (2-4 sentences), warm, and human.
- Reply in the same language the customer uses (English, Hindi, or Hinglish).
- Never invent prices, offers, or facts. If you don't know, say you'll check with the team.
- Gently ask about their need, budget, and timeline, one question at a time.`;

// Chat history per phone number (in memory; resets on restart)
const histories = new Map();

app.get("/", (req, res) => res.json({ status: "running" }));

app.post("/whatsapp", async (req, res) => {
  const { Body, From } = req.body;
  console.log(`Message from ${From}: ${Body}`);

  const history = histories.get(From) || [];
  history.push({ role: "user", parts: [{ text: Body }] });

  let recent = history.slice(-10);
  while (recent.length && recent[0].role !== "user") recent.shift();

  let answer;
  try {
    const hits = await search(Body);
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
  histories.set(From, history.slice(-20));

  const reply = new twiml.MessagingResponse();
  reply.message(answer);
  res.type("text/xml").send(reply.toString());
});

app.listen(8000, () => console.log("Server running on port 8000"));