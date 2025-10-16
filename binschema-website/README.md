# BinSchema Website

Marketing site for the BinSchema project. It showcases the schema definition reference, usage docs, and live examples generated from the schemas in `tools/binschema`.

## Local development

```bash
npm install
npm run dev
```

`npm run dev` automatically copies the latest BinSchema documentation and example outputs into the local `public/` directory via `npm run prepare:docs`.

## Building for production

```bash
npm install
npm run build
```

The generated site will be available in `dist/`. Run `npm run prepare:docs` whenever the BinSchema docs or examples change to ensure the site stays in sync.
