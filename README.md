# 3D Works client prototype

A clickable Next.js/Vinext front-end prototype for a 3D printing service. All job data is mock data held in browser local storage. There are no network requests for orders, files, pricing, authentication, payments, or notifications.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by the server. Build with `npm run build`.

## Prototype flows

- **Home:** service pitch, process, materials, examples, quality and contact sections.
- **Get a quote:** accepts an STL, OBJ or 3MF file, collects print preferences and contact details, then creates a local sample job. STL and OBJ files open in the 3D viewer. The file stays in this browser. Price is illustrative.
- **Track an order:** recent orders and an individual status timeline. New requests appear here immediately.
- **Staff job board:** board and list views, search, draggable cards, and seven status stages.
- **Staff job detail:** specifications, quote, customer, notes, activity, progress, stage controls, print job sheet and simulated update action.

## Integration handoff

The screens and reusable UI primitives currently live in `app/page.tsx`; design tokens and responsive styles live in `app/globals.css`. The `Job` type and `stages` array define the shared order model. Jobs are stored in `localStorage` (`3dw-demo-jobs`). Uploaded bytes are stored in IndexedDB (`3dw-files`) so the quote page, order tracking, and staff job detail show the same STL or OBJ, and staff can download it. Replace that browser storage with your API when the real service exists. The estimate stays illustrative. “Send update” only records a demo note.

## Demo reset

Clear the browser key `3dw-demo-jobs` to restore the original sample jobs.
