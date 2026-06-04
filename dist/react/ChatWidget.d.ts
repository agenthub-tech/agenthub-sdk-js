import React from 'react';
import { type ChatWidgetConfig } from '../core';
export interface ChatWidgetProps extends ChatWidgetConfig {
    /** Container style */
    style?: React.CSSProperties;
    /** Container className */
    className?: string;
    /** Show thread list and switching UI when an explicit user is identified */
    enableThreadList?: boolean;
}
export declare function ChatWidget({ channelKey, apiBase, theme, debug, user, onDialog, onReady, onError, style, className, enableThreadList, }: ChatWidgetProps): JSX.Element;
//# sourceMappingURL=ChatWidget.d.ts.map