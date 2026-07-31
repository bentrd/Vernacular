import { Switch } from '@base-ui/react/switch';

// iOS-style switch. Base UI gives it the right role, keyboard handling, and
// data-checked hooks; main.css does the sliding.
export function Toggle({ checked, onCheckedChange, disabled, ...props }) {
  return (
    <Switch.Root
      className="toggle"
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      {...props}
    >
      <Switch.Thumb className="toggle-thumb" />
    </Switch.Root>
  );
}
