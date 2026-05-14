## 2024-05-14 - Disabled state for Undo/Redo
**Learning:** Undo/Redo buttons in the command strip should visually indicate their availability using disabled states based on the history stack, preventing users from clicking unavailable actions.
**Action:** Use `state.history.undoStack.length` and `state.history.redoStack.length` to disable these buttons when history is empty.
