import { Sheet, SheetClose } from '../ui/Sheet.jsx';

export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  destructive = false,
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="btn-row">
        <SheetClose className="btn quiet">{cancelLabel}</SheetClose>
        <button
          type="button"
          className={`btn ${destructive ? 'danger' : 'accent'}`}
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
