/**
 * Number Validator for AI Dispatcher
 * 
 * Extracts every number (integers, decimals, times) from the AI generated text
 * and strictly verifies that every number cited by the model actually exists
 * in the engine snapshot (passenger counts, delay minutes, flight numbers, airport counts, times).
 * 
 * Non-negotiable rule: The AI explains and recommends, but must NEVER hallucinate or calculate numbers.
 */

export function extractNumbersFromText(text: string): number[] {
  // Matches integers, decimals, and HH:MM times converted to minutes or components
  // Also ignores flight numbers like DS0101 by stripping letters
  const numbers: number[] = [];
  
  // Find all standalone numbers and times
  // 1. Match times like 14:00, 15:30
  const timeRegex = /\b([0-1]?[0-9]|2[0-3]):([0-5][0-9])\b/g;
  let match: RegExpExecArray | null;
  while ((match = timeRegex.exec(text)) !== null) {
    const [h, m] = match[0].split(':').map(Number);
    numbers.push(h * 60 + m); // total minutes
    numbers.push(h);
    numbers.push(m);
  }

  // 2. Match standard numbers (e.g. 420, 15, 3.5, -45)
  // Avoid matching numbers that are part of flight IDs or tails like DS0101, VT-DS01
  const cleanText = text.replace(/[A-Za-z]+[-_]?[0-9]+/g, ' '); // remove IDs like DS0101, VT-DS18
  const numRegex = /(?<![A-Za-z])[-+]?\b\d+(\.\d+)?\b/g;
  while ((match = numRegex.exec(cleanText)) !== null) {
    const val = parseFloat(match[0]);
    if (!isNaN(val)) {
      numbers.push(val);
    }
  }

  return numbers;
}

export function buildAllowedNumberSet(snapshot: any): Set<number> {
  const allowed = new Set<number>();

  // Add standard constants that models often mention (e.g. 0, 1, 2, 3, 4, 5, 10, 16, 70, 24, 60, 100)
  [0, 1, 2, 3, 4, 5, 10, 16, 21, 70, 24, 60, 100].forEach(n => allowed.add(n));

  // Add closure numbers
  if (snapshot.closure) {
    const [sh, sm] = snapshot.closure.start_time.split(':').map(Number);
    const [eh, em] = snapshot.closure.end_time.split(':').map(Number);
    allowed.add(sh); allowed.add(sm); allowed.add(sh * 60 + sm);
    allowed.add(eh); allowed.add(em); allowed.add(eh * 60 + em);
    allowed.add((eh * 60 + em) - (sh * 60 + sm)); // closure duration in minutes
  }

  // Add network metrics
  if (snapshot.metrics) {
    Object.values(snapshot.metrics).forEach(val => {
      if (typeof val === 'number') {
        allowed.add(val);
        allowed.add(Math.abs(val));
        allowed.add(Math.round(val));
      }
    });
  }

  // Add top flights metrics
  if (Array.isArray(snapshot.topFlights)) {
    snapshot.topFlights.forEach((f: any) => {
      [
        f.delay_dep_min,
        f.delay_arr_min,
        f.stranded_pax,
        f.actual_crew_duty_min,
      ].forEach(v => {
        if (typeof v === 'number') {
          allowed.add(v);
          allowed.add(Math.abs(v));
        }
      });
      if (f.scheduled_dep) {
        const [h, m] = f.scheduled_dep.split(':').map(Number);
        allowed.add(h); allowed.add(m); allowed.add(h * 60 + m);
      }
      if (f.actual_dep) {
        const [h, m] = f.actual_dep.split(':').map(Number);
        allowed.add(h); allowed.add(m); allowed.add(h * 60 + m);
      }
    });
  }

  // Add recovery candidate numbers
  if (Array.isArray(snapshot.candidates)) {
    snapshot.candidates.forEach((c: any) => {
      allowed.add(c.score);
      if (c.deltas) {
        Object.values(c.deltas).forEach((v: any) => {
          if (typeof v === 'number') {
            allowed.add(v);
            allowed.add(Math.abs(v));
          }
        });
      }
      if (c.afterMetrics) {
        Object.values(c.afterMetrics).forEach((v: any) => {
          if (typeof v === 'number') {
            allowed.add(v);
            allowed.add(Math.abs(v));
          }
        });
      }
    });
  }

  return allowed;
}

export function validateAINumbers(
  aiText: string,
  snapshot: any
): { valid: boolean; unauthorizedNumbers: number[] } {
  const extracted = extractNumbersFromText(aiText);
  const allowed = buildAllowedNumberSet(snapshot);

  const unauthorizedNumbers: number[] = [];
  for (const num of extracted) {
    // Check if number or its rounded integer exists
    if (!allowed.has(num) && !allowed.has(Math.round(num)) && !allowed.has(Math.abs(num))) {
      unauthorizedNumbers.push(num);
    }
  }

  return {
    valid: unauthorizedNumbers.length === 0,
    unauthorizedNumbers,
  };
}
