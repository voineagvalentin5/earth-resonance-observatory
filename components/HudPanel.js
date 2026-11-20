export default function HudPanel({ id, title, children, className = '', aside = null }) {
  return (
    <section className={`hud-panel ${className}`}>
      <header className="hud-title">
        {id ? <span className="hud-num">{id}</span> : null}
        <h2>{title}</h2>
        {aside}
      </header>
      <div className="hud-body">{children}</div>
    </section>
  );
}
