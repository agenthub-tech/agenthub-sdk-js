import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// React Dialog components for dialog_skill
import { useState, useCallback } from 'react';
export function DialogConfirm({ message, primaryColor = '#1890ff', onResult }) {
    const [answered, setAnswered] = useState(false);
    const handleConfirm = useCallback(() => {
        setAnswered(true);
        onResult(true);
    }, [onResult]);
    const handleCancel = useCallback(() => {
        setAnswered(true);
        onResult(false);
    }, [onResult]);
    return (_jsxs("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            maxWidth: '85%',
            padding: '12px 14px',
            borderRadius: '14px 14px 14px 4px',
            background: '#f3f4f6',
            color: '#111827',
        }, children: [_jsx("span", { children: message }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { onClick: handleCancel, disabled: answered, style: {
                            padding: '6px 16px',
                            borderRadius: 6,
                            border: '1px solid #d1d5db',
                            background: '#ffffff',
                            color: '#374151',
                            fontSize: 13,
                            cursor: answered ? 'default' : 'pointer',
                            opacity: answered ? 0.4 : 1,
                        }, children: "\u53D6\u6D88" }), _jsx("button", { onClick: handleConfirm, disabled: answered, style: {
                            padding: '6px 16px',
                            borderRadius: 6,
                            border: 'none',
                            background: primaryColor,
                            color: '#ffffff',
                            fontSize: 13,
                            cursor: answered ? 'default' : 'pointer',
                            opacity: answered ? 0.4 : 1,
                        }, children: "\u786E\u8BA4" })] })] }));
}
export function DialogInput({ message, placeholder = '', inputType = 'text', primaryColor = '#1890ff', onResult, }) {
    const [value, setValue] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const handleSubmit = useCallback(() => {
        if (!value.trim())
            return;
        setSubmitted(true);
        onResult(value);
    }, [value, onResult]);
    return (_jsxs("div", { style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            maxWidth: '85%',
            padding: '12px 14px',
            borderRadius: '14px 14px 14px 4px',
            background: '#f3f4f6',
            color: '#111827',
        }, children: [_jsx("span", { children: message }), _jsx("input", { type: inputType, placeholder: placeholder, value: value, onChange: (e) => setValue(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleSubmit(), disabled: submitted, style: {
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '7px 10px',
                    border: '1px solid #d1d5db',
                    borderRadius: 6,
                    fontSize: 13,
                    outline: 'none',
                } }), _jsx("button", { onClick: handleSubmit, disabled: submitted || !value.trim(), style: {
                    alignSelf: 'flex-end',
                    padding: '6px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: primaryColor,
                    color: '#fff',
                    fontSize: 13,
                    cursor: submitted || !value.trim() ? 'default' : 'pointer',
                    opacity: submitted || !value.trim() ? 0.4 : 1,
                }, children: "\u63D0\u4EA4" })] }));
}
export function DialogNotify({ message }) {
    return (_jsx("div", { style: {
            maxWidth: '85%',
            padding: '10px 14px',
            borderRadius: '14px 14px 14px 4px',
            background: '#f3f4f6',
            color: '#111827',
        }, children: message }));
}
export function DialogError({ message }) {
    return (_jsxs("div", { style: {
            maxWidth: '85%',
            padding: '10px 14px',
            borderRadius: '14px 14px 14px 4px',
            background: '#fef2f2',
            color: '#dc2626',
        }, children: ["\u26A0\uFE0F ", message] }));
}
//# sourceMappingURL=Dialog.js.map