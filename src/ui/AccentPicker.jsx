import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';

export const ACCENTS = ['lilac', 'blue', 'green', 'rose', 'amber', 'slate'];

export function AccentPicker({ value, onValueChange }) {
  return (
    <RadioGroup
      className="swatches"
      value={value}
      onValueChange={onValueChange}
      aria-label="Accent color"
    >
      {ACCENTS.map((a) => (
        <Radio.Root key={a} value={a} className="swatch" data-accent-choice={a} aria-label={a}>
          <Radio.Indicator className="swatch-ring" />
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
