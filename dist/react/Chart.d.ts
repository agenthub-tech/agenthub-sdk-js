import React from 'react';
import type { ChartSkillResult, ChartType } from '../core/types';
export interface ChartProps {
    /** Chart data from chart_skill result */
    data: ChartSkillResult;
    /** Width (default: 100%) */
    width?: string | number;
    /** Height (default: 280px) */
    height?: string | number;
    /** Show type switcher (default: true) */
    showTypeSwitcher?: boolean;
    /** Primary color (default: #1890ff) */
    primaryColor?: string;
    /** On type change */
    onChartTypeChange?: (newType: ChartType) => void;
    /** Wrapper style */
    style?: React.CSSProperties;
    /** Wrapper className */
    className?: string;
}
export declare function Chart({ data, width, height, showTypeSwitcher, primaryColor, onChartTypeChange, style, className, }: ChartProps): JSX.Element;
//# sourceMappingURL=Chart.d.ts.map