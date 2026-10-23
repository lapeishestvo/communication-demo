# Communication demo

[Open the demo](https://lapeishestvo.github.io/communication-demo/)

Interactive prototype for creating communication event tickets. Includes the ticket list, draft creation, up to 10 events, message previews and submission to Text pending. Other statuses are sample records.

Changes are stored only in your browser. This demo does not send notifications and has no backend or authentication.

`index.html` is the self-contained published build. Download `communication-demo-source.zip` for the complete editable source, tests, Figma references and build scripts. The project requires Node.js 18 or later and has no package dependencies.

```sh
cd communication-demo
npm run dev
```

To verify and rebuild:

```sh
npm run check
npm test
npm run build
```
