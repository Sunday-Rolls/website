import { toast as sonnerToast } from 'sonner'

export function toastSuccess(message: string): void {
  sonnerToast.success(message)
}

export function toastError(message: string): void {
  sonnerToast.error(message)
}
