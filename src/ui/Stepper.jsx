import { NumberField } from '@base-ui/react/number-field';

// Daily-goal stepper. Base UI's NumberField brings clamping, the spinbutton
// role, keyboard arrows, and press-and-hold repeat.
export function Stepper({ value, onValueChange, min = 1, max = 10, label }) {
  return (
    <NumberField.Root
      className="stepper"
      value={value}
      onValueChange={(v) => v != null && onValueChange(v)}
      min={min}
      max={max}
      aria-label={label}
    >
      <NumberField.Group className="stepper-group">
        <NumberField.Decrement className="stepper-btn">−</NumberField.Decrement>
        <NumberField.Input className="stepper-input" readOnly />
        <NumberField.Increment className="stepper-btn">+</NumberField.Increment>
      </NumberField.Group>
    </NumberField.Root>
  );
}
