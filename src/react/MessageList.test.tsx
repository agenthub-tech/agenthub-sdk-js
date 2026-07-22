import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MessageList } from './MessageList';


describe('MessageList markdown rendering', () => {
  it('renders headings, GFM tables, and images for assistant messages', () => {
    const html = renderToStaticMarkup(
      <MessageList
        typewriter={false}
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            state: 'done',
            content: [
              '# 搜索结果',
              '',
              '| 名称 | 地址 |',
              '| --- | --- |',
              '| 示例 | https://example.com |',
              '',
              '![示例图片](https://example.com/image.jpg)',
            ].join('\n'),
          },
        ]}
      />,
    );

    expect(html).toContain('<h1>搜索结果</h1>');
    expect(html).toContain('<table');
    expect(html).toContain('src="https://example.com/image.jpg"');
    expect(html).toContain('alt="示例图片"');
    expect(html).toContain('max-width:min(100%, 360px)');
    expect(html).toContain('max-height:240px');
    expect(html).toContain('cursor:zoom-in');
  });
});
