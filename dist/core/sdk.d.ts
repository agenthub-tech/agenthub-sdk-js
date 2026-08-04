import { type SDKEventEmitter, type UserIdentity, type InitOptions, type RunOptions, type ChannelConfig, type DialogParams, type DialogResult } from './types';
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
    private _runtimeMode;
    private _providerSocket;
    private _providerOptions;
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
    private _dialogHandler;
    private _log;
    /**
     * Acquire an access token by exchanging the channel_key at POST /api/auth/token.
     */
    private _acquireToken;
    private _readErrorMessage;
    private _fetchWithAuthRetry;
    /**
     * Fetch channel configuration from GET /api/config.
     */
    private _fetchChannelConfig;
    /**
     * Initialize the SDK.
     */
    init(options: InitOptions): Promise<void>;
    private _startSkillProvider;
    /**
     * Send a user prompt to the agent and return an EventEmitter that streams AG-UI events.
     */
    run(options: RunOptions): SDKEventEmitter;
    private _startSSEStream;
    private _scheduleReconnect;
    private _resetHeartbeat;
    private _clearHeartbeat;
    private _parseSSEStream;
    /**
     * Identify the current end user.
     */
    identify(user: UserIdentity): Promise<void>;
    onIdentify(callback: () => void): void;
    createThread(title?: string): Promise<{
        id: string;
    }>;
    newThread(): Promise<string | null>;
    switchThread(threadId: string): Promise<Record<string, unknown>>;
    listThreads(limit?: number, offset?: number): Promise<Array<Record<string, unknown>>>;
    /**
     * Register a local skill execute handler.
     */
    registerLocalSkill(name: string, execute: (params: Record<string, unknown>) => Promise<Record<string, unknown>>): void;
    /**
     * Set custom dialog handler for dialog_skill.
     */
    setDialogHandler(handler: (params: DialogParams) => Promise<DialogResult>): void;
    /**
     * Disconnect from the backend.
     */
    disconnect(): void;
    /**
     * Reset user state (logout).
     */
    reset(): void;
    onReset(callback: () => void): void;
    private _registerBuiltinSkillHandlers;
    private _defaultDialogHandler;
    private _cacheSkillResult;
    private _buildCacheContext;
    private _refreshCacheFreshness;
    invalidateCache(eventName: string): void;
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
/**
 * Preferred public SDK name. Kept as a thin subclass for backward compatibility
 * with existing WebAASDK integrations.
 */
export declare class AgentHubSDK extends WebAASDK {
}
//# sourceMappingURL=sdk.d.ts.map