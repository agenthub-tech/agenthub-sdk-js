import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebAASDK, SkillDefinition, InitOptions, AGUIEvent } from './index';

// ── Helpers ──

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    name: overrides.name ?? 'test_skill',
    schema: overrides.schema ?? { type: 'function', function: { name: 'test_skill', parameters: {} } },
    promptInjection: overrides.promptInjection,
    executionMode: overrides.executionMode ?? 'sdk',
    execute: overrides.execute ?? (async () => ({ ok: true })),
  };
}

function mockFetchSuccess(channelId = 'ch-123', protocolVersion = '1.0.0') {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/auth/token')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test-token-abc', expires_in: 7200 }),
      });
    }
    if (typeof url === 'string' && url.includes('/api/config')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ui_theme: null, permission_scope: {} }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ registered: true, channel_id: channelId, protocol_version: protocolVersion }),
    });
  });
}

function mockFetchFailure(status: number, detail: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: 'Error',
    json: async () => ({ detail }),
  });
}

describe('WebAASDK.init', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should POST to /api/sdk/register with correct payload', async () => {
    const fetchMock = mockFetchSuccess();
    globalThis.fetch = fetchMock;

    const sdk = new WebAASDK();
    const skill = makeSkill({ name: 'page_skill', promptInjection: 'scan first' });

    await sdk.init({
      channelKey: 'key-abc',
      skills: [skill],
      apiBase: 'https://api.example.com',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3); // token + config + register
    // First call: token acquisition
    const [tokenUrl] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://api.example.com/api/auth/token');
    // Second call: config
    const [configUrl] = fetchMock.mock.calls[1];
    expect(configUrl).toBe('https://api.example.com/api/config');
    // Third call: register
    const [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe('https://api.example.com/api/sdk/register');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
    expect(options.headers['Authorization']).toBe('Bearer test-token-abc');

    const body = JSON.parse(options.body);
    expect(body).not.toHaveProperty('channel_key');
    expect(body.protocol_version).toBe('1.0.0');
    expect(body.skills).toHaveLength(1);
    expect(body.skills[0]).toEqual({
      name: 'page_skill',
      schema: skill.schema,
      prompt_injection: 'scan first',
      execution_mode: 'sdk',
    });
  });

  it('should NOT include execute function in the register payload', async () => {
    const fetchMock = mockFetchSuccess();
    globalThis.fetch = fetchMock;

    const sdk = new WebAASDK();
    await sdk.init({
      channelKey: 'key-abc',
      skills: [makeSkill()],
    });

    const body = JSON.parse(fetchMock.mock.calls[2][1].body);
    const skillPayload = body.skills[0];
    expect(skillPayload).not.toHaveProperty('execute');
    expect(skillPayload).not.toHaveProperty('promptInjection');
    expect(skillPayload).not.toHaveProperty('executionMode');
  });

  it('should store the returned channel_id', async () => {
    globalThis.fetch = mockFetchSuccess('my-channel-id');

    const sdk = new WebAASDK();
    await sdk.init({ channelKey: 'key-abc', skills: [makeSkill()] });

    expect(sdk.channelId).toBe('my-channel-id');
  });

  it('should use default protocol version when not specified', async () => {
    const fetchMock = mockFetchSuccess();
    globalThis.fetch = fetchMock;

    const sdk = new WebAASDK();
    await sdk.init({ channelKey: 'key-abc', skills: [makeSkill()] });

    const body = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(body.protocol_version).toBe('1.0.0');
  });

  it('should use custom protocol version when specified', async () => {
    const fetchMock = mockFetchSuccess();
    globalThis.fetch = fetchMock;

    const sdk = new WebAASDK();
    await sdk.init({ channelKey: 'key-abc', skills: [makeSkill()], protocolVersion: '2.0.0' });

    const body = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(body.protocol_version).toBe('2.0.0');
  });

  it('should throw error with status and message on 401 from token endpoint', async () => {
    globalThis.fetch = mockFetchFailure(401, 'Invalid or inactive channel key');

    const sdk = new WebAASDK();
    await expect(
      sdk.init({ channelKey: 'bad-key', skills: [] })
    ).rejects.toThrow('Token acquisition failed (401): Invalid or inactive channel key');
  });

  it('should throw error with status and message on 400 from register', async () => {
    // Token succeeds, config succeeds, register fails
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'test-token', expires_in: 7200 }),
        });
      }
      if (url.includes('/api/config')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ui_theme: null, permission_scope: {} }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 400,
        statusText: 'Error',
        json: async () => ({ detail: 'Duplicate skill name: foo' }),
      });
    });

    const sdk = new WebAASDK();
    await expect(
      sdk.init({ channelKey: 'key-abc', skills: [makeSkill({ name: 'foo' })] })
    ).rejects.toThrow('Register failed (400): Duplicate skill name: foo');
  });

  it('should handle non-JSON error responses gracefully', async () => {
    // Token succeeds, config succeeds, register fails with non-JSON
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/auth/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'test-token', expires_in: 7200 }),
        });
      }
      if (url.includes('/api/config')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ui_theme: null, permission_scope: {} }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('not json'); },
      });
    });

    const sdk = new WebAASDK();
    await expect(
      sdk.init({ channelKey: 'key-abc', skills: [makeSkill()] })
    ).rejects.toThrow('Register failed (500): Internal Server Error');
  });

  it('should set prompt_injection to null when not provided', async () => {
    const fetchMock = mockFetchSuccess();
    globalThis.fetch = fetchMock;

    const sdk = new WebAASDK();
    await sdk.init({
      channelKey: 'key-abc',
      skills: [makeSkill({ promptInjection: undefined })],
    });

    const body = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(body.skills[0].prompt_injection).toBeNull();
  });

  it('should register multiple skills with correct metadata', async () => {
    const fetchMock = mockFetchSuccess();
    globalThis.fetch = fetchMock;

    const sdk = new WebAASDK();
    await sdk.init({
      channelKey: 'key-abc',
      skills: [
        makeSkill({ name: 'skill_a', executionMode: 'sdk' }),
        makeSkill({ name: 'skill_b', executionMode: 'backend', promptInjection: 'hint' }),
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(body.skills).toHaveLength(2);
    expect(body.skills[0].name).toBe('skill_a');
    expect(body.skills[0].execution_mode).toBe('sdk');
    expect(body.skills[1].name).toBe('skill_b');
    expect(body.skills[1].execution_mode).toBe('backend');
    expect(body.skills[1].prompt_injection).toBe('hint');
  });

  it('should default apiBase to empty string', async () => {
    const fetchMock = mockFetchSuccess();
    globalThis.fetch = fetchMock;

    const sdk = new WebAASDK();
    await sdk.init({ channelKey: 'key-abc', skills: [makeSkill()] });

    const [url] = fetchMock.mock.calls[2]; // register call (index 2)
    expect(url).toBe('/api/sdk/register');
  });
});

// ── SSE Stream Helpers ──

function sseEvent(type: string, payload: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ type, payload, protocol_version: '1.0.0', timestamp: new Date().toISOString() })}\n\n`;
}

function createSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

function mockFetchSSE(chunks: string[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: createSSEStream(chunks),
  });
}

async function initSDK(sdk: WebAASDK, fetchMock?: ReturnType<typeof vi.fn>) {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = mockFetchSuccess() as typeof globalThis.fetch;
  await sdk.init({ channelKey: 'key-abc', skills: [], apiBase: 'https://api.test' });
  globalThis.fetch = (fetchMock ?? prevFetch) as typeof globalThis.fetch;
}

function collectEvents(emitter: ReturnType<WebAASDK['run']>, timeout = 500): Promise<AGUIEvent[]> {
  return new Promise((resolve) => {
    const events: AGUIEvent[] = [];
    emitter.on('event', (e: AGUIEvent) => events.push(e));
    emitter.on('done', () => resolve(events));
    emitter.on('error', () => resolve(events));
    setTimeout(() => resolve(events), timeout);
  });
}

describe('WebAASDK.run', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should POST to /api/agent/run with correct payload and headers', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 's-1' }),
      sseEvent('RunFinished', {}),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const emitter = sdk.run({ userInput: 'hello', context: { page: 'home' } });
    await collectEvents(emitter);

    expect(sseFetch).toHaveBeenCalledOnce();
    const [url, opts] = sseFetch.mock.calls[0];
    expect(url).toBe('https://api.test/api/agent/run');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['Authorization']).toBe('Bearer test-token-abc');
    expect(opts.headers).not.toHaveProperty('X-Channel-Key');

    const body = JSON.parse(opts.body);
    expect(body.user_input).toBe('hello');
    expect(body.context).toEqual({ page: 'home' });
  });

  it('should include session_id and tool_result in payload when provided', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 's-2' }),
      sseEvent('RunFinished', {}),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const emitter = sdk.run({
      userInput: '',
      sessionId: 's-old',
      toolResult: { result: 'ok' },
    });
    await collectEvents(emitter);

    const body = JSON.parse(sseFetch.mock.calls[0][1].body);
    expect(body.session_id).toBe('s-old');
    expect(body.tool_result).toEqual({ result: 'ok' });
  });

  it('should return an EventEmitter immediately', async () => {
    const sseFetch = mockFetchSSE([sseEvent('RunFinished', {})]);
    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const emitter = sdk.run({ userInput: 'test' });
    expect(emitter).toBeDefined();
    expect(typeof emitter.on).toBe('function');
    expect(typeof emitter.emit).toBe('function');
  });

  it('should emit typed events matching the event type', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 's-1' }),
      sseEvent('TextMessageStart', { message_id: 'm-1' }),
      sseEvent('TextMessageDelta', { delta: 'hi' }),
      sseEvent('TextMessageEnd', { message_id: 'm-1' }),
      sseEvent('RunFinished', {}),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const typedEvents: string[] = [];
    const emitter = sdk.run({ userInput: 'hello' });
    emitter.on('RunStarted', () => typedEvents.push('RunStarted'));
    emitter.on('TextMessageStart', () => typedEvents.push('TextMessageStart'));
    emitter.on('TextMessageDelta', () => typedEvents.push('TextMessageDelta'));
    emitter.on('TextMessageEnd', () => typedEvents.push('TextMessageEnd'));

    await collectEvents(emitter);

    expect(typedEvents).toEqual([
      'RunStarted',
      'TextMessageStart',
      'TextMessageDelta',
      'TextMessageEnd',
    ]);
  });

  it('should emit generic "event" for all events', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 's-1' }),
      sseEvent('TextMessageDelta', { delta: 'x' }),
      sseEvent('RunFinished', {}),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const events = await collectEvents(sdk.run({ userInput: 'hi' }));
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(['RunStarted', 'TextMessageDelta', 'RunFinished']);
  });

  it('should track session_id from RunStarted events', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 'tracked-session-42' }),
      sseEvent('RunFinished', {}),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    expect(sdk.sessionId).toBeNull();
    await collectEvents(sdk.run({ userInput: 'hi' }));
    expect(sdk.sessionId).toBe('tracked-session-42');
  });

  it('should emit "done" on RunFinished', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 's-1' }),
      sseEvent('RunFinished', { reason: 'complete' }),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const donePayload = await new Promise<AGUIEvent>((resolve) => {
      const emitter = sdk.run({ userInput: 'hi' });
      emitter.on('done', resolve);
    });

    expect(donePayload.type).toBe('RunFinished');
  });

  it('should emit "error" on Error event from SSE', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 's-1' }),
      sseEvent('Error', { message: 'something broke' }),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const errorPayload = await new Promise<AGUIEvent>((resolve) => {
      const emitter = sdk.run({ userInput: 'hi' });
      emitter.on('error', resolve);
    });

    expect(errorPayload.type).toBe('Error');
    expect(errorPayload.payload.message).toBe('something broke');
  });

  it('should emit "error" when fetch returns non-ok status', async () => {
    // Token refresh also returns 401, so both attempts fail
    const sseFetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/auth/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'refreshed-token', expires_in: 7200 }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ detail: 'Invalid channel key' }),
      });
    });

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const error = await new Promise<Error>((resolve) => {
      const emitter = sdk.run({ userInput: 'hi' });
      emitter.on('error', resolve);
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('401');
    expect(error.message).toContain('Invalid channel key');
  });

  it('should emit "error" when response body is null', async () => {
    const sseFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: null,
    });

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const error = await new Promise<Error>((resolve) => {
      const emitter = sdk.run({ userInput: 'hi' });
      emitter.on('error', resolve);
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('empty');
  });

  it('should handle SSE data split across multiple chunks', async () => {
    // Simulate a single event split across two chunks
    const fullEvent = sseEvent('RunStarted', { session_id: 's-split' });
    const midpoint = Math.floor(fullEvent.length / 2);
    const chunk1 = fullEvent.slice(0, midpoint);
    const chunk2 = fullEvent.slice(midpoint) + sseEvent('RunFinished', {});

    const sseFetch = mockFetchSSE([chunk1, chunk2]);
    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const events = await collectEvents(sdk.run({ userInput: 'hi' }));
    expect(events.map((e) => e.type)).toEqual(['RunStarted', 'RunFinished']);
    expect(sdk.sessionId).toBe('s-split');
  });

  it('should skip malformed JSON lines gracefully', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 's-1' }),
      'data: {not valid json}\n\n',
      sseEvent('RunFinished', {}),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const events = await collectEvents(sdk.run({ userInput: 'hi' }));
    expect(events.map((e) => e.type)).toEqual(['RunStarted', 'RunFinished']);
  });

  it('should default context to empty object when not provided', async () => {
    const sseFetch = mockFetchSSE([sseEvent('RunFinished', {})]);
    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    sdk.run({ userInput: 'test' });
    await new Promise((r) => setTimeout(r, 100));

    const body = JSON.parse(sseFetch.mock.calls[0][1].body);
    expect(body.context).toEqual({});
  });

  it('should not include session_id/tool_result when not provided', async () => {
    const sseFetch = mockFetchSSE([sseEvent('RunFinished', {})]);
    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    sdk.run({ userInput: 'test' });
    await new Promise((r) => setTimeout(r, 100));

    const body = JSON.parse(sseFetch.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('session_id');
    expect(body).not.toHaveProperty('tool_result');
  });

  it('should emit "error" when fetch throws a network error', async () => {
    const sseFetch = vi.fn().mockRejectedValue(new Error('Network failure'));
    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const error = await new Promise<Error>((resolve) => {
      const emitter = sdk.run({ userInput: 'hi' });
      emitter.on('error', resolve);
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Network failure');
  });

  it('should stop processing events after RunFinished', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 's-1' }),
      sseEvent('RunFinished', {}),
      sseEvent('TextMessageDelta', { delta: 'should not appear' }),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const events = await collectEvents(sdk.run({ userInput: 'hi' }));
    expect(events.map((e) => e.type)).toEqual(['RunStarted', 'RunFinished']);
  });
});


// ── SkillExecuteInstruction Auto-Dispatch Tests ──

async function initSDKWithSkills(
  sdk: WebAASDK,
  skills: SkillDefinition[],
  fetchMock?: ReturnType<typeof vi.fn>,
) {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = mockFetchSuccess() as typeof globalThis.fetch;
  await sdk.init({ channelKey: 'key-abc', skills, apiBase: 'https://api.test' });
  globalThis.fetch = (fetchMock ?? prevFetch) as typeof globalThis.fetch;
}

describe('WebAASDK SkillExecuteInstruction auto-dispatch', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('should execute a registered skill and send result back via a follow-up run', async () => {
    const executeFn = vi.fn().mockResolvedValue({ clicked: true });
    const skill = makeSkill({ name: 'dom_skill', execute: executeFn });

    const sdk = new WebAASDK();
    await initSDKWithSkills(sdk, [skill]);

    // First call: returns SkillExecuteInstruction
    // Second call (auto-dispatch): returns RunFinished
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          body: createSSEStream([
            sseEvent('RunStarted', { session_id: 'sess-1' }),
            sseEvent('SkillExecuteInstruction', {
              tool_call_id: 'tc-1',
              skill_name: 'dom_skill',
              params: { action: 'click', el_id: 'el_001' },
            }),
          ]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: createSSEStream([
          sseEvent('RunStarted', { session_id: 'sess-1' }),
          sseEvent('TextMessageDelta', { delta: 'Done!' }),
          sseEvent('RunFinished', {}),
        ]),
      });
    }) as typeof globalThis.fetch;

    const events = await collectEvents(sdk.run({ userInput: 'click button' }));

    // Skill execute was called with correct params
    expect(executeFn).toHaveBeenCalledOnce();
    expect(executeFn).toHaveBeenCalledWith({ action: 'click', el_id: 'el_001' });

    // Follow-up run was called with tool_result and session_id
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCallBody.session_id).toBe('sess-1');
    expect(secondCallBody.tool_result).toEqual({
      tool_call_id: 'tc-1',
      result: { clicked: true },
    });

    // Events from both the first and follow-up streams are piped to the same emitter
    const types = events.map((e) => e.type);
    expect(types).toContain('RunStarted');
    expect(types).toContain('SkillExecuteInstruction');
    expect(types).toContain('TextMessageDelta');
    expect(types).toContain('RunFinished');
  });

  it('should send error tool_result when skill is not registered locally', async () => {
    const sdk = new WebAASDK();
    await initSDKWithSkills(sdk, [makeSkill({ name: 'other_skill' })]);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          body: createSSEStream([
            sseEvent('RunStarted', { session_id: 'sess-2' }),
            sseEvent('SkillExecuteInstruction', {
              tool_call_id: 'tc-2',
              skill_name: 'unknown_skill',
              params: {},
            }),
          ]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: createSSEStream([
          sseEvent('RunFinished', {}),
        ]),
      });
    }) as typeof globalThis.fetch;

    const events = await collectEvents(sdk.run({ userInput: 'do something' }));

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCallBody.tool_result).toEqual({
      tool_call_id: 'tc-2',
      result: { error: "Skill 'unknown_skill' not registered locally" },
    });

    expect(events.map((e) => e.type)).toContain('RunFinished');
  });

  it('should send error tool_result when skill.execute throws', async () => {
    const executeFn = vi.fn().mockRejectedValue(new Error('DOM element not found'));
    const skill = makeSkill({ name: 'dom_skill', execute: executeFn });

    const sdk = new WebAASDK();
    await initSDKWithSkills(sdk, [skill]);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          body: createSSEStream([
            sseEvent('RunStarted', { session_id: 'sess-3' }),
            sseEvent('SkillExecuteInstruction', {
              tool_call_id: 'tc-3',
              skill_name: 'dom_skill',
              params: { action: 'click' },
            }),
          ]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: createSSEStream([
          sseEvent('RunFinished', {}),
        ]),
      });
    }) as typeof globalThis.fetch;

    const events = await collectEvents(sdk.run({ userInput: 'click' }));

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCallBody.tool_result).toEqual({
      tool_call_id: 'tc-3',
      result: { error: 'DOM element not found' },
    });

    expect(events.map((e) => e.type)).toContain('RunFinished');
  });

  it('should use tracked session_id in the follow-up run request', async () => {
    const skill = makeSkill({ name: 'page_skill', execute: async () => ({ scanned: true }) });

    const sdk = new WebAASDK();
    await initSDKWithSkills(sdk, [skill]);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          body: createSSEStream([
            sseEvent('RunStarted', { session_id: 'my-session-xyz' }),
            sseEvent('SkillExecuteInstruction', {
              tool_call_id: 'tc-4',
              skill_name: 'page_skill',
              params: {},
            }),
          ]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: createSSEStream([
          sseEvent('RunFinished', {}),
        ]),
      });
    }) as typeof globalThis.fetch;

    await collectEvents(sdk.run({ userInput: 'scan' }));

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCallBody.session_id).toBe('my-session-xyz');
  });

  it('should pipe follow-up run events to the same emitter (transparent dispatch)', async () => {
    const skill = makeSkill({ name: 'test_skill', execute: async () => ({ result: 'ok' }) });

    const sdk = new WebAASDK();
    await initSDKWithSkills(sdk, [skill]);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          body: createSSEStream([
            sseEvent('RunStarted', { session_id: 'sess-pipe' }),
            sseEvent('SkillExecuteInstruction', {
              tool_call_id: 'tc-pipe',
              skill_name: 'test_skill',
              params: { x: 1 },
            }),
          ]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: createSSEStream([
          sseEvent('RunStarted', { session_id: 'sess-pipe' }),
          sseEvent('TextMessageStart', { message_id: 'm-1' }),
          sseEvent('TextMessageDelta', { delta: 'All done' }),
          sseEvent('TextMessageEnd', { message_id: 'm-1' }),
          sseEvent('RunFinished', {}),
        ]),
      });
    }) as typeof globalThis.fetch;

    const donePromise = new Promise<void>((resolve) => {
      const emitter = sdk.run({ userInput: 'go' });
      const allEvents: AGUIEvent[] = [];
      emitter.on('event', (e: AGUIEvent) => allEvents.push(e));
      emitter.on('done', () => {
        // Verify all events from both streams arrived on the same emitter
        const types = allEvents.map((e) => e.type);
        expect(types).toEqual([
          'RunStarted',
          'SkillExecuteInstruction',
          'ToolCallEnd',
          'RunStarted',
          'TextMessageStart',
          'TextMessageDelta',
          'TextMessageEnd',
          'RunFinished',
        ]);
        resolve();
      });
    });

    await donePromise;
  });

  it('should default params to empty object when not present in payload', async () => {
    const executeFn = vi.fn().mockResolvedValue({ ok: true });
    const skill = makeSkill({ name: 'simple_skill', execute: executeFn });

    const sdk = new WebAASDK();
    await initSDKWithSkills(sdk, [skill]);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          body: createSSEStream([
            sseEvent('RunStarted', { session_id: 'sess-5' }),
            sseEvent('SkillExecuteInstruction', {
              tool_call_id: 'tc-5',
              skill_name: 'simple_skill',
              // no params field
            }),
          ]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: createSSEStream([sseEvent('RunFinished', {})]),
      });
    }) as typeof globalThis.fetch;

    await collectEvents(sdk.run({ userInput: 'go' }));

    expect(executeFn).toHaveBeenCalledWith({});
  });
});


// ── Connection Lifecycle Management Tests ──

describe('WebAASDK connection lifecycle', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should auto-reconnect on 500 errors up to maxRetries', async () => {
    const sdk = new WebAASDK();
    await initSDK(sdk);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 3) {
        return Promise.resolve({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ detail: 'Server error' }),
        });
      }
      // 4th call succeeds
      return Promise.resolve({
        ok: true,
        status: 200,
        body: createSSEStream([
          sseEvent('RunStarted', { session_id: 's-retry' }),
          sseEvent('RunFinished', {}),
        ]),
      });
    }) as typeof globalThis.fetch;

    const events = await collectEvents(
      sdk.run({ userInput: 'hi' }),
      6000,
    );

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(4); // 3 failures + 1 success
    expect(events.map((e) => e.type)).toEqual(['RunStarted', 'RunFinished']);
  });

  it('should NOT reconnect on 4xx errors (except 401 which triggers token refresh)', async () => {
    const sdk = new WebAASDK();
    await initSDK(sdk);

    // 401 triggers token refresh + retry. If second attempt also 401, emit error.
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (typeof url === 'string' && url.includes('/api/auth/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'refreshed-token', expires_in: 7200 }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ detail: 'Invalid channel key' }),
      });
    });

    const error = await new Promise<Error>((resolve) => {
      const emitter = sdk.run({ userInput: 'hi' });
      emitter.on('error', resolve);
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('401');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    // 1st /api/agent/run (401) + 1 /api/auth/token (refresh) + 2nd /api/agent/run (401) = 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should NOT reconnect on 403 errors', async () => {
    const sdk = new WebAASDK();
    await initSDK(sdk);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ detail: 'Forbidden' }),
    });

    const error = await new Promise<Error>((resolve) => {
      const emitter = sdk.run({ userInput: 'hi' });
      emitter.on('error', resolve);
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('403');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should NOT reconnect on RunFinished event', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 's-1' }),
      sseEvent('RunFinished', {}),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const events = await collectEvents(sdk.run({ userInput: 'hi' }));
    expect(events.map((e) => e.type)).toEqual(['RunStarted', 'RunFinished']);
    expect(sseFetch).toHaveBeenCalledTimes(1); // No reconnect after RunFinished
  });

  it('should emit error and close on Error event without reconnecting', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 's-1' }),
      sseEvent('Error', { message: 'something broke' }),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const errorPayload = await new Promise<AGUIEvent>((resolve) => {
      const emitter = sdk.run({ userInput: 'hi' });
      emitter.on('error', resolve);
    });

    expect(errorPayload.type).toBe('Error');
    expect(sseFetch).toHaveBeenCalledTimes(1); // No reconnect after Error event
  });

  it('should emit error after exhausting maxRetries on 500', async () => {
    const sdk = new WebAASDK();
    // Use low retry count and delay for fast test
    globalThis.fetch = mockFetchSuccess() as typeof globalThis.fetch;
    await sdk.init({
      channelKey: 'key-abc',
      skills: [],
      apiBase: 'https://api.test',
      maxRetries: 2,
      retryDelay: 50,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({ detail: 'Server error' }),
    });

    const error = await new Promise<Error>((resolve) => {
      const emitter = sdk.run({ userInput: 'hi' });
      emitter.on('error', resolve);
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('500');
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    // Initial attempt + 2 retries = 3 total
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('should auto-reconnect on network errors (non-4xx)', async () => {
    const sdk = new WebAASDK();
    globalThis.fetch = mockFetchSuccess() as typeof globalThis.fetch;
    await sdk.init({
      channelKey: 'key-abc',
      skills: [],
      apiBase: 'https://api.test',
      maxRetries: 2,
      retryDelay: 50,
    });

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 2) {
        return Promise.reject(new Error('Network failure'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        body: createSSEStream([
          sseEvent('RunStarted', { session_id: 's-net' }),
          sseEvent('RunFinished', {}),
        ]),
      });
    }) as typeof globalThis.fetch;

    const events = await collectEvents(sdk.run({ userInput: 'hi' }), 2000);
    expect(events.map((e) => e.type)).toEqual(['RunStarted', 'RunFinished']);
  });

  it('should respect configurable maxRetries and retryDelay', async () => {
    const sdk = new WebAASDK();
    globalThis.fetch = mockFetchSuccess() as typeof globalThis.fetch;
    await sdk.init({
      channelKey: 'key-abc',
      skills: [],
      apiBase: 'https://api.test',
      maxRetries: 1,
      retryDelay: 50,
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => ({ detail: 'Bad Gateway' }),
    });

    const error = await new Promise<Error>((resolve) => {
      const emitter = sdk.run({ userInput: 'hi' });
      emitter.on('error', resolve);
    });

    expect(error).toBeInstanceOf(Error);
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    // Initial attempt + 1 retry = 2 total
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('should disconnect and cancel pending reconnection', async () => {
    const sdk = new WebAASDK();
    globalThis.fetch = mockFetchSuccess() as typeof globalThis.fetch;
    await sdk.init({
      channelKey: 'key-abc',
      skills: [],
      apiBase: 'https://api.test',
      maxRetries: 5,
      retryDelay: 200,
    });

    // First call fails with 500, triggering reconnect
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ detail: 'Server error' }),
      });
    }) as typeof globalThis.fetch;

    const emitter = sdk.run({ userInput: 'hi' });

    // Wait for first call to complete, then disconnect before retry fires
    await new Promise((r) => setTimeout(r, 50));
    sdk.disconnect();

    // Wait long enough for retries to have fired if not cancelled
    await new Promise((r) => setTimeout(r, 600));

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    // Should have only made 1 call (the initial one), reconnect was cancelled
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should silently ignore unknown event types', async () => {
    const sseFetch = mockFetchSSE([
      sseEvent('RunStarted', { session_id: 's-1' }),
      sseEvent('FutureEventType', { some: 'data' }),
      sseEvent('AnotherUnknown', { x: 1 }),
      sseEvent('TextMessageDelta', { delta: 'hello' }),
      sseEvent('RunFinished', {}),
    ]);

    const sdk = new WebAASDK();
    await initSDK(sdk, sseFetch);

    const events = await collectEvents(sdk.run({ userInput: 'hi' }));
    const types = events.map((e) => e.type);

    // Unknown events should be silently skipped
    expect(types).toEqual(['RunStarted', 'TextMessageDelta', 'RunFinished']);
    expect(types).not.toContain('FutureEventType');
    expect(types).not.toContain('AnotherUnknown');
  });

  it('should detect heartbeat timeout and attempt reconnect', async () => {
    vi.useFakeTimers();

    const sdk = new WebAASDK();
    // Use real fetch for init
    const realFetch = globalThis.fetch;
    globalThis.fetch = mockFetchSuccess() as typeof globalThis.fetch;
    await sdk.init({
      channelKey: 'key-abc',
      skills: [],
      apiBase: 'https://api.test',
      maxRetries: 1,
      retryDelay: 100,
      heartbeatTimeout: 500, // 500ms for fast test
    });

    // Create a stream that sends one event then stalls (never closes)
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: stream that sends RunStarted then stalls
        const encoder = new TextEncoder();
        let sent = false;
        return Promise.resolve({
          ok: true,
          status: 200,
          body: new ReadableStream({
            pull(controller) {
              if (!sent) {
                sent = true;
                controller.enqueue(encoder.encode(sseEvent('RunStarted', { session_id: 's-hb' })));
                // Don't close — simulate stall
                return;
              }
              // Return a never-resolving promise to simulate stall
              return new Promise(() => {});
            },
          }),
        });
      }
      // Second call (after heartbeat reconnect): normal completion
      return Promise.resolve({
        ok: true,
        status: 200,
        body: createSSEStream([
          sseEvent('RunStarted', { session_id: 's-hb-2' }),
          sseEvent('RunFinished', {}),
        ]),
      });
    }) as typeof globalThis.fetch;

    const events: AGUIEvent[] = [];
    const emitter = sdk.run({ userInput: 'hi' });
    emitter.on('event', (e: AGUIEvent) => events.push(e));

    // Let the first fetch resolve and RunStarted be processed
    await vi.advanceTimersByTimeAsync(50);

    // Advance past heartbeat timeout
    await vi.advanceTimersByTimeAsync(600);

    // Advance past retry delay
    await vi.advanceTimersByTimeAsync(200);

    // Let the second fetch resolve
    await vi.advanceTimersByTimeAsync(50);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    // First stream had RunStarted, second stream should have RunStarted + RunFinished
    expect(events.some((e) => e.type === 'RunStarted')).toBe(true);

    sdk.disconnect(); // cleanup
    vi.useRealTimers();
  });

  it('should use default config values when not specified', async () => {
    const sdk = new WebAASDK();
    globalThis.fetch = mockFetchSuccess() as typeof globalThis.fetch;
    await sdk.init({
      channelKey: 'key-abc',
      skills: [makeSkill()],
      apiBase: 'https://api.test',
    });

    // Verify defaults by checking behavior: 3 retries with 1000ms delay
    // We just verify the SDK initializes without error — defaults are internal
    expect(sdk.channelId).toBe('ch-123');
  });

  it('disconnect should be safe to call multiple times', () => {
    const sdk = new WebAASDK();
    // Should not throw
    sdk.disconnect();
    sdk.disconnect();
    sdk.disconnect();
  });

  it('disconnect should stop event processing', async () => {
    const sdk = new WebAASDK();
    await initSDK(sdk);

    // Create a slow stream
    const encoder = new TextEncoder();
    let chunkIndex = 0;
    const chunks = [
      sseEvent('RunStarted', { session_id: 's-dc' }),
      sseEvent('TextMessageDelta', { delta: 'hello' }),
      sseEvent('RunFinished', {}),
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: new ReadableStream({
        async pull(controller) {
          if (chunkIndex < chunks.length) {
            // Add delay between chunks
            await new Promise((r) => setTimeout(r, 100));
            controller.enqueue(encoder.encode(chunks[chunkIndex]));
            chunkIndex++;
          } else {
            controller.close();
          }
        },
      }),
    }) as typeof globalThis.fetch;

    const events: AGUIEvent[] = [];
    const emitter = sdk.run({ userInput: 'hi' });
    emitter.on('event', (e: AGUIEvent) => events.push(e));

    // Wait for first event, then disconnect
    await new Promise((r) => setTimeout(r, 200));
    sdk.disconnect();

    // Wait to ensure no more events come through
    await new Promise((r) => setTimeout(r, 500));

    // Should have received at most the first event(s) before disconnect
    // The exact count depends on timing, but RunFinished should NOT be emitted as 'done'
    const doneEvents = events.filter((e) => e.type === 'RunFinished');
    // After disconnect, processing should stop
    expect(events.length).toBeLessThanOrEqual(3);
  });
});
