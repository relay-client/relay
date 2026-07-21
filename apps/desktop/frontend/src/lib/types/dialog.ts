export type DialogOption = {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: 'http' | 'graphql' | 'ws' | 'sio' | 'grpc' | 'bruno' | 'postman' | 'insomnia' | 'openapi' | 'har';
  description?: string;
};

type DialogResult = string | boolean | null;

type AppDialogBase = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (value?: DialogResult) => void;
};

export type AppDialogState =
  | (AppDialogBase & { mode: 'prompt'; options?: never })
  | (AppDialogBase & { mode: 'confirm'; options?: never })
  | (AppDialogBase & { mode: 'select'; options: DialogOption[] })
  | (AppDialogBase & { mode: 'alert'; options?: never })
  | (AppDialogBase & { mode: 'unsaved'; altLabel: string; options?: never });
