import { Toaster } from 'sonner'

/** Top-of-page toasts styled for Sunday Rolls. */
export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      richColors={false}
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'border border-sand bg-cream text-matte-black font-body shadow-md',
          title: 'font-body text-body',
          description: 'font-body text-body-small text-matte-black/70',
          success: 'border-heritage-green/30',
          error: 'border-leather/40',
          closeButton: 'border-sand bg-cream text-heritage-green',
        },
      }}
    />
  )
}
