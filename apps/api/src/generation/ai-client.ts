import { Injectable, Logger } from '@nestjs/common';

/** Thrown when generation is requested but no API key is configured. */
export class AiUnavailableError extends Error {
  constructor(message = 'AI generation is not configured (missing ANTHROPIC_API_KEY)') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/**
 * Minimal Anthropic Messages client over `fetch` (no SDK dependency, §2). Reads
 * the key/model from the environment; when no key is set, `json()` throws
 * AiUnavailableError so the generator can fail the job cleanly (tests + dev run
 * without a key, ФТ-К409).
 */
@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);

  get enabled(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async json<T = unknown>(system: string, user: string, maxTokens = 4096): Promise<T> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new AiUnavailableError();
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    return extractJson<T>(text);
  }
}

/** First balanced {...} / [...] in `text`, or undefined. Ignores braces in strings. */
function sliceBalanced(text: string): string | undefined {
  const start = text.search(/[[{]/);
  if (start < 0) return undefined;
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return text.slice(start, i + 1);
  }
  return undefined;
}

/** Extract a JSON document from a model reply (handles ```json fences / prose). */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = fenced ? [fenced[1], text] : [text];
  for (const c of candidates) {
    try {
      return JSON.parse(c.trim()) as T;
    } catch {
      const sub = sliceBalanced(c);
      if (sub) {
        try {
          return JSON.parse(sub) as T;
        } catch {
          /* try next candidate */
        }
      }
    }
  }
  throw new Error('No valid JSON found in AI response');
}
