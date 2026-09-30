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
- **Get a quote:** accepts an STL, OBJ or 3MF file name through the upload zone, collects print preferences and contact details, then creates a local sample job. The model preview is an illustrative sample; it does not parse the uploaded file. Price is illustrative.
- **Track an order:** recent orders and an individual status timeline. New requests appear here immediately.
- **Staff job board:** board and list views, search, draggable cards, and seven status stages.
- **Staff job detail:** specifications, quote, customer, notes, activity, progress, stage controls, print job sheet and simulated update action.

## Integration handoff

The screens and reusable UI primitives currently live in `app/page.tsx`; design tokens and responsive styles live in `app/globals.css`. The `Job` type and `stages` array define the shared order model. Replace the `initial` mock array and `localStorage` read/write with your API, connect the upload zone to file storage and a real 3D viewer, and replace the estimate formula with reviewed pricing. The “Send update” and download controls intentionally show prototype feedback only.

## Demo reset

Clear the browser key `3dw-demo-jobs` to restore the original sample jobs.
