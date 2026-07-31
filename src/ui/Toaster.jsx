import { Toast } from '@base-ui/react/toast';

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((t) => (
    <Toast.Root key={t.id} toast={t} className="toast">
      <Toast.Content>
        {t.title ? <Toast.Title className="toast-title" /> : null}
        <Toast.Description className="toast-desc" />
      </Toast.Content>
    </Toast.Root>
  ));
}

export function Toaster() {
  return (
    <Toast.Portal>
      <Toast.Viewport className="toast-viewport">
        <ToastList />
      </Toast.Viewport>
    </Toast.Portal>
  );
}
