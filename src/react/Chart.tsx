// React Chart component for chart_skill results

import React, { useEffect, useRef, useState } from 'react';
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

const CHART_TYPE_LABELS: Record<ChartType, string> = {
  'bar': '柱状图',
  'line': '折线图',
  'pie': '饼图',
  'bar-horizontal': '条形图',
};

export function Chart({
  data,
  width,
  height,
  showTypeSwitcher = true,
  primaryColor = '#1890ff',
  onChartTypeChange,
  style,
  className,
}: ChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ dispose: () => void; setChartType: (type: ChartType) => void } | null>(null);
  const [currentType, setCurrentType] = useState<ChartType>(data.chart_type);

  useEffect(() => {
    if (!containerRef.current) return;

    let mounted = true;

    const loadAndRender = async () => {
      try {
        const echarts = await import('echarts');
        if (!mounted || !containerRef.current) return;

        const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
        chart.setOption(data.echarts_option);

        chartRef.current = {
          dispose: () => chart.dispose(),
          setChartType: (type: ChartType) => {
            const newOption = data.echarts_options[type];
            if (newOption) {
              chart.setOption(newOption, true);
            }
          },
        };
      } catch (err) {
        console.error('[agenthub-sdk] Failed to load echarts:', err);
      }
    };

    loadAndRender();

    return () => {
      mounted = false;
      if (chartRef.current) {
        chartRef.current.dispose();
        chartRef.current = null;
      }
    };
  }, [data]);

  const handleTypeChange = (type: ChartType) => {
    if (type === currentType) return;
    setCurrentType(type);
    chartRef.current?.setChartType(type);
    onChartTypeChange?.(type);
  };

  const hasMultipleTypes = showTypeSwitcher && data.available_chart_types.length > 1;

  return (
    <div style={{ marginTop: 12, ...style }} className={className}>
      <div
        ref={containerRef}
        style={{
          width: width ?? '100%',
          height: typeof height === 'number' ? `${height}px` : (height ?? '280px'),
          background: '#fafafa',
          borderRadius: 8,
        }}
      />
      {hasMultipleTypes && (
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8 }}>
          {data.available_chart_types.map((type) => (
            <button
              key={type}
              onClick={() => handleTypeChange(type)}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: type === currentType ? 'none' : '1px solid #d9d9d9',
                background: type === currentType ? primaryColor : '#fff',
                color: type === currentType ? '#fff' : '#333',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {CHART_TYPE_LABELS[type] ?? type}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
