import React from 'react';

/** Shared Codex Hive Labs breadcrumb used on the other app subdomains. */
export default function Breadcrumb() {
  return (
    <nav className="bc bc--deep" aria-label="Breadcrumb">
      <div className="bc__in">
        <ol className="bc__list" id="bc">
          <li className="bc__item bc__item--home">
            <a href="https://codex-hive.com" aria-label="Codex Hive Labs, codex-hive.com">
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
                  alt=""
                  decoding="async"
                />
              </picture>
              <span className="bc__t">
                Codex Hive <span className="bc__labs">Labs</span>
              </span>
            </a>
          </li>
          <li className="bc__item bc__item--academy">
            <a href="https://codex-hive.com/research/" aria-label="Codex Hive Research">
              <span className="bc__t">Codex Hive Research</span>
              <span className="bc__dots" aria-hidden="true">
                …
              </span>
            </a>
          </li>
          <li className="bc__item bc__item--module">
            <a href="https://ero.codex-hive.com/" aria-current="page">
              Earth Resonance Observatory
            </a>
          </li>
        </ol>
      </div>
    </nav>
  );
}
