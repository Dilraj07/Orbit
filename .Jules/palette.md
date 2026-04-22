## 2026-04-22 - Added aria-pressed and focus visible styles to Starlink button
**Learning:** Buttons acting as toggles should utilize the aria-pressed attribute to convey their state to screen readers, and custom styled buttons require explicitly styled focus-visible states for keyboard users since default browser outlines are often reset.
**Action:** Always check interactive elements for correct ARIA attributes reflecting state and ensure keyboard accessibility through focus styling.
