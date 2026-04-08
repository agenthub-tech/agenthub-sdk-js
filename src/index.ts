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

export interface UserIdentity {
  userId: string;
  name?: string;
  avatar?: string;
  metadata?: Record<string, unknown>;
}

export interface InitOptions {
  channelKey: string;
  skills?: SkillDefinition[];
  user?: UserIdentity;
  apiBase?: string;
  protocolVersion?: string;
  maxRetries?: number;        // default 3
  retryDelay?: number;        // default 1000 (ms)
  heartbeatTimeout?: number;  // default 45000 (ms)
}

export interface RunOptions {
  userInput: string;
  context?: Record<string, unknown>;
  threadId?: string;
  runId?: string;
  toolResult?: Record<string, unknown>;
}

export interface AGUIEvent {
  type: string;
  payload: Record<string, unknown>;
  protocol_version: string;
  timestamp: string;
}

export interface ChannelConfig {
  channel_id?: string;
  name?: string;
  permission_scope?: Record<string, unknown>;
  ui_theme?: Record<string, unknown>;
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
  private _runId: string | null = null;
  private _threadId: string | null = null;
  private _userId: string | null = null;
  private _skills: Map<string, SkillDefinition> = new Map();
  private _apiBase: string = '';
  private _protocolVersion: string = DEFAULT_PROTOCOL_VERSION;
  private _channelConfig: ChannelConfig | null = null;

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
   * Fetch channel configuration from GET /api/config.
   * Returns null on failure (non-critical, caller should use defaults).
   */
  private async _fetchChannelConfig(): Promise<ChannelConfig | null> {
    try {
      const response = await fetch(`${this._apiBase}/api/config`, {
        headers: { 'Authorization': `Bearer ${this._accessToken}` },
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Initialize the SDK:
   * 1. Acquire access token
   * 2. Fetch channel config
   * 3. Register skills with backend
   */
  async init(options: InitOptions): Promise<void> {
    this._apiBase = options.apiBase ?? '';
    this._channelKey = options.channelKey;
    this._protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
    this._maxRetries = options.maxRetries ?? 3;
    this._retryDelay = options.retryDelay ?? 1000;
    this._heartbeatTimeout = options.heartbeatTimeout ?? 45000;
    this._disconnected = false;

    const skills = options.skills ?? [];
    for (const skill of skills) {
      this._skills.set(skill.name, skill);
    }

    // 1. Acquire access token
    await this._acquireToken();

    // 2. Fetch channel config (non-critical)
    this._channelConfig = await this._fetchChannelConfig();

    // 3. Register skills with backend
    if (skills.length > 0) {
      const skillsMeta = skills.map(({ name, schema, promptInjection, executionMode }) => ({
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

    // 4. Identify user if provided
    if (options.user) {
      await this.identify(options.user);
    }
  }

  /**
   * Send a user prompt to the agent and return an EventEmitter that streams AG-UI events.
   */
  run(options: RunOptions): EventEmitter {
    const emitter = new EventEmitter();
    this._disconnected = false;

    // Preserve run_id if provided (e.g. cross-page resume)
    if (options.runId) {
      this._runId = options.runId;
    }

    // Preserve thread_id if provided
    if (options.threadId) {
      this._threadId = options.threadId;
    }

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
      if (options.runId !== undefined) body.run_id = options.runId;
      if (options.toolResult !== undefined) body.tool_result = options.toolResult;
      if (this._userId) body.user_id = this._userId;
      if (options.threadId !== undefined) {
        body.thread_id = options.threadId;
      } else if (this._threadId) {
        body.thread_id = this._threadId;
      }

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

        if (status === 401 && !_isRetryAfterRefresh) {
          try { await this._acquireToken(); } catch (refreshErr) {
            emitter.emit('error', refreshErr instanceof Error ? refreshErr : new Error(String(refreshErr)));
            return;
          }
          await this._startSSEStream(options, emitter, retryCount, true);
          return;
        }

        if (status >= 400 && status < 500) {
          emitter.emit('error', error);
          return;
        }

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
      if (retryCount < this._maxRetries && !this._disconnected) {
        this._scheduleReconnect(options, emitter, retryCount);
        return;
      }
      emitter.emit('error', error);
    }
  }

  private _scheduleReconnect(options: RunOptions, emitter: EventEmitter, retryCount: number): void {
    if (this._disconnected) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._disconnected) {
        this._startSSEStream(options, emitter, retryCount + 1);
      }
    }, this._retryDelay);
  }

  private _resetHeartbeat(options: RunOptions, emitter: EventEmitter, retryCount: number): void {
    this._clearHeartbeat();
    if (this._disconnected) return;
    this._heartbeatTimer = setTimeout(() => {
      this._heartbeatTimer = null;
      if (this._disconnected) return;
      if (this._activeReader) {
        try { this._activeReader.cancel(); } catch { /* ignore */ }
        this._activeReader = null;
      }
      if (retryCount < this._maxRetries) {
        this._scheduleReconnect(options, emitter, retryCount);
      } else {
        emitter.emit('error', new Error('Heartbeat timeout: no events received'));
      }
    }, this._heartbeatTimeout);
  }

  private _clearHeartbeat(): void {
    if (this._heartbeatTimer !== null) {
      clearTimeout(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

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

    this._resetHeartbeat(options, emitter, retryCount);

    try {
      while (true) {
        if (this._disconnected) break;

        const { done, value } = await reader.read();
        if (done) {
          this._clearHeartbeat();
          if (!this._disconnected && retryCount < this._maxRetries) {
            this._scheduleReconnect(options, emitter, retryCount);
            return;
          }
          break;
        }

        this._resetHeartbeat(options, emitter, retryCount);
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          if (this._disconnected) return;

          for (const line of part.split('\n')) {
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6);
            let event: AGUIEvent;
            try { event = JSON.parse(jsonStr); } catch { continue; }

            if (event.type === 'RunStarted' && event.payload?.run_id) {
              this._runId = event.payload.run_id as string;
              if (event.payload.thread_id) {
                this._threadId = event.payload.thread_id as string;
              }
            }

            if (!KNOWN_EVENT_TYPES.has(event.type)) continue;

            emitter.emit(event.type, event);
            emitter.emit('event', event);

            if (event.type === 'RunFinished') {
              this._clearHeartbeat();
              this._activeReader = null;
              emitter.emit('done', event);
              return;
            }
            if (event.type === 'Error') {
              this._clearHeartbeat();
              this._activeReader = null;
              emitter.emit('error', event);
              return;
            }

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

              this._clearHeartbeat();
              this._activeReader = null;
              reader.releaseLock();

              await this._startSSEStream(
                { userInput: '', runId: this._runId ?? undefined, toolResult },
                emitter, 0,
              );
              return;
            }
          }
        }
      }
    } catch (err) {
      this._clearHeartbeat();
      if (this._disconnected) return;
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
   * Identify the current end user. Can be called during init or later.
   */
  async identify(user: UserIdentity): Promise<void> {
    this._userId = user.userId;
    if (!this._accessToken) return;

    const response = await fetch(`${this._apiBase}/api/sdk/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._accessToken}`,
      },
      body: JSON.stringify({
        user_id: user.userId,
        name: user.name ?? null,
        avatar: user.avatar ?? null,
        metadata: user.metadata ?? {},
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(`Identify failed (${response.status}): ${body.detail ?? response.statusText}`);
    }
  }

  /**
   * Create a new thread for the current user.
   */
  async createThread(title?: string): Promise<{ id: string }> {
    if (!this._userId) throw new Error('Call identify() before creating threads');
    if (!this._accessToken) throw new Error('SDK not initialized');

    const response = await fetch(`${this._apiBase}/api/sdk/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._accessToken}`,
      },
      body: JSON.stringify({ user_id: this._userId, title: title ?? null }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ detail: response.statusText }));
      throw new Error(`Create thread failed: ${body.detail ?? response.statusText}`);
    }

    const data = await response.json();
    this._threadId = data.id;
    return data;
  }

  /**
   * List threads for the current user.
   */
  async listThreads(limit = 20, offset = 0): Promise<Array<Record<string, unknown>>> {
    if (!this._userId) throw new Error('Call identify() before listing threads');
    if (!this._accessToken) throw new Error('SDK not initialized');

    const params = new URLSearchParams({
      user_id: this._userId,
      limit: String(limit),
      offset: String(offset),
    });

    const response = await fetch(`${this._apiBase}/api/sdk/threads?${params}`, {
      headers: { 'Authorization': `Bearer ${this._accessToken}` },
    });

    if (!response.ok) return [];
    return response.json();
  }

  /**
   * Register a local skill execute handler without sending it to the backend.
   */
  registerLocalSkill(name: string, execute: (params: Record<string, unknown>) => Promise<Record<string, unknown>>): void {
    this._skills.set(name, { name, schema: {}, executionMode: 'sdk', execute });
  }

  /**
   * Disconnect from the backend, close any active SSE connections.
   */
  disconnect(): void {
    this._disconnected = true;
    if (this._reconnectTimer !== null) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._clearHeartbeat();
    if (this._activeReader) {
      try { this._activeReader.cancel(); } catch { /* ignore */ }
      this._activeReader = null;
    }
  }

  // ── Public getters ──

  get version(): string { return SDK_VERSION; }
  get channelId(): string | null { return this._channelId; }
  get runId(): string | null { return this._runId; }
  get threadId(): string | null { return this._threadId; }
  get userId(): string | null { return this._userId; }
  get accessToken(): string | null { return this._accessToken; }
  get apiBase(): string { return this._apiBase; }
  get channelConfig(): ChannelConfig | null { return this._channelConfig; }
}
