# AgentHub JS SDK

JavaScript/TypeScript SDK for Agent Hub.

## Install

```bash
npm install agenthub-sdk
```

## Quick Start

```ts
import { AgentHubSDK } from 'agenthub-sdk';

const sdk = new AgentHubSDK();

await sdk.init({
  channelKey: 'your-channel-key',
  apiBase: 'https://your-agenthub-server',
});

const emitter = sdk.run({ userInput: '帮我完成任务' });

emitter.on('TextMessageDelta', (event) => {
  console.log(event.payload.delta);
});

emitter.on('done', () => {
  console.log('任务完成');
});
```

## Skill Provider mode

Node and browser runtimes can register a long-running remote Skill Provider:

```ts
await sdk.init({
  channelKey: 'your-channel-key',
  apiBase: 'https://your-agenthub-server',
  runtimeMode: 'skill_provider',
  providerId: 'stable-provider-id',
  skills: [mySkill],
});
```

The default `runtimeMode: 'agent'` remains backward compatible and supports `run()`.

## Notes

- `channelKey` is required.
- `apiBase` is required unless your app and Agent Hub API are same-origin.
- SDK-side skills must use `executionMode: 'sdk'`.

- `SkillExecuteInstruction` is auto-dispatched and auto-resumed by the SDK.
