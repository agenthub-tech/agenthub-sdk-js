// Core types - shared across all SDK modules

// ── SDK version ──
export const SDK_VERSION = '1.0.0';
export const DEFAULT_PROTOCOL_VERSION = '1.0.0';

// ── Public API Types ──

/** Lightweight event emitter interface exposed in public API */
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

export interface SkillExecutionContext {
  executionId: string;
  runId: string;
  toolCallId: string;
  reportProgress: (progress: Record<string, unknown>) => Promise<void>;
}

export interface SkillDefinition {
  name: string;
  schema: Record<string, unknown>;
  promptInjection?: string;
  executionMode: 'sdk' | 'backend';
  execute: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  executeWithContext?: (
    params: Record<string, unknown>,
    context: SkillExecutionContext,
  ) => Promise<Record<string, unknown>>;
  cache?: SkillCachePolicy;
  resultCacheFields?: Array<{ path: string; ttl?: number }>;
  nonSummaryResultFields?: string[];
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
  runtimeMode?: 'agent' | 'skill_provider';
  instanceId?: string;
  providerId?: string;
  capacity?: number;
  runtime?: string;
  metadata?: Record<string, unknown>;
}

export interface ReasoningOptions {
  mode?: 'default' | 'on' | 'off';
}

export interface RunOptions {
  userInput: string;
  context?: Record<string, unknown>;
  threadId?: string;
  runId?: string;
  toolResult?: Record<string, unknown>;
  reasoning?: ReasoningOptions;
  webSearchEnabled?: boolean;
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
  web_search_enabled?: boolean;
  ui_theme?: Record<string, unknown>;
}

// ── Chart Types ──

export type ChartType = 'pie' | 'line' | 'bar' | 'bar-horizontal';

export interface EChartsOption {
  title?: Record<string, unknown>;
  tooltip?: Record<string, unknown>;
  grid?: Record<string, unknown>;
  xAxis?: Record<string, unknown>;
  yAxis?: Record<string, unknown>;
  series?: Array<Record<string, unknown>>;
  legend?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Chart skill result from backend */
export interface ChartSkillResult {
  success: boolean;
  chart_type: ChartType;
  echarts_option: EChartsOption;
  available_chart_types: ChartType[];
  echarts_options: Record<ChartType, EChartsOption>;
  data_summary?: {
    row_count: number;
    chart_type: string;
    title?: string;
  };
  error?: string;
}

// ── Dialog Types ──

export interface DialogConfirmParams {
  action: 'confirm';
  message: string;
}

export interface DialogInputParams {
  action: 'input';
  message: string;
  placeholder?: string;
  input_type?: 'text' | 'password';
}

export interface DialogNotifyParams {
  action: 'notify';
  message: string;
}

export interface DialogErrorParams {
  action: 'error';
  message: string;
}

export type DialogParams = DialogConfirmParams | DialogInputParams | DialogNotifyParams | DialogErrorParams;

export interface DialogConfirmResult {
  action: 'confirm';
  message: string;
  confirmed: boolean;
}

export interface DialogInputResult {
  action: 'input';
  message: string;
  value: string;
}

export interface DialogNotifyResult {
  action: 'notify';
  message: string;
  success: true;
}

export interface DialogErrorResult {
  action: 'error';
  message: string;
  error_shown: true;
}

export type DialogResult = DialogConfirmResult | DialogInputResult | DialogNotifyResult | DialogErrorResult;

// ── Message Types ──

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  state: 'streaming' | 'done' | 'error';
  files?: MessageFile[];
  chartData?: ChartSkillResult;
}

export interface MessageFile {
  name: string;
  type: string;
  objectUrl?: string;
}

// ── Widget Types ──

export interface ChatWidgetTheme {
  /** Primary color for buttons and user messages */
  primaryColor?: string;
  /** Font family */
  fontFamily?: string;
  /** Welcome message */
  welcomeMessage?: string;
  /** Placeholder for input */
  placeholder?: string;
  /** User message bubble style */
  userBubbleStyle?: 'rounded' | 'square';
  /** Assistant message bubble style */
  assistantBubbleStyle?: 'rounded' | 'square';
}

export interface ChatWidgetConfig {
  /** Channel key */
  channelKey: string;
  /** API base URL */
  apiBase?: string;
  /** Theme configuration */
  theme?: ChatWidgetTheme;
  /** Debug mode */
  debug?: boolean;
  /** Custom user identity */
  user?: UserIdentity;
  /** Custom dialog handler */
  onDialog?: (params: DialogParams) => Promise<DialogResult>;
  /** Called when SDK is ready */
  onReady?: () => void;
  /** Called on error */
  onError?: (error: Error) => void;
}
