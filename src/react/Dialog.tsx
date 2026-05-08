// React Dialog components for dialog_skill

import React, { useState, useCallback } from 'react';
import type { DialogParams, DialogResult } from '../core/types';

export interface DialogConfirmProps {
  message: string;
  primaryColor?: string;
  onResult: (confirmed: boolean) => void;
}

export function DialogConfirm({ message, primaryColor = '#1890ff', onResult }: DialogConfirmProps): JSX.Element {
  const [answered, setAnswered] = useState(false);

  const handleConfirm = useCallback(() => {
    setAnswered(true);
    onResult(true);
  }, [onResult]);

  const handleCancel = useCallback(() => {
    setAnswered(true);
    onResult(false);
  }, [onResult]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      maxWidth: '85%',
      padding: '12px 14px',
      borderRadius: '14px 14px 14px 4px',
      background: '#f3f4f6',
      color: '#111827',
    }}>
      <span>{message}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleCancel}
          disabled={answered}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            background: '#ffffff',
            color: '#374151',
            fontSize: 13,
            cursor: answered ? 'default' : 'pointer',
            opacity: answered ? 0.4 : 1,
          }}
        >
          取消
        </button>
        <button
          onClick={handleConfirm}
          disabled={answered}
          style={{
            padding: '6px 16px',
            borderRadius: 6,
            border: 'none',
            background: primaryColor,
            color: '#ffffff',
            fontSize: 13,
            cursor: answered ? 'default' : 'pointer',
            opacity: answered ? 0.4 : 1,
          }}
        >
          确认
        </button>
      </div>
    </div>
  );
}

export interface DialogInputProps {
  message: string;
  placeholder?: string;
  inputType?: 'text' | 'password';
  primaryColor?: string;
  onResult: (value: string) => void;
}

export function DialogInput({
  message,
  placeholder = '',
  inputType = 'text',
  primaryColor = '#1890ff',
  onResult,
}: DialogInputProps): JSX.Element {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(() => {
    if (!value.trim()) return;
    setSubmitted(true);
    onResult(value);
  }, [value, onResult]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      maxWidth: '85%',
      padding: '12px 14px',
      borderRadius: '14px 14px 14px 4px',
      background: '#f3f4f6',
      color: '#111827',
    }}>
      <span>{message}</span>
      <input
        type={inputType}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        disabled={submitted}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '7px 10px',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: 13,
          outline: 'none',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={submitted || !value.trim()}
        style={{
          alignSelf: 'flex-end',
          padding: '6px 16px',
          borderRadius: 6,
          border: 'none',
          background: primaryColor,
          color: '#fff',
          fontSize: 13,
          cursor: submitted || !value.trim() ? 'default' : 'pointer',
          opacity: submitted || !value.trim() ? 0.4 : 1,
        }}
      >
        提交
      </button>
    </div>
  );
}

export interface DialogNotifyProps {
  message: string;
}

export function DialogNotify({ message }: DialogNotifyProps): JSX.Element {
  return (
    <div style={{
      maxWidth: '85%',
      padding: '10px 14px',
      borderRadius: '14px 14px 14px 4px',
      background: '#f3f4f6',
      color: '#111827',
    }}>
      {message}
    </div>
  );
}

export interface DialogErrorProps {
  message: string;
}

export function DialogError({ message }: DialogErrorProps): JSX.Element {
  return (
    <div style={{
      maxWidth: '85%',
      padding: '10px 14px',
      borderRadius: '14px 14px 14px 4px',
      background: '#fef2f2',
      color: '#dc2626',
    }}>
      ⚠️ {message}
    </div>
  );
}
