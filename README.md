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

## Notes

- `channelKey` is required.
- `apiBase` is required unless your app and Agent Hub API are same-origin.
- SDK-side skills must use `executionMode: 'sdk'`.

## Delegated SDK Skills

Register exported skills with `exposedForDelegation: true`, then use `claimDelegations()` and `completeDelegation()` from a long-running SDK process.

```ts
const tasks = await sdk.claimDelegations(1)
for (const task of tasks) {
  const result = await executeLocally(task.targetSkill, task.params)
  await sdk.completeDelegation(task.delegationRunId, { result })
}
```
- `SkillExecuteInstruction` is auto-dispatched and auto-resumed by the SDK.
