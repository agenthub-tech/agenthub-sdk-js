import { EventEmitter } from 'events';

// ── SDK version ──
const SDK_VERSION = '0.1.0';
const DEFAULT_PROTOCOL_VERSION = '1.0.0';

// ── Public API Types ──

export interface SkillDefinition {
  name: string;
  schema: Record<string, unknown>;
  promptInjection?: string;
  executionMode: 'sdk' | 'backend';
  execute: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

export interface InitOptions {
  channelKey: string;
  skills: SkillDefinition[];
  apiBase?: string;
  protocolVersion?: string;
  accessToken?: string;       // Pre-acquired token (optional, skips /api/auth/token call)
  maxRetries?: number;        // default 3
  retryDelay?: number;        // default 1000 (ms)
  heartbeatTimeout?: number;  // default 45000 (ms)
}

export interface RunOptions {
  userInput: string;
  context?: Record<string, unknown>;
  sessionId?: string;
  toolResult?: Record<string, unknown>;
}

export interface AGUIEvent {
  type: string;
  payload: Record<string, unknown>;
  protocol_version: string;
  timestamp: string;
}

// Known AG-UI event types that the SDK recognizes
const KNOWN_EVENT_TYPES = new Set([
  'RunStarted',
  'RunFinished',
  'TextMessageStart',
  'TextMessageDelta',
  'TextMessageEnd',
  'ToolCallStart',
  'ToolCallDelta',
  'ToolCallEnd',
  'SkillExecuteInstruction',
  'StateSnapshotEvent',
  'Error',
]);

// ── WebAASDK Class ──

export class WebAASDK {
  private _channelId: string | null = null;
  private _channelKey: string = '';
  private _accessToken: string | null = null;
  private _sessionId: string | null = null;
  private _skills: Map<string, SkillDefinition> = new Map();
  private _apiBase: string = '';
  private _protocolVersion: string = DEFAULT_PROTOCOL_VERSION;

  // Connection lifecycle configuration
  private _maxRetries: number = 3;
  private _retryDelay: number = 1000;
  private _heartbeatTimeout: number = 45000;

  // Connection lifecycle state
  private _disconnected: boolean = false;
  private _activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Acquire an access token by exchanging the channel_key at POST /api/auth/token.
   * Stores the token in _accessToken for use in subsequent requests.
   */
  private async _acquireToken(): Promise<void> {
    const response = await fetch(`${this._apiBase}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_key: this._channelKey }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      const message = body.detail ?? body.message ?? response.statusText;
      throw new Error(`Token acquisition failed (${response.status}): ${message}`);
    }

    const data = await response.json();
    this._accessToken = data.access_token;
  }

  /**
   * Initialize the SDK: acquire token, then register skills with the backend via POST /api/sdk/register.
   * Stores the returned channel_id for subsequent requests.
   */
  async init(options: InitOptions): Promise<void> {
    this._apiBase = options.apiBase ?? '';
    this._channelKey = options.channelKey;
    this._protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
    this._maxRetries = options.maxRetries ?? 3;
    this._retryDelay = options.retryDelay ?? 1000;
    this._heartbeatTimeout = options.heartbeatTimeout ?? 45000;
    this._disconnected = false;

    for (const skill of options.skills) {
      this._skills.set(skill.name, skill);
    }

    // Acquire access token: use pre-acquired token if provided, otherwise call /api/auth/token
    if (options.accessToken) {
      this._accessToken = options.accessToken;
    } else {
      await this._acquireToken();
    }

    // Build register payload — metadata only, exclude execute functions
    const skillsMeta = options.skills.map(({ name, schema, promptInjection, executionMode }) => ({
      name,
      schema,
      prompt_injection: promptInjection ?? null,
      execution_mode: executionMode,
    }));

    const response = await fetch(`${this._apiBase}/api/sdk/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._accessToken}`,
      },
      body: JSON.stringify({
        skills: skillsMeta,
        protocol_version: this._protocolVersion,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      const message = body.detail ?? body.message ?? response.statusText;
      throw new Error(`Register failed (${response.status}): ${message}`);
    }

    const data = await response.json();
    this._channelId = data.channel_id;
  }

  /**
   * Send a user prompt to the agent and return an EventEmitter that streams AG-UI events.
   *
   * POSTs to /api/agent/run, parses the SSE response stream, and emits:
   * - Typed events (event name = event type, e.g. 'RunStarted', 'TextMessageDelta')
   * - Generic 'event' for every parsed event
   * - 'done' when RunFinished is received
   * - 'error' on Error events or fetch/parse failures
   */
  run(options: RunOptions): EventEmitter {
    const emitter = new EventEmitter();
    this._disconnected = false;

    this._startSSEStream(options, emitter, 0, false);

    return emitter;
  }

  /** Internal: performs the POST, reads the SSE stream, and drives the emitter. */
  private async _startSSEStream(options: RunOptions, emitter: EventEmitter, retryCount: number, _isRetryAfterRefresh: boolean = false): Promise<void> {
    if (this._disconnected) return;

    try {
      const body: Record<string, unknown> = {
        user_input: options.userInput,
        context: options.context ?? {},
      };
      if (options.sessionId !== undefined) body.session_id = options.sessionId;
      if (options.toolResult !== undefined) body.tool_result = options.toolResult;

      const response = await fetch(`${this._apiBase}/api/agent/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._accessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const status = response.status;
        const errBody = await response.json().catch(() => ({ detail: response.statusText }));
        const message = errBody.detail ?? errBody.message ?? response.statusText;
        const error = new Error(`Run failed (${status}): ${message}`);

        // 401: attempt token refresh once
        if (status === 401 && !_isRetryAfterRefresh) {
          try {
            await this._acquireToken();
          } catch (refreshErr) {
            emitter.emit('error', refreshErr instanceof Error ? refreshErr : new Error(String(refreshErr)));
            return;
          }
          // Retry with new token
          await this._startSSEStream(options, emitter, retryCount, true);
          return;
        }

        // 4xx errors: no reconnect, emit error immediately
        if (status >= 400 && status < 500) {
          emitter.emit('error', error);
          return;
        }

        // Non-4xx errors: attempt reconnect
        if (retryCount < this._maxRetries && !this._disconnected) {
          this._scheduleReconnect(options, emitter, retryCount);
          return;
        }

        emitter.emit('error', error);
        return;
      }

      if (!response.body) {
        emitter.emit('error', new Error('Response body is empty'));
        return;
      }

      await this._parseSSEStream(response.body, emitter, options, retryCount);
    } catch (err) {
      if (this._disconnected) return;

      const error = err instanceof Error ? err : new Error(String(err));

      // Network errors are non-4xx — attempt reconnect
      if (retryCount < this._maxRetries && !this._disconnected) {
        this._scheduleReconnect(options, emitter, retryCount);
        return;
      }

      emitter.emit('error', error);
    }
  }

  /** Schedule a reconnection attempt after retryDelay. */
  private _scheduleReconnect(options: RunOptions, emitter: EventEmitter, retryCount: number): void {
    if (this._disconnected) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._disconnected) {
        this._startSSEStream(options, emitter, retryCount + 1);
      }
    }, this._retryDelay);
  }

  /** Reset the heartbeat timer. Call whenever an SSE event is received. */
  private _resetHeartbeat(options: RunOptions, emitter: EventEmitter, retryCount: number): void {
    this._clearHeartbeat();
    if (this._disconnected) return;
    this._heartbeatTimer = setTimeout(() => {
      this._heartbeatTimer = null;
      if (this._disconnected) return;

      // Heartbeat timeout — treat connection as dead
      // Cancel the active reader
      if (this._activeReader) {
        try { this._activeReader.cancel(); } catch { /* ignore */ }
        this._activeReader = null;
      }

      // Attempt reconnect if retries remain
      if (retryCount < this._maxRetries) {
        this._scheduleReconnect(options, emitter, retryCount);
      } else {
        emitter.emit('error', new Error('Heartbeat timeout: no events received'));
      }
    }, this._heartbeatTimeout);
  }

  /** Clear the heartbeat timer. */
  private _clearHeartbeat(): void {
    if (this._heartbeatTimer !== null) {
      clearTimeout(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  /** Internal: reads a ReadableStream, parses SSE `data:` lines, and emits events. */
  private async _parseSSEStream(
    body: ReadableStream<Uint8Array>,
    emitter: EventEmitter,
    options: RunOptions,
    retryCount: number,
  ): Promise<void> {
    const reader = body.getReader();
    this._activeReader = reader;
    const decoder = new TextDecoder();
    let buffer = '';

    // Start heartbeat monitoring
    this._resetHeartbeat(options, emitter, retryCount);

    try {
      while (true) {
        if (this._disconnected) break;

        const { done, value } = await reader.read();
        if (done) {
          // Stream ended unexpectedly (not via RunFinished) — attempt reconnect
          this._clearHeartbeat();
          if (!this._disconnected && retryCount < this._maxRetries) {
            this._scheduleReconnect(options, emitter, retryCount);
            return;
          }
          break;
        }

        // Reset heartbeat on any data received
        this._resetHeartbeat(options, emitter, retryCount);

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const parts = buffer.split('\n\n');
        // Keep the last (possibly incomplete) chunk in the buffer
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (this._disconnected) return;

          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6); // strip "data: "
            let event: AGUIEvent;
            try {
              event = JSON.parse(jsonStr);
            } catch {
              continue; // skip malformed JSON
            }

            // Track session_id from RunStarted events
            if (event.type === 'RunStarted' && event.payload?.session_id) {
              this._sessionId = event.payload.session_id as string;
            }

            // Silently ignore unknown event types (Req 13.4)
            if (!KNOWN_EVENT_TYPES.has(event.type)) {
              continue;
            }

            // Emit typed event (event name = event type)
            emitter.emit(event.type, event);
            // Emit generic 'event' for all events
            emitter.emit('event', event);

            // Handle terminal events
            if (event.type === 'RunFinished') {
              this._clearHeartbeat();
              this._activeReader = null;
              emitter.emit('done', event);
              return; // Normal completion — no reconnect
            }
            if (event.type === 'Error') {
              this._clearHeartbeat();
              this._activeReader = null;
              emitter.emit('error', event);
              return; // Error event — close connection, no reconnect
            }

            // Auto-dispatch SkillExecuteInstruction
            if (event.type === 'SkillExecuteInstruction') {
              const skillName = event.payload.skill_name as string;
              const params = (event.payload.params ?? {}) as Record<string, unknown>;
              const toolCallId = event.payload.tool_call_id as string;

              const skill = this._skills.get(skillName);
              let toolResult: Record<string, unknown>;

              if (skill) {
                try {
                  const result = await skill.execute(params);
                  toolResult = { tool_call_id: toolCallId, result };
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  toolResult = { tool_call_id: toolCallId, result: { error: message } };
                }
              } else {
                toolResult = {
                  tool_call_id: toolCallId,
                  result: { error: `Skill '${skillName}' not registered locally` },
                };
              }

              // Emit ToolCallEnd so the UI can mark the step as complete immediately
              const toolCallEndEvent: AGUIEvent = {
                type: 'ToolCallEnd',
                payload: {
                  tool_call_id: toolCallId,
                  tool_name: skillName,
                  result: toolResult.result as Record<string, unknown>,
                },
                protocol_version: event.protocol_version,
                timestamp: new Date().toISOString(),
              };
              emitter.emit('ToolCallEnd', toolCallEndEvent);
              emitter.emit('event', toolCallEndEvent);

              // Release the current reader before starting the follow-up request
              this._clearHeartbeat();
              this._activeReader = null;
              reader.releaseLock();

              // Pipe the follow-up run's events to the same emitter
              await this._startSSEStream(
                {
                  userInput: '',
                  sessionId: this._sessionId ?? undefined,
                  toolResult,
                },
                emitter,
                0, // Reset retry count for follow-up requests
              );
              return;
            }
          }
        }
      }
    } catch (err) {
      this._clearHeartbeat();
      if (this._disconnected) return;

      // Stream read error — attempt reconnect
      if (retryCount < this._maxRetries && !this._disconnected) {
        this._scheduleReconnect(options, emitter, retryCount);
        return;
      }

      emitter.emit('error', err instanceof Error ? err : new Error(String(err)));
    } finally {
      this._activeReader = null;
      reader.releaseLock();
    }
  }

  /**
   * Register a local skill execute handler without sending it to the backend.
   * Use this for platform builtin skills (e.g. wait_skill, dialog_skill, http_skill)
   * whose schemas are provided by the backend but whose execution happens on the SDK side.
   */
  registerLocalSkill(name: string, execute: (params: Record<string, unknown>) => Promise<Record<string, unknown>>): void {
    this._skills.set(name, {
      name,
      schema: {},
      executionMode: 'sdk',
      execute,
    });
  }

  /**
   * Disconnect from the backend, close any active SSE connections,
   * and cancel pending reconnection attempts.
   */
  disconnect(): void {
    this._disconnected = true;

    // Cancel pending reconnection timer
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }

    // Clear heartbeat timer
    this._clearHeartbeat();

    // Cancel active SSE reader
    if (this._activeReader) {
      try { this._activeReader.cancel(); } catch { /* ignore */ }
      this._activeReader = null;
    }
  }

  /** SDK package version (semver). */
  get version(): string {
    return SDK_VERSION;
  }

  /** Channel ID returned by the backend after registration, or null if not yet initialized. */
  get channelId(): string | null {
    return this._channelId;
  }

  /** Current session ID, or null if no session is active. */
  get sessionId(): string | null {
    return this._sessionId;
  }
}
