# Design decisions

<!-- keel:start -->

- Slice 1. Give transactions the primary workspace. The header holds Settings, the main action opens a keyboard-accessible form, and destructive actions ask for confirmation. Signed values and their currency share a table column. Keep the visual mock label in the browser build and off the desktop layout.
- Slice 2. Preview accepted rows and list rejected rows next to the mapping in one dialog. Keep the confirmation disabled until at least one row can be imported. Expose the detected separator and header line for correction.
- Slice 3. Put categories and payee rules on their own workspace tab, with category usage counts and an explicit Apply rules action. Keep rule order visible and show the selected category in the import preview.
- Slice 4. Put month navigation next to income, spending and balance. Show one row per category with the budget, a simple spending bar, and an explicit amount left or over.
- Slice 5. Keep text and category filters within reach and reveal the ranges on demand. Export follows the displayed filters. The header exposes Undo after an eligible operation, including when the previous change is recovered from disk.

<!-- keel:end -->
