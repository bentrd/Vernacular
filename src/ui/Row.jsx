// Grouped list rows, the app's Settings-style container.
export function Group({ children, className = '' }) {
  return <div className={`setting-group ${className}`.trim()}>{children}</div>;
}

// A row that does something. Always a real <button>, never a div with a
// listener: that distinction is what makes it reliably tappable on iOS.
export function ActionRow({ title, subtitle, value, onClick, disabled, className = '', children }) {
  return (
    <button
      type="button"
      className={`setting-row ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="s-main">
        <span className="s-title">{title}</span>
        {subtitle ? <span className="s-sub">{subtitle}</span> : null}
      </span>
      {value ? <span className="s-value">{value}</span> : null}
      {children}
    </button>
  );
}

// A row that only displays, or hosts its own control (switch, stepper).
export function StaticRow({ title, subtitle, value, className = '', children }) {
  return (
    <div className={`setting-row ${className}`.trim()}>
      <span className="s-main">
        <span className="s-title">{title}</span>
        {subtitle ? <span className="s-sub">{subtitle}</span> : null}
      </span>
      {value ? <span className="s-value">{value}</span> : null}
      {children}
    </div>
  );
}
