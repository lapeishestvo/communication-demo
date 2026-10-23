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

- Ticket table: name, author, status, last updated, sorting and pagination. Any cell opens its ticket; the title remains keyboard accessible. Row hover states use neutral colors; New ticket retains its original primary style.
- Ticket header: name and status above the assigned person; assignment dates are shown when available. History is deferred.
- General info fills TTL automatically: 7 days normally, 10 minutes for OTP, 1 day for Origination. Service silent hours default to 11 p.m. – 6 a.m.; Marketing defaults to 8 p.m. – 8 a.m. and cannot use “No silent hours”. Manual overrides remain when changing other fields.
- Business review uses generated demo evidence per event: tester comments, phone captures for its active channels, and an event-specific contract with the same input values and recipient. A new review stores a snapshot; existing tickets without evidence receive a stable generated example without changing their saved data on view.
- General information modal creates a draft; general info remains editable. Create/Save validates required fields with the same red outline and inline message as decline comments, focuses the first invalid control and clears corrected errors while typing or selecting.
- Up to 10 events per ticket, including duplication and deletion.
- Event names appear in ticket navigation and event headings and update while typing. The copy buttons in navigation and the event heading duplicate the entire event using the same action.
- Main info, English and optional Spanish texts, deep links and channel previews.
- MVP-1 options: Push, SMS, Push + SMS or Push or SMS; communication types Service and Marketing. Both paired channels expose Push and SMS fields. OTP remains available as a process with a 10-minute TTL.
- @ insertion of values and text variations, shared across ticket events.
- Click a blue value badge to edit its existing value in a drawer on the right; Enter and Space also open it.
- Value and text variation drawers preserve the original text and update shared references when saved.
- Dictionary or custom parameters, per-value custom text, dictionary and unknown treatments; default/hide/do-not-send fallback behavior.
- Preview uses the examples configured for the ticket's values and text variations.
- Styled dropdown menus follow the Aura reference and support keyboard selection.
- Automatic browser-local draft persistence, explicit event save and validation.
- Send ticket validates all events, transitions draft → text_pending and returns to the table.
- Text review: per-event Accept/Decline, required decline comments, decision history, return to writer and send approved tickets to development.
- Declining without a comment highlights the review field and displays “Required when declining”; entering a nonblank comment clears the error without losing focus.
- Leaving Text review or Business review requires a decision on every event in that stage. Attempting to send or return a ticket with unreviewed events keeps it open and displays the Figma “Review all events” error toast at the top right.
- Business review: independent per-event decisions and comments, Contract JSON and Screens evidence from the mockup, return to development and migration after every event is approved. Enter this stage from an In testing ticket using Send to review.
- Preview language switches between English and Spanish in Draft, both review stages and read-only Preview tabs. It updates messages, variable controls and all versions without changing the saved copy or preview examples; missing Spanish copy remains empty.
- Preview variable controls update rendered messages without changing ticket values.
- Previews align with the left edge of the controls. All versions below lists unique sendable combinations of dictionary values and text variations, including fallback branches; each version shows the input variable values above its messages. Free-text inputs retain their current preview values.
- All statuses outside Draft, Text review and Business review use a compact read-only event view with Main info, Texts, Content and Preview tabs. Event data and values cannot be changed; preview examples remain interactive.

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
