const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
const { embed, chunkText, STORE } = require("./rag");
const { extractText, getDocumentProxy } = require("unpdf");

(async () => {
  const files = fs.readdirSync("docs").filter((f) => f.endsWith(".pdf") || f.endsWith(".txt"));
  const store = [];

  for (const f of files) {
    const buf = fs.readFileSync(path.join("docs", f));
  let text;
if (f.endsWith(".pdf")) {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdfDoc = await getDocumentProxy(new Uint8Array(buf));
    const result = await extractText(pdfDoc, { mergePages: true });
    text = result.text;
  } catch (error) {
    throw new Error(`Failed to parse ${f}: ${error.message}`, { cause: error });
  }
} else {
  text = buf.toString();
}

    const chunks = chunkText(text);

    for (let i = 0; i < chunks.length; i += 20) {
      const batch = chunks.slice(i, i + 20);
      const vectors = await embed(batch);
      batch.forEach((t, j) => store.push({ source: f, text: t, embedding: vectors[j] }));
    }
    console.log(`${f}: ${chunks.length} chunks`);
  }

  fs.writeFileSync(STORE, JSON.stringify(store));
  console.log("Saved to", STORE);
})().catch((error) => {
  console.error("Ingestion failed:", error);
  process.exitCode = 1;
});