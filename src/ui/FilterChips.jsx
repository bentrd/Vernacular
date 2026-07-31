import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';

// Single-select filter row. ToggleGroup gives roving focus and arrow-key
// navigation for free; `toggleMultiple={false}` keeps exactly one chip on.
export function FilterChips({ value, onValueChange, options, label }) {
  return (
    <ToggleGroup
      className="chips"
      toggleMultiple={false}
      value={[value]}
      onValueChange={(groupValue) => {
        // Ignore the empty array you get from pressing the already-active chip.
        if (groupValue.length) onValueChange(groupValue[0]);
      }}
      aria-label={label}
    >
      {options.map((o) => (
        <Toggle key={o.value} value={o.value} className="chip">
          {o.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
