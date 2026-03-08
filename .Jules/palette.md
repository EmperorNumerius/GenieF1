## 2026-03-08 - Keyboard Accessibility on Interactive Divs
**Learning:** When using components like `motion.div` for lists (e.g., driver selection) with `onClick` handlers, they are not inherently keyboard accessible and violate accessibility guidelines.
**Action:** Ensure custom interactive elements acting as buttons or list options are explicitly provided with `role="button"` (or `role="option"` inside a `role="listbox"`), `tabIndex={0}`, `onKeyDown` handlers for 'Enter' and 'Space', `aria-selected`, `aria-label`, and clear `focus-visible` styling.
