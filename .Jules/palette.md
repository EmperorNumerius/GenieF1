## 2026-03-15 - Keyboard Accessibility on Interactive Divs
**Learning:** Found an accessibility issue pattern specific to this app's components where interactive `motion.div` elements acting as buttons (like driver selection cards) lack necessary accessibility attributes, making them inaccessible to keyboard and screen reader users.
**Action:** When using `div` or `motion.div` for interactive elements, always ensure they include `role="button"`, `tabIndex={0}`, `onKeyDown` handlers (for Enter/Space), and `focus-visible` styling.
