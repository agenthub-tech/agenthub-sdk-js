# Agenthub JS SDK

Agenthub 平台的 JavaScript/Node.js SDK，基于 AG-UI 协议实现 Agent 通信。

## 安装

```bash
npm install agenthub-sdk
```

## 快速开始

```typescript
import { WebAASDK } from 'agenthub-sdk';

const sdk = new WebAASDK();

await sdk.init({
  channelKey: 'your-channel-key',
  apiBase: 'https://your-agenthub-server',
  skills: [
    {
      name: 'my_skill',
      schema: {
        type: 'function',
        function: {
          name: 'my_skill',
          description: '执行自定义操作',
          parameters: { type: 'object', properties: {} }
        }
      },
      executionMode: 'sdk',
      execute: async (params) => {
        // 你的业务逻辑
        return { success: true };
      }
    }
  ]
});

// 发送消息
const emitter = sdk.run({ userInput: '帮我完成任务' });

emitter.on('TextMessageDelta', (event) => {
  console.log(event.payload.delta);
});

emitter.on('done', () => {
  console.log('任务完成');
});
```

## 核心功能

- Skill 注册与执行
- SSE 事件流处理
- 自动重连与心跳
- 会话管理（Thread）
- 用户身份识别
- L1 Skill 缓存

## API

### `init(options)`

初始化 SDK，获取 Token 并注册 Skills。

### `run(options)`

发送用户消息，返回 EventEmitter 接收 AG-UI 事件流。

### `identify(user)`

标识当前用户身份。

### `registerLocalSkill(name, execute)`

注册本地 Skill 处理器（不上报后端）。

### `disconnect()`

断开连接，停止当前任务。

## 事件类型

| 事件 | 说明 |
|------|------|
| `RunStarted` | 任务开始 |
| `TextMessageDelta` | 流式文本输出 |
| `ToolCallStart/End` | 工具调用开始/结束 |
| `SkillExecuteInstruction` | SDK 端 Skill 执行指令 |
| `RunFinished` | 任务完成 |
| `Error` | 错误 |

## License

MIT
