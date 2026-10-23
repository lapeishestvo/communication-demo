# Communication event tickets

Local interactive prototype based on the Communication Figma file.

[Open the published demo](https://lapeishestvo.github.io/communication-demo/).

## Run

Requires Node.js 18 or later. No dependencies or install step.

```sh
cd communication-demo
npm run dev
```

Open http://localhost:4173. Override the port with `PORT=4174 npm run dev`.

## Included

- Ticket table: name, author, status, last updated, sorting and pagination.
- General information modal creates a draft; general info remains editable.
- Up to 10 events per ticket, including duplication and deletion.
- Main info, English and optional Spanish texts, deep links and channel previews.
- @ insertion of values and text variations, shared across ticket events.
- Click a blue value badge to edit its existing value in a drawer on the right; Enter and Space also open it.
- Value and text variation drawers preserve the original text and update shared references when saved.
- Dictionary or custom parameters, per-value custom text, dictionary and unknown treatments; default/hide/do-not-send fallback behavior.
- Preview uses the examples configured for the ticket's values and text variations.
- Styled dropdown menus follow the Aura reference and support keyboard selection.
- Automatic browser-local draft persistence, explicit event save and validation.
- Send ticket validates all events, transitions draft → text_pending and returns to the table.
- Text review: per-event Accept/Decline, required decline comments, decision history, return to writer and send approved tickets to development.
- Preview variable controls update rendered messages without changing ticket values.
- Remaining later statuses are sample data and read-only.

This is a browser-local demo without a backend, authentication, actual notifications or a production Handlebars compiler. Sample data is fictional. The account shown in the header identifies the demo author; it does not sign in to a service. Local storage is scoped to the browser and origin. To reset sample data, delete `communication-tickets-v1` from local storage.

## Static build and GitHub Pages

```sh
npm run check
npm test
npm run build
```

The `dist/` folder contains the static site for GitHub Pages, plus `communication-demo.html`: a self-contained copy with its styles, font, images and application code embedded. Open `dist/communication-demo.html` directly in a browser to use the demo without a server or internet connection. Browser-local data belongs to that file's browser/origin and is separate from the localhost preview.

The normal static site retains relative paths for repository subdirectories. Building also refreshes the self-contained root `index.html`. No publication is performed by these commands.

The root `index.html` and `communication-demo-source.zip` are downloadable snapshots of the current release. GitHub Pages serves the root `index.html` from `main`.

GitHub Pages uses **Deploy from a branch → main → / (root)** in **Settings → Pages**. After checking and rebuilding, commit the updated source and root `index.html`, refresh the source archive, and push to `main`. GitHub automatically publishes the committed build.

## Design reference

- Table: https://www.figma.com/design/PqqU9aVSfy65KAhuihSWDv/Communication?node-id=2433-14293
- New ticket: https://www.figma.com/design/PqqU9aVSfy65KAhuihSWDv/Communication?node-id=2328-6278
- Filled ticket: https://www.figma.com/design/PqqU9aVSfy65KAhuihSWDv/Communication?node-id=2331-12118
- Ticket flow: https://www.figma.com/design/PqqU9aVSfy65KAhuihSWDv/Communication?node-id=2434-15474
- Dropdown: https://www.figma.com/design/PqqU9aVSfy65KAhuihSWDv/Communication?node-id=2437-23002
