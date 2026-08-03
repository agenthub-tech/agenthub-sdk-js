// Core SDK class - headless AG-UI protocol client

import { EventEmitter } from 'events';
import {
  SDK_VERSION,
  DEFAULT_PROTOCOL_VERSION,
  type SDKEventEmitter,
  type SkillCachePolicy,
  type CacheFreshness,
  type SkillDefinition,
  type UserIdentity,
  type InitOptions,
  type RunOptions,
  type AGUIEvent,
  type ChannelConfig,
  type ChartSkillResult,
  type ChartType,
  type EChartsOption,
  type DialogParams,
  type DialogResult,
  type Message,
  type ChatWidgetConfig,
} from './types';

// Known AG-UI event types
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class WebAASDK {
  private _channelId: string | null = null;
  private _channelKey: string = '';
  private _accessToken: string | null = null;
  private _runId: string | null = null;
  private _threadId: string | null = null;
  private _userId: string | null = null;
  private _skills: Map<string, SkillDefinition> = new Map();
  private _localSkills: Map<string, (params: Record<string, unknown>) => Promise<Record<string, unknown>>> = new Map();
  private _apiBase: string = '';
  private _protocolVersion: string = DEFAULT_PROTOCOL_VERSION;
  private _channelConfig: ChannelConfig | null = null;
  private _debug: boolean = false;

  // Connection lifecycle configuration
  private _maxRetries: number = 3;
  private _retryDelay: number = 1000;
  private _heartbeatTimeout: number = 45000;

  // Connection lifecycle state
  private _disconnected: boolean = false;
  private _activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private _onIdentifyCallbacks: Array<() => void> = [];
  private _onResetCallbacks: Array<() => void> = [];

  // L1 SDK Auto Cache
  private _skillCache: Map<string, {
    result: Record<string, unknown>;
    freshness: CacheFreshness;
    timestamp: number;
    policy: SkillCachePolicy;
  }> = new Map();

  // Dialog handler
  private _dialogHandler: ((params: DialogParams) => Promise<DialogResult>) | null = null;

  // ── Debug Logging ──

  private _log(format: string, ...args: unknown[]): void {
    if (!this._debug) return;
    const msg = args.length > 0
      ? format.replace(/%[sd]/g, () => String(args.shift()))
      : format;
    console.log(`[WebAA SDK] ${msg}`);
  }

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

  private async _readErrorMessage(response: Response): Promise<string> {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    return body.detail ?? body.message ?? response.statusText;
  }

  private async _fetchWithAuthRetry(
    input: string,
    init: RequestInit = {},
    isRetryAfterRefresh = false,
  ): Promise<Response> {
    if (!this._accessToken) {
      throw new Error('SDK not initialized');
    }

    const headers = new Headers(init.headers ?? {});
    headers.set('Authorization', `Bearer ${this._accessToken}`);

    const response = await fetch(input, {
      ...init,
      headers,
    });

    if (response.status === 401 && !isRetryAfterRefresh) {
      await this._acquireToken();
      return this._fetchWithAuthRetry(input, init, true);
    }

    return response;
  }

  /**
   * Fetch channel configuration from GET /api/config.
   */
  private async _fetchChannelConfig(): Promise<ChannelConfig | null> {
    try {
      const response = await this._fetchWithAuthRetry(`${this._apiBase}/api/config`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Initialize the SDK.
   */
  async init(options: InitOptions): Promise<void> {
    this._apiBase = options.apiBase ?? '';
    this._channelKey = options.channelKey;
    this._protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;
    this._maxRetries = options.maxRetries ?? 3;
    this._retryDelay = options.retryDelay ?? 1000;
    this._heartbeatTimeout = options.heartbeatTimeout ?? 45000;
    this._debug = options.debug ?? false;
    this._disconnected = false;

    this._log('init start | apiBase=%s channelKey=%s', this._apiBase, this._channelKey);

    const skills = options.skills ?? [];
    for (const skill of skills) {
      this._skills.set(skill.name, skill);
    }

    // 1. Acquire access token
    await this._acquireToken();
    this._log('token acquired');

    // 2. Fetch channel config
    this._channelConfig = await this._fetchChannelConfig();
    this._log('config fetched');

    // 3. Register skills with backend
    if (skills.length > 0) {
      const skillsMeta = skills.map(({ name, schema, promptInjection, executionMode, resultCacheFields, nonSummaryResultFields }) => ({
        name,
        schema,
        prompt_injection: promptInjection ?? null,
        execution_mode: executionMode,
        ...(resultCacheFields ? { result_cache_fields: resultCacheFields } : {}),
        ...(nonSummaryResultFields ? { non_summary_result_fields: nonSummaryResultFields } : {}),
      }));

      const response = await this._fetchWithAuthRetry(`${this._apiBase}/api/sdk/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          skills: skillsMeta,
          protocol_version: this._protocolVersion,
        }),
      });

      if (!response.ok) {
        const message = await this._readErrorMessage(response);
        throw new Error(`Register failed (${response.status}): ${message}`);
      }

      const data = await response.json();
      this._channelId = data.channel_id;
      this._log('skills registered | count=%s channelId=%s', skills.length, this._channelId);
    }

    // 4. Identify user if provided
    if (options.user) {
      await this.identify(options.user);
      this._log('user identified | userId=%s', options.user.userId);
    }

    // 5. Register built-in dialog_skill handler
    this._registerBuiltinSkillHandlers();

    this._log('init complete');
  }

  /**
   * Send a user prompt to the agent and return an EventEmitter that streams AG-UI events.
   */
  run(options: RunOptions): SDKEventEmitter {
    const emitter = new EventEmitter();
    this._disconnected = false;

    if (options.runId) {
      this._runId = options.runId;
    }
    if (options.threadId) {
      this._threadId = options.threadId;
    }

    this._log('run | userInput="%s"', (options.userInput ?? '').slice(0, 80));

    this._startSSEStream(options, emitter, 0, false);
    return emitter;
  }

  private async _startSSEStream(options: RunOptions, emitter: EventEmitter, retryCount: number, _isRetryAfterRefresh: boolean = false): Promise<void> {
    if (this._disconnected) return;

    this._log('sse-connect | retry=%s/%s', retryCount, this._maxRetries);

    try {
      const body: Record<string, unknown> = {
        user_input: options.userInput,
        context: options.context ?? {},
      };
      const cacheCtx = this._buildCacheContext();
      if (cacheCtx) {
        (body.context as Record<string, unknown>).skill_cache = cacheCtx;
      }
      if (options.runId !== undefined) body.run_id = options.runId;
      if (options.toolResult !== undefined) body.tool_result = options.toolResult;
      if (options.reasoning !== undefined) body.reasoning = options.reasoning;
      if (options.webSearchEnabled !== undefined) body.web_search_enabled = options.webSearchEnabled;
      if (this._userId) body.user_id = this._userId;
      if (options.threadId !== undefined) {
        body.thread_id = options.threadId;
      } else if (this._threadId) {
        body.thread_id = this._threadId;
      }

      const hasFiles = options.files && options.files.length > 0;
      let response: Response;

      if (hasFiles) {
        const formData = new FormData();
        formData.append('user_input', options.userInput);
        formData.append('context', JSON.stringify(body.context));
        if (body.run_id !== undefined) formData.append('run_id', String(body.run_id));
        if (body.user_id !== undefined) formData.append('user_id', String(body.user_id));
        if (body.thread_id !== undefined) formData.append('thread_id', String(body.thread_id));
        if (body.reasoning !== undefined) formData.append('reasoning', JSON.stringify(body.reasoning));
        if (body.web_search_enabled !== undefined) formData.append('web_search_enabled', String(body.web_search_enabled));
        for (const file of options.files!) {
          formData.append('files', file);
        }
        response = await fetch(`${this._apiBase}/api/agent/run`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this._accessToken}` },
          body: formData,
        });
      } else {
        response = await fetch(`${this._apiBase}/api/agent/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this._accessToken}`,
          },
          body: JSON.stringify(body),
        });
      }

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
    let receivedFinish = false;

    this._resetHeartbeat(options, emitter, retryCount);

    try {
      while (true) {
        if (this._disconnected) break;

        const { done, value } = await reader.read();
        if (done) {
          this._clearHeartbeat();
          if (!receivedFinish && !this._disconnected && retryCount < this._maxRetries) {
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
              this._log('event RunStarted | runId=%s threadId=%s', this._runId, this._threadId);
            }

            if (!KNOWN_EVENT_TYPES.has(event.type)) continue;

            emitter.emit(event.type, event);
            emitter.emit('event', event);

            if (event.type === 'RunFinished') {
              this._log('event RunFinished');
              receivedFinish = true;
              this._clearHeartbeat();
              this._activeReader = null;
              emitter.emit('done', event);
              return;
            }
            if (event.type === 'Error') {
              this._log('event Error | %s', event.payload?.message);
              receivedFinish = true;
              this._clearHeartbeat();
              this._activeReader = null;
              emitter.emit('error', event);
              return;
            }

            if (event.type === 'SkillExecuteInstruction') {
              const skillName = event.payload.skill_name as string;
              const params = (event.payload.params ?? {}) as Record<string, unknown>;
              const toolCallId = event.payload.tool_call_id as string;

              this._log('event SkillExecuteInstruction | skill=%s toolCallId=%s', skillName, toolCallId);

              const initSkill = this._skills.get(skillName);
              const localExecute = this._localSkills.get(skillName);
              const executeFunc = initSkill?.execute ?? localExecute;
              let toolResult: Record<string, unknown>;

              if (executeFunc) {
                try {
                  this._log('skill-exec | skill=%s', skillName);
                  const result = await executeFunc(params);
                  toolResult = { tool_call_id: toolCallId, result };
                  this._log('skill-exec ok | skill=%s', skillName);
                  this._cacheSkillResult(skillName, result);
                } catch (err) {
                  const message = err instanceof Error ? err.message : String(err);
                  this._log('skill-exec error | skill=%s error=%s', skillName, message);
                  toolResult = { tool_call_id: toolCallId, result: { error: message } };
                }
              } else {
                this._log('skill-exec miss | skill=%s not registered', skillName);
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

              try {
                await this._acquireToken();
                this._log('token refreshed before resume');
              } catch (e) {
                this._log('token refresh failed before resume: %s', e instanceof Error ? e.message : String(e));
              }

              await this._startSSEStream(
                {
                  userInput: '',
                  runId: this._runId ?? undefined,
                  toolResult,
                  reasoning: options.reasoning,
                  webSearchEnabled: options.webSearchEnabled,
                },
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
   * Identify the current end user.
   */
  async identify(user: UserIdentity): Promise<void> {
    this._userId = user.userId;
    if (!this._accessToken) return;

    const response = await this._fetchWithAuthRetry(`${this._apiBase}/api/sdk/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: user.userId,
        name: user.name ?? null,
        avatar: user.avatar ?? null,
        metadata: user.metadata ?? {},
      }),
    });

    if (!response.ok) {
      const message = await this._readErrorMessage(response);
      throw new Error(`Identify failed (${response.status}): ${message}`);
    }

    for (const cb of this._onIdentifyCallbacks) {
      try { cb(); } catch { /* ignore */ }
    }
  }

  onIdentify(callback: () => void): void {
    this._onIdentifyCallbacks.push(callback);
  }

  async createThread(title?: string): Promise<{ id: string }> {
    if (!this._userId) throw new Error('Call identify() before creating threads');
    if (!this._accessToken) throw new Error('SDK not initialized');

    const response = await this._fetchWithAuthRetry(`${this._apiBase}/api/sdk/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: this._userId, title: title ?? null }),
    });

    if (!response.ok) {
      const message = await this._readErrorMessage(response);
      throw new Error(`Create thread failed: ${message}`);
    }

    const data = await response.json();
    this._threadId = data.id;
    return data;
  }

  async newThread(): Promise<string | null> {
    this.disconnect();
    this._runId = null;
    this._threadId = null;
    this._disconnected = false;
    this._clearCache();

    if (this._userId && this._accessToken) {
      const thread = await this.createThread();
      return thread.id;
    }
    return null;
  }

  async switchThread(threadId: string): Promise<Record<string, unknown>> {
    if (!this._accessToken) throw new Error('SDK not initialized');

    this.disconnect();
    this._runId = null;
    this._threadId = threadId;

    const response = await this._fetchWithAuthRetry(`${this._apiBase}/api/sdk/threads/${encodeURIComponent(threadId)}`);

    if (!response.ok) {
      const message = await this._readErrorMessage(response);
      throw new Error(`Switch thread failed: ${message}`);
    }

    return response.json();
  }

  async listThreads(limit = 20, offset = 0): Promise<Array<Record<string, unknown>>> {
    if (!this._userId || !this._accessToken) return [];

    const params = new URLSearchParams({
      user_id: this._userId,
      limit: String(limit),
      offset: String(offset),
    });

    const response = await this._fetchWithAuthRetry(`${this._apiBase}/api/sdk/threads?${params}`);

    if (!response.ok) return [];
    return response.json();
  }

  /**
   * Register a local skill execute handler.
   */
  registerLocalSkill(name: string, execute: (params: Record<string, unknown>) => Promise<Record<string, unknown>>): void {
    this._localSkills.set(name, execute);
  }

  /**
   * Set custom dialog handler for dialog_skill.
   */
  setDialogHandler(handler: (params: DialogParams) => Promise<DialogResult>): void {
    this._dialogHandler = handler;
  }

  /**
   * Disconnect from the backend.
   */
  disconnect(): void {
    this._log('disconnect');
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

  /**
   * Reset user state (logout).
   */
  reset(): void {
    this._log('reset');
    this.disconnect();
    this._userId = null;
    this._runId = null;
    this._threadId = null;
    this._disconnected = false;
    this._clearCache();
    for (const cb of this._onResetCallbacks) {
      try { cb(); } catch { /* ignore */ }
    }
  }

  onReset(callback: () => void): void {
    this._onResetCallbacks.push(callback);
  }

  // ── Built-in Skill Handlers ─────────────────────────────────────────────────

  private _registerBuiltinSkillHandlers(): void {
    // dialog_skill is SDK-executed
    this.registerLocalSkill('dialog_skill', async (params) => {
      const dialogParams = params as unknown as DialogParams;

      // Use custom handler if provided
      if (this._dialogHandler) {
        return this._dialogHandler(dialogParams) as unknown as Record<string, unknown>;
      }

      // Fallback to browser native
      return this._defaultDialogHandler(dialogParams);
    });
  }

  private async _defaultDialogHandler(params: DialogParams): Promise<Record<string, unknown>> {
    const action = params.action;
    const msg = params.message;

    if (action === 'confirm') {
      const confirmed = typeof window !== 'undefined' && window.confirm ? window.confirm(msg) : false;
      return { action: 'confirm', message: msg, confirmed };
    } else if (action === 'input') {
      const placeholder = params.placeholder ?? '';
      const inputType = params.input_type ?? 'text';
      const value = typeof window !== 'undefined' && window.prompt
        ? (window.prompt(msg + (placeholder ? ` (${placeholder})` : '')) ?? '')
        : '';
      return { action: 'input', message: msg, value };
    } else if (action === 'notify') {
      // Notify is handled by UI, just return success
      return { action: 'notify', message: msg, success: true };
    } else if (action === 'error') {
      // Error is handled by UI, just return
      return { action: 'error', message: msg, error_shown: true };
    }

    return { success: false, error: `Unknown action: ${action}` };
  }

  // ── L1 SDK Auto Cache ───────────────────────────────────────────────────────

  private _cacheSkillResult(skillName: string, result: Record<string, unknown>): void {
    const skill = this._skills.get(skillName);
    if (!skill?.cache?.enabled) return;

    const policy = skill.cache;
    const existing = this._skillCache.get(skillName);

    if (policy.mode === 'snapshot') {
      this._skillCache.set(skillName, {
        result, freshness: 'fresh', timestamp: Date.now(), policy,
      });
    } else if (policy.mode === 'append' && existing) {
      const merged = Array.isArray(existing.result) && Array.isArray(result)
        ? [...existing.result, ...result]
        : { ...existing.result, ...result };
      this._skillCache.set(skillName, {
        result: merged as Record<string, unknown>, freshness: 'fresh', timestamp: Date.now(), policy,
      });
    } else if (policy.mode === 'append') {
      this._skillCache.set(skillName, {
        result, freshness: 'fresh', timestamp: Date.now(), policy,
      });
    }
  }

  private _buildCacheContext(): Record<string, { result: Record<string, unknown>; freshness: CacheFreshness }> | null {
    this._refreshCacheFreshness();
    const entries: Record<string, { result: Record<string, unknown>; freshness: CacheFreshness }> = {};
    let hasEntries = false;

    for (const [name, entry] of this._skillCache) {
      if (entry.freshness === 'expired') continue;
      entries[name] = { result: entry.result, freshness: entry.freshness };
      hasEntries = true;
    }

    return hasEntries ? entries : null;
  }

  private _refreshCacheFreshness(): void {
    const now = Date.now();
    for (const entry of this._skillCache.values()) {
      if (entry.freshness === 'expired') continue;
      if (entry.policy.ttl > 0 && (now - entry.timestamp) > entry.policy.ttl) {
        entry.freshness = 'expired';
      }
    }
  }

  invalidateCache(eventName: string): void {
    for (const entry of this._skillCache.values()) {
      if (entry.freshness === 'expired') continue;
      if (entry.policy.invalidateOn?.includes(eventName)) {
        entry.freshness = 'stale';
      }
    }
  }

  private _clearCache(): void {
    this._skillCache.clear();
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

/**
 * Preferred public SDK name. Kept as a thin subclass for backward compatibility
 * with existing WebAASDK integrations.
 */
export class AgentHubSDK extends WebAASDK {}
