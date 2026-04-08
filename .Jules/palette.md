## 2023-10-24 - WebGL Application Screen Reader Support
**Learning:** HTML overlays in WebGL/Canvas applications like flight simulators require explicit ARIA roles (e.g., `role="alertdialog"`, `aria-modal="true"`) to capture screen reader context when critical states (like stalls or crashes) interrupt the 3D experience.
**Action:** Always add standard ARIA attributes and focus management (`:focus-visible`) to HTML elements that overlay a WebGL canvas to ensure interactions remain fully accessible without modifying core backend logic.
