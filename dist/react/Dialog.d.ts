/// <reference types="react" />
export interface DialogConfirmProps {
    message: string;
    primaryColor?: string;
    onResult: (confirmed: boolean) => void;
}
export declare function DialogConfirm({ message, primaryColor, onResult }: DialogConfirmProps): JSX.Element;
export interface DialogInputProps {
    message: string;
    placeholder?: string;
    inputType?: 'text' | 'password';
    primaryColor?: string;
    onResult: (value: string) => void;
}
export declare function DialogInput({ message, placeholder, inputType, primaryColor, onResult, }: DialogInputProps): JSX.Element;
export interface DialogNotifyProps {
    message: string;
}
export declare function DialogNotify({ message }: DialogNotifyProps): JSX.Element;
export interface DialogErrorProps {
    message: string;
}
export declare function DialogError({ message }: DialogErrorProps): JSX.Element;
//# sourceMappingURL=Dialog.d.ts.map