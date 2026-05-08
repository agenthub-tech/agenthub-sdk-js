import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// React Chart component for chart_skill results
import { useEffect, useRef, useState } from 'react';
const CHART_TYPE_LABELS = {
    'bar': '柱状图',
    'line': '折线图',
    'pie': '饼图',
    'bar-horizontal': '条形图',
};
export function Chart({ data, width, height, showTypeSwitcher = true, primaryColor = '#1890ff', onChartTypeChange, style, className, }) {
    const containerRef = useRef(null);
    const chartRef = useRef(null);
    const [currentType, setCurrentType] = useState(data.chart_type);
    useEffect(() => {
        if (!containerRef.current)
            return;
        let mounted = true;
        const loadAndRender = async () => {
            try {
                const echarts = await import('echarts');
                if (!mounted || !containerRef.current)
                    return;
                const chart = echarts.init(containerRef.current, undefined, { renderer: 'canvas' });
                chart.setOption(data.echarts_option);
                chartRef.current = {
                    dispose: () => chart.dispose(),
                    setChartType: (type) => {
                        const newOption = data.echarts_options[type];
                        if (newOption) {
                            chart.setOption(newOption, true);
                        }
                    },
                };
            }
            catch (err) {
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
    const handleTypeChange = (type) => {
        if (type === currentType)
            return;
        setCurrentType(type);
        chartRef.current?.setChartType(type);
        onChartTypeChange?.(type);
    };
    const hasMultipleTypes = showTypeSwitcher && data.available_chart_types.length > 1;
    return (_jsxs("div", { style: { marginTop: 12, ...style }, className: className, children: [_jsx("div", { ref: containerRef, style: {
                    width: width ?? '100%',
                    height: typeof height === 'number' ? `${height}px` : (height ?? '280px'),
                    background: '#fafafa',
                    borderRadius: 8,
                } }), hasMultipleTypes && (_jsx("div", { style: { marginTop: 8, display: 'flex', justifyContent: 'center', gap: 8 }, children: data.available_chart_types.map((type) => (_jsx("button", { onClick: () => handleTypeChange(type), style: {
                        padding: '4px 12px',
                        borderRadius: 6,
                        border: type === currentType ? 'none' : '1px solid #d9d9d9',
                        background: type === currentType ? primaryColor : '#fff',
                        color: type === currentType ? '#fff' : '#333',
                        fontSize: 12,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                    }, children: CHART_TYPE_LABELS[type] ?? type }, type))) }))] }));
}
//# sourceMappingURL=Chart.js.map