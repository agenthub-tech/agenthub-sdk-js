// AgentHub JS SDK - Main entry point
// 
// This SDK provides three levels of abstraction:
// 1. Core SDK (headless) - Full control, no UI
// 2. UI Components - React/Vue components for custom UI
// 3. Complete Widget - One-line integration

// Core SDK - headless
export { WebAASDK } from './core/sdk';
export * from './core/types';

// React components (lazy-loaded to avoid bundling React for non-React users)
export * from './react';
