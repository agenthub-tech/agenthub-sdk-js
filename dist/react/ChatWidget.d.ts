import React from 'react';
import { type ChatWidgetConfig } from '../core';
export interface ChatWidgetProps extends ChatWidgetConfig {
    /** Container style */
    style?: React.CSSProperties;
    /** Container className */
    className?: string;
}
export declare function ChatWidget({ channelKey, apiBase, theme, debug, user, onDialog, onReady, onError, style, className, }: ChatWidgetProps): JSX.Element;
//# sourceMappingURL=ChatWidget.d.ts.map