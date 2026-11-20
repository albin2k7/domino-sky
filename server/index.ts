import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateAINumbers } from './validator.ts';
import { generateDeterministicFallback } from './fallback.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'domino-sky-dispatcher-proxy' });
});

// Preset scenarios
export const PRESETS = [
  {
    id: 'preset_mumbai_storm',
    name: 'Mumbai Thunderstorm',
    description: 'Severe monsoon downpour shuts BOM from 14:00 to 15:30. Cascades into high-density west and south corridors.',
    closure: { airport_id: 'BOM', start_time: '14:00', end_time: '15:30' },
  },
  {
    id: 'preset_delhi_fog',
    name: 'Delhi Dense Fog',
    description: 'Dense morning fog at DEL mega-hub from 06:00 to 08:30 halts morning departures and threatens crew duty limits.',
    closure: { airport_id: 'DEL', start_time: '06:00', end_time: '08:30' },
  },
  {
    id: 'preset_blr_surge',
    name: 'Bengaluru ATC Airspace Hold',
    description: 'Midday radar outage at BLR from 12:00 to 14:00 disrupts South India hub connections and feeds into spares.',
    closure: { airport_id: 'BLR', start_time: '12:00', end_time: '14:00' },
  },
];

app.get('/api/presets', (req, res) => {
  res.json(PRESETS);
});

// AI Dispatcher endpoint
app.post('/api/dispatch', async (req, res) => {
  const snapshot = req.body;
  if (!snapshot || !snapshot.metrics) {
    return res.status(400).json({ error: 'Missing engine snapshot payload' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const provider = process.env.LLM_PROVIDER || 'gemini';

  // If no API key is provided, use deterministic fallback directly
  if (!apiKey) {
    const fallback = generateDeterministicFallback(snapshot);
    return res.json({
      ...fallback,
      note: 'Operating in pure deterministic mode (no LLM API key configured).',
    });
  }

  const systemPrompt = `You are an expert airline operations dispatcher for Domino Sky.
CRITICAL NON-NEGOTIABLE RULES:
1. Use ONLY the data provided in the snapshot below.
2. NEVER calculate, estimate, compute or round numbers.
3. Every single number you cite in your summary or rationale MUST appear verbatim in the input data.
4. Recommend only from the candidate list using the exact actionId.
5. Return strictly valid JSON with this exact structure:
{
  "summary": "Brief 2-3 sentence ops summary citing ONLY provided numbers.",
  "recommendations": [
    {
      "actionId": "string matching candidate action.id",
      "label": "candidate label",
      "rationale": "Why this action should be taken, citing ONLY snapshot numbers.",
      "priority": "HIGH" | "MEDIUM" | "LOW"
    }
  ]
}`;

  const userPrompt = `ENGINE SNAPSHOT:
${JSON.stringify(snapshot, null, 2)}`;

  // Function to call Gemini API
  async function callGemini(retryInstruction = '') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const promptText = retryInstruction 
      ? `${systemPrompt}\n\nATTENTION: ${retryInstruction}\n\n${userPrompt}` 
      : `${systemPrompt}\n\n${userPrompt}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1, // low temperature for strict factual consistency
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from LLM');
    return JSON.parse(text);
  }

  try {
    // Attempt 1: Call LLM
    let aiResult;
    try {
      aiResult = await callGemini();
    } catch (err) {
      console.warn('LLM call failed, falling back to deterministic template:', err);
      const fallback = generateDeterministicFallback(snapshot);
      return res.json(fallback);
    }

    // Number validation
    const validation = validateAINumbers(JSON.stringify(aiResult), snapshot);

    if (validation.valid) {
      return res.json({
        ...aiResult,
        verified: true,
        fallback: false,
      });
    }

    // If validation fails, retry once with explicit warning
    console.warn(`Number validation failed on attempt 1. Unauthorized numbers: ${validation.unauthorizedNumbers.join(', ')}. Retrying...`);
    
    try {
      const retryWarning = `CRITICAL WARNING: Your previous reply contained numbers (${validation.unauthorizedNumbers.join(', ')}) that DO NOT EXIST in the engine snapshot. You must NEVER invent numbers. Use only numbers present in the snapshot.`;
      const retryResult = await callGemini(retryWarning);
      const retryValidation = validateAINumbers(JSON.stringify(retryResult), snapshot);

      if (retryValidation.valid) {
        return res.json({
          ...retryResult,
          verified: true,
          fallback: false,
        });
      }
      console.warn('Retry still contained unauthorized numbers. Switching to deterministic fallback.');
    } catch (retryErr) {
      console.warn('Retry call failed:', retryErr);
    }

    // Fall back to deterministic template if retry fails
    const fallback = generateDeterministicFallback(snapshot);
    return res.json({
      ...fallback,
      verified: true,
      validationWarning: 'LLM generated numbers that did not match engine calculations; replaced with certified deterministic engine output.',
    });

  } catch (err: any) {
    console.error('Dispatch proxy error:', err);
    const fallback = generateDeterministicFallback(snapshot);
    return res.json(fallback);
  }
});

app.listen(PORT, () => {
  console.log(`[Domino Sky] Dispatcher proxy running on http://localhost:${PORT}`);
});
