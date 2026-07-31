import { Field } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';
import { SearchIcon } from '../icons.jsx';

export function SearchField({ value, onValueChange, placeholder = 'Search…', label = 'Search' }) {
  return (
    <Field.Root className="searchbar">
      <Field.Label className="sr-only">{label}</Field.Label>
      <SearchIcon />
      <Input
        type="search"
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
      />
    </Field.Root>
  );
}
