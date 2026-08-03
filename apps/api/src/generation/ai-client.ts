import { Injectable, Logger } from '@nestjs/common';

/** Thrown when generation is requested but no provider is configured. */
export class AiUnavailableError extends Error {
  constructor(
    message = 'AI is not configured — set ANTHROPIC_API_KEY, or AI_BASE_URL + AI_API_KEY for an OpenAI-compatible provider.',
  ) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

/**
 * Minimal provider-agnostic AI client over `fetch` (no SDK dependency, §2).
 *
 * Two backends, chosen by env (no code change to switch):
 *  • OpenAI-compatible `/chat/completions` — set AI_BASE_URL + AI_API_KEY
 *    (+ AI_MODEL). Works with OpenRouter, Google Gemini's OpenAI endpoint,
 *    Groq, Together, DeepInfra, Mistral, a local Ollama/LM Studio, etc.
 *  • Anthropic Messages — set ANTHROPIC_API_KEY (+ ANTHROPIC_MODEL).
 *
 * When neither is configured, `json()` throws AiUnavailableError so the
 * generator fails the job cleanly (tests + dev run without a key, ФТ-К409).
 */
@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);

  get enabled(): boolean {
    return (!!process.env.AI_BASE_URL && !!process.env.AI_API_KEY) || !!process.env.ANTHROPIC_API_KEY;
  }

  async json<T = unknown>(system: string, user: string, maxTokens = 4096): Promise<T> {
    // OpenAI-compatible provider takes precedence when configured.
    if (process.env.AI_BASE_URL && process.env.AI_API_KEY) {
      return this.callOpenAiCompatible<T>(
        process.env.AI_BASE_URL,
        process.env.AI_API_KEY,
        system,
        user,
        maxTokens,
      );
    }
    if (process.env.ANTHROPIC_API_KEY) {
      return this.callAnthropic<T>(process.env.ANTHROPIC_API_KEY, system, user, maxTokens);
    }
    throw new AiUnavailableError();
  }

  private async callAnthropic<T>(
    key: string,
    system: string,
    user: string,
    maxTokens: number,
  ): Promise<T> {
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
    const res = await this.fetchRetry(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
      },
      'Anthropic',
    );
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    return extractJson<T>(text);
  }

  private async callOpenAiCompatible<T>(
    baseUrl: string,
    key: string,
    system: string,
    user: string,
    maxTokens: number,
  ): Promise<T> {
    const model = process.env.AI_MODEL || process.env.ANTHROPIC_MODEL || 'gpt-4o-mini';
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const messages = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const run = async (jsonMode: boolean): Promise<T> => {
      const res = await this.fetchRetry(
        url,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            messages,
            // JSON mode makes open models (Llama etc.) reliably emit valid JSON.
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
        },
        'AI provider',
      );
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return extractJson<T>(data.choices?.[0]?.message?.content ?? '');
    };
    try {
      return await run(true);
    } catch (e) {
      // Only worth a second attempt if the provider rejected json mode (400) or
      // still returned non-JSON — auth/rate errors won't be fixed by dropping it.
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('No valid JSON') || msg.includes('400')) return run(false);
      throw e;
    }
  }

  // POST with automatic retry on rate-limit / overload (429, 503) — free tiers
  // (e.g. Gemini) cap requests per minute and generation sends a burst, so we
  // back off and retry rather than failing the whole job. Honours Retry-After.
  private async fetchRetry(url: string, init: RequestInit, label: string): Promise<Response> {
    const maxRetries = 5;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, init);
      if (res.ok) return res;
      const retriable = res.status === 429 || res.status === 503;
      if (!retriable || attempt >= maxRetries) {
        await this.fail(res, label); // throws
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs =
        retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 30000);
      this.logger.warn(
        `${label} ${res.status}; retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${maxRetries})`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  // Turn a non-OK response into a plain, actionable error (never dump raw JSON).
  private async fail(res: Response, label: string): Promise<never> {
    const body = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new Error('AI authentication failed — check that the API key is valid and active.');
    }
    if (res.status === 429) {
      throw new Error('AI rate limit reached — please try again in a moment.');
    }
    this.logger.warn(`${label} error ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`AI request failed (${label} ${res.status}): ${body.slice(0, 160)}`);
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

// Repair the JSON glitches open models commonly emit: trailing commas before a
// closing brace/bracket, and a stray ```-fence remnant.
function repairJson(s: string): string {
  return s.replace(/,(\s*[}\]])/g, '$1').replace(/```/g, '').trim();
}

/** Extract a JSON document from a model reply (handles ```json fences / prose). */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = fenced ? [fenced[1], text] : [text];
  for (const c of candidates) {
    // Try, in order: the raw candidate, the first balanced {…}/[…] slice — each
    // both as-is and lightly repaired (trailing commas etc.).
    for (const variant of [c.trim(), sliceBalanced(c)]) {
      if (!variant) continue;
      for (const attempt of [variant, repairJson(variant)]) {
        try {
          return JSON.parse(attempt) as T;
        } catch {
          /* try the next attempt / candidate */
        }
      }
    }
  }
  throw new Error('No valid JSON found in AI response');
}
