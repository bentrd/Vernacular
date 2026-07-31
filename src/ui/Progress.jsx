import { Progress } from '@base-ui/react/progress';

export function ProgressBar({ value, max = 100, label, className = '' }) {
  return (
    <Progress.Root
      className={`progress ${className}`.trim()}
      value={value}
      max={max}
      aria-label={label}
    >
      <Progress.Track className="progress-track">
        <Progress.Indicator className="progress-fill" />
      </Progress.Track>
    </Progress.Root>
  );
}
