import React from 'react';
import type { Message, ChartSkillResult } from '../core/types';
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
export declare function MessageList({ messages, primaryColor, typewriter, typewriterSpeed, renderMarkdown, renderChart, style, className, }: MessageListProps): JSX.Element;
//# sourceMappingURL=MessageList.d.ts.map