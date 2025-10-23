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

## Docker

Build the production image from the repository root so the BinSchema docs are available during the build:

```bash
docker build -f binschema-website/Dockerfile -t binschema-website .
```

Run the container and expose it locally:

```bash
docker run --rm -p 8080:80 binschema-website
```

The site will be available at http://localhost:8080.
