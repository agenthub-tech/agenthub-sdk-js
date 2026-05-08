// React MessageList component

import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { Message, ChartSkillResult } from '../core/types';
import { Chart } from './Chart';

export interface MessageListProps {
  messages: Message[];
  primaryColor?: string;
  /** Enable typewriter effect for streaming messages */
  typewriter?: boolean;
  /** Typewriter speed in ms per character */
  typewriterSpeed?: number;
  /** Custom markdown renderer */
  renderMarkdown?: (content: string) => React.ReactNode;
  /** Custom chart renderer */
  renderChart?: (chartData: ChartSkillResult) => React.ReactNode;
  /** Container style */
  style?: React.CSSProperties;
  /** Container className */
  className?: string;
}

export function MessageList({
  messages,
  primaryColor = '#1890ff',
  typewriter = true,
  typewriterSpeed = 20,
  renderMarkdown,
  renderChart,
  style,
  className,
}: MessageListProps): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null);
  const [displayedContent, setDisplayedContent] = useState<Map<string, string>>(new Map());

  // Track streaming messages for typewriter effect
  const streamingMsg = useMemo(() => 
    messages.find(m => m.state === 'streaming' && m.content),
    [messages]
  );

  // Typewriter effect
  useEffect(() => {
    if (!typewriter || !streamingMsg) {
      // Reset displayed content when not using typewriter or no streaming
      setDisplayedContent(new Map());
      return;
    }

    const targetContent = streamingMsg.content || '';
    const currentDisplayed = displayedContent.get(streamingMsg.id) || '';
    
    if (targetContent.length <= currentDisplayed.length) {
      // Content reset or same, update directly
      setDisplayedContent(prev => new Map(prev).set(streamingMsg.id, targetContent));
      return;
    }

    // Start from current displayed length and add characters
    let currentIndex = currentDisplayed.length;
    const interval = setInterval(() => {
      if (currentIndex < targetContent.length) {
        currentIndex++;
        setDisplayedContent(prev => new Map(prev).set(streamingMsg.id, targetContent.slice(0, currentIndex)));
      } else {
        clearInterval(interval);
      }
    }, typewriterSpeed);

    return () => clearInterval(interval);
  }, [typewriter, streamingMsg?.id, streamingMsg?.content, typewriterSpeed]);

  // Reset displayed content when message is done
  useEffect(() => {
    messages.forEach(msg => {
      if (msg.state === 'done' && displayedContent.has(msg.id)) {
        setDisplayedContent(prev => {
          const next = new Map(prev);
          next.delete(msg.id);
          return next;
        });
      }
    });
  }, [messages]);

  // Auto scroll
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, displayedContent]);

  return (
    <div
      ref={listRef}
      style={{
        flex: 1,
        overflow: 'auto',
        padding: 16,
        ...style,
      }}
      className={className}
    >
      {messages.map((msg) => {
        const isUser = msg.role === 'user';
        const isStreaming = msg.state === 'streaming';
        
        // Use typewriter content for streaming messages, otherwise use full content
        const content = (typewriter && isStreaming && displayedContent.has(msg.id))
          ? displayedContent.get(msg.id)!
          : msg.content;

        return (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: isUser ? 'flex-end' : 'flex-start',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                maxWidth: '70%',
                padding: '10px 14px',
                borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: isUser ? primaryColor : '#f5f5f5',
                color: isUser ? '#fff' : '#1a1a1a',
              }}
            >
              {/* Files */}
              {msg.files && msg.files.length > 0 && (
                <div style={{ marginBottom: 8, opacity: 0.8 }}>
                  {msg.files.map((f, i) => (
                    <div key={i} style={{ fontSize: 12 }}>📎 {f.name}</div>
                  ))}
                </div>
              )}

              {/* Content */}
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>
                {renderMarkdown 
                  ? renderMarkdown(content || '')
                  : <DefaultMarkdown content={content || ''} isUser={isUser} />
                }

                {/* Chart */}
                {msg.chartData && (
                  renderChart
                    ? renderChart(msg.chartData)
                    : <Chart data={msg.chartData} primaryColor={primaryColor} />
                )}
              </div>

              {/* Loading */}
              {isStreaming && !msg.content && (
                <span>正在思考...</span>
              )}
              
              {/* Typing cursor */}
              {isStreaming && content && (
                <span style={{ 
                  display: 'inline-block', 
                  width: 2, 
                  height: 16, 
                  background: 'currentColor',
                  marginLeft: 2,
                  animation: 'blink 1s infinite',
                  verticalAlign: 'text-bottom'
                }} />
              )}
            </div>
          </div>
        );
      })}
      
      {/* Keyframe for cursor blink */}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/** Default markdown renderer using react-markdown */
function DefaultMarkdown({ content, isUser }: { content: string; isUser: boolean }): JSX.Element {
  // Try to use react-markdown if available
  try {
    // Dynamic import would be better but for now we check if it's available
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ReactMarkdown = require('react-markdown');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const remarkGfm = require('remark-gfm');
    
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Style elements for chat bubble
          p: ({ children }: { children?: React.ReactNode }) => <p style={{ margin: 0 }}>{children}</p>,
          a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: isUser ? '#e6f7ff' : primaryColor }}
            >
              {children}
            </a>
          ),
          code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
            const isInline = !className;
            return isInline ? (
              <code style={{
                background: isUser ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 13,
              }}>
                {children}
              </code>
            ) : (
              <code style={{
                display: 'block',
                background: isUser ? 'rgba(255,255,255,0.1)' : '#f0f0f0',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 13,
                overflowX: 'auto',
              }}>
                {children}
              </code>
            );
          },
          ul: ({ children }: { children?: React.ReactNode }) => <ul style={{ margin: '8px 0', paddingLeft: 20 }}>{children}</ul>,
          ol: ({ children }: { children?: React.ReactNode }) => <ol style={{ margin: '8px 0', paddingLeft: 20 }}>{children}</ol>,
          li: ({ children }: { children?: React.ReactNode }) => <li style={{ margin: '4px 0' }}>{children}</li>,
          strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
          blockquote: ({ children }: { children?: React.ReactNode }) => (
            <blockquote style={{
              borderLeft: `3px solid ${isUser ? 'rgba(255,255,255,0.3)' : '#d9d9d9'}`,
              margin: '8px 0',
              paddingLeft: 12,
              opacity: 0.9,
            }}>
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    );
  } catch {
    // Fallback: simple line-by-line rendering
    return <FallbackMarkdown content={content} />;
  }
}

/** Fallback markdown renderer when react-markdown is not available */
function FallbackMarkdown({ content }: { content: string }): JSX.Element {
  const lines = content.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {line || '\u00A0'}
          {i < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  );
}

// Reference for primary color in DefaultMarkdown
const primaryColor = '#1890ff';
