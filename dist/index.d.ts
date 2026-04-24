/** Lightweight event emitter interface exposed in public API (avoids @types/node dependency). */
export interface SDKEventEmitter {
    on(event: string, handler: (...args: any[]) => void): this;
    off(event: string, handler: (...args: any[]) => void): this;
    once(event: string, handler: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
    removeAllListeners(event?: string): this;
}
export interface SkillCachePolicy {
    enabled: boolean;
    ttl: number;
    mode: 'snapshot' | 'append' | 'none';
    invalidateOn?: string[];
}
export type CacheFreshness = 'fresh' | 'stale' | 'expired';
export interface SkillDefinition {
    name: string;
    schema: Record<string, unknown>;
    promptInjection?: string;
    executionMode: 'sdk' | 'backend';
    execute: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
    cache?: SkillCachePolicy;
    resultCacheFields?: Array<{
        path: string;
        ttl?: number;
    }>;
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
    maxRetries?: number;
    retryDelay?: number;
    heartbeatTimeout?: number;
    debug?: boolean;
}
export interface RunOptions {
    userInput: string;
    context?: Record<string, unknown>;
    threadId?: string;
    runId?: string;
    toolResult?: Record<string, unknown>;
    files?: File[];
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
export declare class WebAASDK {
    private _channelId;
    private _channelKey;
    private _accessToken;
    private _runId;
    private _threadId;
    private _userId;
    private _skills;
    private _localSkills;
    private _apiBase;
    private _protocolVersion;
    private _channelConfig;
    private _debug;
    private _maxRetries;
    private _retryDelay;
    private _heartbeatTimeout;
    private _disconnected;
    private _activeReader;
    private _reconnectTimer;
    private _heartbeatTimer;
    private _onIdentifyCallbacks;
    private _onResetCallbacks;
    private _skillCache;
    private _invalidateListeners;
    private _log;
    /**
     * Acquire an access token by exchanging the channel_key at POST /api/auth/token.
     */
    private _acquireToken;
    /**
     * Fetch channel configuration from GET /api/config.
     * Returns null on failure (non-critical, caller should use defaults).
     */
    private _fetchChannelConfig;
    /**
     * Initialize the SDK:
     * 1. Acquire access token
     * 2. Fetch channel config
     * 3. Register skills with backend
     */
    init(options: InitOptions): Promise<void>;
    /**
     * Send a user prompt to the agent and return an EventEmitter that streams AG-UI events.
     */
    run(options: RunOptions): SDKEventEmitter;
    /** Internal: performs the POST, reads the SSE stream, and drives the emitter. */
    private _startSSEStream;
    private _scheduleReconnect;
    private _resetHeartbeat;
    private _clearHeartbeat;
    private _parseSSEStream;
    /**
     * Identify the current end user. Can be called during init or later.
     */
    identify(user: UserIdentity): Promise<void>;
    /**
     * Register a callback to run after identify() succeeds.
     */
    onIdentify(callback: () => void): void;
    /**
     * Create a new thread for the current user.
     */
    createThread(title?: string): Promise<{
        id: string;
    }>;
    /**
     * Start a new conversation thread, resetting current run/thread state.
     * If user is identified, creates a server-side thread.
     * Returns the new thread id (or null if no user identified).
     */
    newThread(): Promise<string | null>;
    /**
     * Switch to an existing thread by id, loading its message history.
     * Returns the thread data including messages array.
     */
    switchThread(threadId: string): Promise<Record<string, unknown>>;
    /**
     * List threads for the current user.
     * Returns empty array if user is not identified.
     */
    listThreads(limit?: number, offset?: number): Promise<Array<Record<string, unknown>>>;
    /**
     * Register a local skill execute handler without sending it to the backend.
     */
    registerLocalSkill(name: string, execute: (params: Record<string, unknown>) => Promise<Record<string, unknown>>): void;
    /**
     * Disconnect from the backend, close any active SSE connections.
     */
    disconnect(): void;
    /**
     * Reset user state (logout). Disconnects, clears userId/threadId/runId.
     * Fires onReset callbacks so upper layers can clean up UI.
     */
    reset(): void;
    /**
     * Register a callback to run when reset() is called (user logout).
     */
    onReset(callback: () => void): void;
    /**
     * Update cache after a skill execution. Called automatically by _parseSSEStream.
     */
    private _cacheSkillResult;
    /**
     * Build the skill_cache object to inject into run context.
     * Only includes fresh/stale entries (expired are excluded).
     */
    private _buildCacheContext;
    /**
     * Check TTL and update freshness for all cached entries.
     */
    private _refreshCacheFreshness;
    /**
     * Invalidate cache entries by event name (e.g. 'urlchange', 'dom:mutation:10').
     */
    invalidateCache(eventName: string): void;
    /**
     * Clear all cache entries (called on reset/newThread).
     */
    private _clearCache;
    get version(): string;
    get channelId(): string | null;
    get runId(): string | null;
    get threadId(): string | null;
    get userId(): string | null;
    get accessToken(): string | null;
    get apiBase(): string;
    get channelConfig(): ChannelConfig | null;
}
//# sourceMappingURL=index.d.ts.map