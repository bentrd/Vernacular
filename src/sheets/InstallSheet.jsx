import { Sheet, SheetClose } from '../ui/Sheet.jsx';

export function InstallSheet({ open, onOpenChange }) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Install Vernacular"
      description="To get word notifications on your iPhone:"
    >
      <div className="card install-steps">
        <ol>
          <li>
            Tap the <strong>Share</strong> button in Safari
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>
          </li>
          <li>Open Vernacular from your Home Screen</li>
          <li>
            Enable notifications in <strong>Settings</strong>
          </li>
        </ol>
      </div>
      <SheetClose className="btn full quiet install-done">Got it</SheetClose>
    </Sheet>
  );
}
