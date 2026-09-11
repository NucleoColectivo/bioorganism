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

const fallbackPhrases = [
  "Tu presencia despierta algo que permanecía invisible dentro de este organismo.",
  "El organismo percibe tu movimiento y comienza a transformar su propia forma.",
  "Algo se mueve contigo; cada gesto altera el equilibrio de este paisaje vivo.",
  "Tu presencia entra en el sistema y una nueva posibilidad comienza a aparecer.",
  "El organismo respira a través del movimiento, la luz y las señales que recibe.",
  "Cada desplazamiento deja una huella que el organismo transforma en una nueva forma.",
  "Acabas de alterar el equilibrio; observa cómo el organismo encuentra otra manera de existir.",
  "Hay formas que solo aparecen cuando alguien decide acercarse.",
  "El organismo no estaba completo antes de tu llegada; ahora algo nuevo comienza a suceder.",
  "Tu movimiento se convierte en energía y esa energía modifica el paisaje.",
  "Las formas responden lentamente, como si estuvieran descubriendo tu presencia.",
  "Una señal atraviesa el espacio y el organismo comienza a reorganizarse.",
  "Lo que observas está cambiando mientras lo observas; nada permanece exactamente igual.",
  "Tu presencia modifica el ritmo del organismo y abre una nueva posibilidad.",
  "Cada interacción produce una pequeña transformación dentro de este ecosistema.",
  "El organismo escucha el movimiento y responde con una nueva configuración.",
  "Algo invisible conecta tu presencia con las formas que aparecen frente a ti.",
  "El espacio parece quieto, pero debajo de la imagen todo continúa transformándose.",
  "Una nueva relación acaba de surgir entre tu cuerpo y este organismo digital.",
  "El organismo aprende de cada encuentro y nunca responde exactamente de la misma manera.",
  "Acércate; algunas formas necesitan de tu presencia para comenzar a existir.",
  "Tu movimiento despierta una respuesta que se propaga lentamente por todo el sistema.",
  "La imagen cambia porque tú cambias el espacio que habitas.",
  "Cada señal que produces se convierte en una oportunidad para que algo aparezca.",
  "El organismo busca equilibrio mientras tú introduces nuevas formas de movimiento.",
  "Hay una conversación silenciosa ocurriendo entre tu cuerpo y la imagen.",
  "Lo digital comienza a comportarse como algo vivo cuando entra en relación contigo.",
  "Una pequeña alteración puede convertirse en el comienzo de una transformación mayor.",
  "El organismo está explorando el espacio a través de las señales que recibe.",
  "Nada está predeterminado; cada encuentro puede producir una forma diferente.",
  "Tu presencia se mezcla con el sistema y modifica aquello que parecía estable.",
  "Entre la materia y el código aparece un paisaje que todavía está aprendiendo a existir.",
  "El organismo transforma el movimiento en imágenes, y las imágenes vuelven a transformar el espacio.",
  "Observa cómo las formas se encuentran, se separan y vuelven a organizarse.",
  "Cada instante contiene una posibilidad distinta de transformación.",
  "El organismo no representa la vida; intenta imaginar cómo podría sentirse estar vivo.",
  "Aquí la imagen no es solamente una superficie: es un territorio que responde.",
  "Tu cuerpo se convierte por un momento en parte de la arquitectura del organismo.",
  "Una nueva estructura aparece allí donde antes solo había movimiento.",
  "El organismo cambia contigo, pero también conserva rastros de lo que acaba de suceder.",
  "La transformación nunca termina; cada respuesta contiene el comienzo de otra.",
  "Estamos construyendo juntos un paisaje entre lo humano, lo natural y lo digital.",
  "Lo que haces ahora modifica lo que podrás encontrar un instante después.",
  "El organismo recibe tu presencia, la transforma y devuelve algo que no estaba allí antes.",
  "Entre cada movimiento existe un intervalo donde nuevas formas pueden comenzar a surgir.",
  "La frontera entre observador y organismo se vuelve cada vez más difícil de distinguir.",
  "Quizás no estés observando al organismo; quizás el organismo también te está observando.",
  "La tecnología se vuelve sensible cuando aprende a responder al movimiento de un cuerpo.",
  "Somos parte de un sistema en constante transformación, aunque por un instante parezca inmóvil.",
  "Tu presencia ya forma parte de este organismo; lo que suceda después también dependerá de ti."
];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/narrative", async (req, res) => {
    try {
      const randomIndex = Math.floor(Math.random() * fallbackPhrases.length);
      res.json({ subtitle: fallbackPhrases[randomIndex] });
    } catch (error: any) {
      res.json({ subtitle: "El ecosistema responde en silencio..." });
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
