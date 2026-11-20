import React, { useEffect, useRef, useState } from 'react';

/** Wraps a live value; briefly highlights it when a new poll changes it. */
export default function LiveValue({ value, children, className = '' }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    if (prev.current !== undefined && prev.current !== value && value != null) setFlash((n) => n + 1);
    prev.current = value;
  }, [value]);
  return <span key={flash} className={`live-val ${flash ? 'flash' : ''} ${className}`}>{children}</span>;
}

export function LiveDot({ on = true, title }) {
  return <i className={`live-dot ${on ? 'on' : 'off'}`} title={title || (on ? 'Live NOAA data' : 'Not live')} />;
}
