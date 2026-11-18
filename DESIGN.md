# Design decisions

<!-- keel:start -->

- Slice 1. Give transactions the primary workspace. The header holds Settings, the main action opens a keyboard-accessible form, and destructive actions ask for confirmation. Signed values and their currency share a table column. Keep the visual mock label in the browser build and off the desktop layout.
- Slice 2. Preview accepted rows and list rejected rows next to the mapping in one dialog. Keep the confirmation disabled until at least one row can be imported. Expose the detected separator and header line for correction.

<!-- keel:end -->
