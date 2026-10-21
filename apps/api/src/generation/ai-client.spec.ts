import { AiClient } from './ai-client';

// A retired model id is the failure people hit most often and diagnose worst:
// the provider answers 404 "the model does not exist or you do not have access
// to it", which reads like a billing or key problem, and the model name lives in
// an env var rather than in the code — so nothing here changed when it broke.
describe('AiClient error reporting', () => {
  const client = new AiClient();
  const realFetch = global.fetch;
  const env = { ...process.env };

  const reply = (status: number, body: string) => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(body, { status, headers: { 'content-type': 'application/json' } }),
    ) as unknown as typeof fetch;
  };

  beforeEach(() => {
    process.env.AI_BASE_URL = 'https://api.example.com/openai/v1';
    process.env.AI_API_KEY = 'k';
    process.env.AI_MODEL = 'llama-3.3-70b-versatile';
  });
  afterEach(() => {
    global.fetch = realFetch;
    process.env = { ...env };
  });

  it('blames the model, and names the setting to change', async () => {
    reply(
      404,
      JSON.stringify({
        error: {
          message: 'The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.',
          code: 'model_not_found',
        },
      }),
    );
    await expect(client.json('s', 'u')).rejects.toThrow(
      /does not offer the model "llama-3\.3-70b-versatile".*AI_MODEL/s,
    );
  });

  it('reports a decommissioned model the same way', async () => {
    reply(400, JSON.stringify({ error: { code: 'model_decommissioned' } }));
    await expect(client.json('s', 'u')).rejects.toThrow(/AI_MODEL/);
  });

  it('still blames the key when the provider rejects it', async () => {
    reply(401, '{"error":{"message":"Invalid API Key"}}');
    await expect(client.json('s', 'u')).rejects.toThrow(/authentication failed/i);
  });

  it('leaves an unrelated 400 to the json-mode retry', async () => {
    // A provider that dislikes response_format must not be mistaken for a dead
    // model — the client retries such a call without JSON mode.
    let call = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      call++;
      return Promise.resolve(
        call === 1
          ? new Response('{"error":{"message":"response_format is not supported"}}', { status: 400 })
          : new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
              status: 200,
            }),
      );
    }) as unknown as typeof fetch;
    await expect(client.json('s', 'u')).resolves.toEqual({ ok: true });
    expect(call).toBe(2);
  });
});
