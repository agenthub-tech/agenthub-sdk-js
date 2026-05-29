// AgentHub JS SDK - Main entry point
// 
// This SDK provides three levels of abstraction:
// 1. Core SDK (headless) - Full control, no UI
// 2. UI Components - React/Vue components for custom UI (import from 'agenthub-sdk/react')
// 3. Complete Widget - One-line integration
// Core SDK - headless (no React dependency)
export { AgentHubSDK, WebAASDK } from './core/sdk';
export * from './core/types';
// React components are NOT exported from main entry to avoid bundling React
// Import from 'agenthub-sdk/react' if you need them
//# sourceMappingURL=index.js.map