import React from 'react';

/** Shared Codex Hive Labs top banner used on the other app subdomains. Links are unchanged. */
export default function LabNav() {
  return (
    <nav id="chl-lab-nav" aria-label="Codex Hive Labs">
      <div className="chl-lab-nav__bar">
        <a className="chl-lab-nav__brand" href="https://codex-hive.com">
          <picture>
            <source
              type="image/webp"
              srcSet="/chl-assets/codex-hive-mark-1x.webp 1x, /chl-assets/codex-hive-mark-2x.webp 2x, /chl-assets/codex-hive-mark-3x.webp 3x"
            />
            <img
              src="/chl-assets/codex-hive-mark-1x.png"
              srcSet="/chl-assets/codex-hive-mark-1x.png 1x, /chl-assets/codex-hive-mark-2x.png 2x, /chl-assets/codex-hive-mark-3x.png 3x"
              width={26}
              height={32}
              alt="Codex Hive"
              decoding="async"
            />
          </picture>
          <span className="chl-lab-nav__name">
            Codex Hive <span className="chl-lab-nav__labs">Labs</span>
          </span>
        </a>
        <input type="checkbox" id="chl-lab-nav-toggle" className="chl-lab-nav__check" autoComplete="off" />
        <label className="chl-lab-nav__toggle" htmlFor="chl-lab-nav-toggle">
          <span className="chl-lab-nav__sr">Open Codex Hive Labs menu</span>
        </label>
        <div className="chl-lab-nav__links">
          <a href="https://codex-hive.com">Home</a>
          <a href="https://codex-hive.com/apps-1">Apps</a>
          <a href="https://newz.codex-hive.com">Newz</a>
          <a
            href="https://www.patreon.com/c/Codex_Hive_Labs"
            target="_blank"
            rel="noopener noreferrer"
          >
            Patreon
          </a>
        </div>
      </div>
    </nav>
  );
}
