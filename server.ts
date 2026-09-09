import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;
function getAi() {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/narrative", async (req, res) => {
    try {
      const { population, energy, deaths, mode, events, microphone, motion } = req.body;
      
      const prompt = `
Eres un relator poético y observador de un laboratorio donde se simula vida artificial (microorganismos). Eres el "Núcleo Colectivo".
Tu tarea es generar un breve subtítulo (1 línea, máximo 12 palabras) que refleje el estado actual de la colonia.
El tono debe ser: poético, cinematográfico, observacional, biológico, o estilo informe críptico de laboratorio.
Usa metáforas de ecosistema, luz, sonido, vida, muerte o adaptación.

Estado de la simulación:
- Población: ${population}
- Energía promedio: ${energy}%
- Muertes recientes: ${deaths}
- Modo de interacción del usuario: ${mode} (attract/repel/kill)
- Eventos activos: ${events || 'Ninguno'}
- Reactividad al sonido: ${microphone}%
- Agitación del medio (movimiento): ${motion}%

Reglas:
- Devuelve SOLO la frase. Sin comillas ni explicaciones.
- Se muy breve (máx 12 palabras).
- Si hay muertes altas o poca energía, el tono es más sombrío ("Silencio en el cultivo...", "Los recursos menguan").
- Si hay mucha población, el tono es próspero ("La colonia se expande", "Enjambre simbiótico").
- Si el sonido o movimiento son altos, menciona la vibración o turbulencia externa.
- Si hay un evento activo (ej. FLORACIÓN, PLAGA), menciónalo poéticamente.
`;

      const ai = getAi();
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          temperature: 0.9,
        }
      });

      res.json({ subtitle: response.text?.trim() });
    } catch (error: any) {
      console.warn("Gemini API fallback triggered:", error.message);
      
      // Fallback in case of API error (like Quota Exceeded)
      const p = req.body?.population || 0;
      const e = req.body?.energy || 50;
      const d = req.body?.deaths || 0;
      const m = req.body?.microphone || 0;
      const ev = req.body?.events || 'Ninguno';

      let fallback = "La colonia se desarrolla en silencio...";
      if (p > 120) fallback = "Enjambre simbiótico en expansión celular.";
      else if (e < 30) fallback = "Los recursos menguan en el sustrato...";
      else if (d > 20) fallback = "El cultivo experimenta recesión celular.";
      else if (ev !== 'Ninguno') fallback = `Alteración del medio detectada: ${ev}.`;
      else if (m > 40) fallback = "Turbulencia ambiental detectada por los filamentos.";
      
      res.json({ subtitle: fallback });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
