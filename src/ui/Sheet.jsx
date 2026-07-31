import { Drawer } from '@base-ui/react/drawer';

/**
 * The app's bottom sheet, built on Base UI's Drawer.
 *
 * Base UI handles what the old hand-rolled `innerHTML` sheet did not: focus
 * trapping, Escape to dismiss, backdrop presses (which never fired on iOS
 * Safari, because a bare <div> with a click listener isn't a click target
 * there), background scroll locking, swipe-down-to-dismiss, and exit
 * animations that actually run before the node is removed.
 */
export function Sheet({ open, onOpenChange, title, description, children, className = '' }) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="sheet-backdrop" />
        <Drawer.Viewport className="sheet-viewport">
          <Drawer.Popup className={`sheet ${className}`.trim()}>
            {/* Outside Content so the handle stays pinned while the body scrolls.
                Content marks the scrollable region for Base UI's swipe handler,
                so a drag there scrolls instead of dismissing. */}
            <div className="grabber" aria-hidden="true" />
            <Drawer.Content className="sheet-content">
              {title ? <Drawer.Title className="sheet-title">{title}</Drawer.Title> : null}
              {description ? (
                <Drawer.Description className="sheet-desc">{description}</Drawer.Description>
              ) : null}
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export const SheetClose = Drawer.Close;
