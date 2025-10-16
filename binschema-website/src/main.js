import './style.css';
import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: true,
  mangle: false
});

const EXAMPLES = [
  {
    id: 'superchat',
    name: 'SuperChat Protocol',
    description: 'End-to-end frame format for the SuperChat messaging stack.',
    schema: 'examples/superchat-protocol.json',
    types: 'examples/superchat-types.json',
    docs: 'examples/protocol-docs.html'
  },
  {
    id: 'dns',
    name: 'DNS RFC 1035',
    description: 'Complete DNS message implementation including compression pointers.',
    schema: 'examples/dns-protocol.json',
    types: 'examples/dns-types.json',
    docs: 'examples/dns-docs.html'
  },
  {
    id: 'sensornet',
    name: 'SensorNet Telemetry',
    description: 'Binary telemetry format for low-power sensor networks.',
    schema: 'examples/sensornet-protocol.json',
    types: 'examples/sensornet-types.json',
    docs: 'examples/sensornet-docs.html'
  }
];

let typeReferenceUrl = null;
let activeExampleDocUrl = null;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractIntro = (markdown) => {
  const firstHeadingIndex = markdown.indexOf('\n## ');
  return firstHeadingIndex === -1 ? markdown : markdown.slice(0, firstHeadingIndex).trim();
};

const extractSection = (markdown, heading) => {
  const pattern = new RegExp(`(^|\\n)## ${escapeRegExp(heading)}[\\s\\S]*?(?=\\n##\\s+|$)`, 'm');
  const match = markdown.match(pattern);
  return match ? match[0].trim() : '';
};

const renderShell = () => {
  const app = document.querySelector('#app');
  app.innerHTML = `
    <header class="site-header">
      <div class="container">
        <div class="branding">
          <div class="logo">BinSchema</div>
          <p class="tagline">Bit-level binary schema generator with multi-language tooling.</p>
        </div>
        <nav class="site-nav">
          <a href="#overview">Overview</a>
          <a href="#usage">Usage</a>
          <a href="#schema-reference">Schema Reference</a>
          <a href="#examples">Examples</a>
          <a href="https://github.com/aeolun/superchat/tree/main/tools/binschema" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="container hero-content">
          <div>
            <h1>Define Binary Protocols Once, Generate Everywhere</h1>
            <p>BinSchema turns declarative, bit-precise schemas into production-ready encoders, decoders, and documentation for Go, TypeScript, Rust, and beyond.</p>
            <div class="cta-group">
              <a class="cta primary" href="#usage">Get Started</a>
              <a class="cta secondary" href="#schema-reference">Explore the Schema</a>
            </div>
          </div>
        </div>
      </section>

      <section id="overview" class="content-section">
        <div class="container">
          <h2>Overview</h2>
          <div id="overview-content" class="markdown">Loading overview…</div>
        </div>
      </section>

      <section id="usage" class="content-section alt">
        <div class="container">
          <h2>Usage</h2>
          <p class="section-lead">Use BinSchema to define protocols and generate strongly typed encoders and decoders.</p>
          <div id="usage-content" class="markdown">Loading usage guide…</div>
        </div>
      </section>

      <section id="schema-reference" class="content-section">
        <div class="container">
          <h2>Schema Definition Reference</h2>
          <p class="section-lead">Full reference for every field and construct available in a BinSchema definition.</p>
          <div id="type-reference-container" class="iframe-container">
            <div class="loader">Loading type reference…</div>
          </div>
        </div>
      </section>

      <section id="examples" class="content-section alt">
        <div class="container">
          <h2>Examples</h2>
          <p class="section-lead">Explore real-world schemas and the documentation generated directly from them.</p>
          <div class="examples-layout">
            <div id="examples-list" class="examples-list"></div>
            <div id="example-preview" class="example-preview">
              <div class="placeholder">Select an example to see its generated documentation and schema.</div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <div class="container">
        <p>&copy; ${new Date().getFullYear()} BinSchema. Built for protocol engineers.</p>
      </div>
    </footer>
  `;
};

const renderReadmeSections = async () => {
  const overviewEl = document.querySelector('#overview-content');
  const usageEl = document.querySelector('#usage-content');

  try {
    const response = await fetch('docs/README.md');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const markdown = await response.text();
    const pieces = [];

    const intro = extractIntro(markdown);
    if (intro) pieces.push(intro);

    const philosophy = extractSection(markdown, 'Philosophy');
    if (philosophy) pieces.push(philosophy);

    const features = extractSection(markdown, 'Features');
    if (features) pieces.push(features);

    overviewEl.innerHTML = marked.parse(pieces.join('\n\n'));

    const usageSection = extractSection(markdown, 'Usage');
    if (usageSection) {
      usageEl.innerHTML = marked.parse(usageSection);
    } else {
      usageEl.innerHTML = '<p class="error">Usage documentation is not available at the moment.</p>';
    }
  } catch (error) {
    overviewEl.innerHTML = '<p class="error">Unable to load README content. Ensure docs have been prepared.</p>';
    usageEl.innerHTML = '<p class="error">Unable to load README content. Ensure docs have been prepared.</p>';
    console.error('Failed to load README.md:', error);
  }
};

const loadTypeReference = async () => {
  const container = document.querySelector('#type-reference-container');
  container.innerHTML = '<div class="loader">Loading type reference…</div>';

  try {
    const response = await fetch('docs/type-reference.html');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    if (typeReferenceUrl) {
      URL.revokeObjectURL(typeReferenceUrl);
    }
    typeReferenceUrl = url;

    const iframe = document.createElement('iframe');
    iframe.title = 'BinSchema Type Reference';
    iframe.src = url;
    iframe.loading = 'lazy';
    iframe.className = 'embedded-doc';
    iframe.addEventListener('load', () => {
      const loader = container.querySelector('.loader');
      if (loader) loader.remove();
    });

    container.innerHTML = '';
    container.appendChild(iframe);
  } catch (error) {
    container.innerHTML = '<p class="error">Type reference documentation could not be loaded. Run <code>npm run prepare:docs</code> first.</p>';
    console.error('Failed to load type reference:', error);
  }
};

const renderExamplesList = () => {
  const listEl = document.querySelector('#examples-list');
  listEl.innerHTML = '';

  EXAMPLES.forEach((example, index) => {
    const button = document.createElement('button');
    button.className = 'example-card';
    button.dataset.exampleId = example.id;
    button.innerHTML = `
      <h3>${example.name}</h3>
      <p>${example.description}</p>
    `;

    button.addEventListener('click', () => selectExample(example.id));

    listEl.appendChild(button);

    if (index === 0) {
      selectExample(example.id);
    }
  });
};

const highlightActiveExample = (exampleId) => {
  document.querySelectorAll('.example-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.exampleId === exampleId);
  });
};

const loadExampleDocumentation = async (example, previewEl) => {
  const docContainer = previewEl.querySelector('.example-doc');
  const iframe = previewEl.querySelector('#example-doc-frame');
  const loader = docContainer.querySelector('.loader');

  try {
    const response = await fetch(example.docs);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    if (activeExampleDocUrl) {
      URL.revokeObjectURL(activeExampleDocUrl);
    }
    activeExampleDocUrl = url;

    iframe.src = url;
    iframe.addEventListener('load', () => {
      loader.remove();
      iframe.classList.add('visible');
    }, { once: true });
  } catch (error) {
    docContainer.innerHTML = `<p class="error">Failed to load generated documentation for ${example.name}. Ensure docs have been prepared.</p>`;
    console.error(`Failed to load documentation for ${example.id}:`, error);
  }
};

const loadExampleJson = async (url, target, label) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    target.textContent = JSON.stringify(json, null, 2);
  } catch (error) {
    target.textContent = `// Unable to load ${label}. Run npm run prepare:docs before starting the dev server.`;
    console.error(`Failed to load ${label}:`, error);
  }
};

const selectExample = (exampleId) => {
  const example = EXAMPLES.find((item) => item.id === exampleId);
  if (!example) return;

  highlightActiveExample(exampleId);

  const previewEl = document.querySelector('#example-preview');
  const typesLink = example.types
    ? `<a href="${example.types}" target="_blank" rel="noreferrer">Shared Types JSON</a>`
    : '';
  const typesDetails = example.types
    ? `<details class="example-json">
      <summary>Shared Types</summary>
      <pre><code id="example-types-json">Loading types…</code></pre>
    </details>`
    : '';

  previewEl.innerHTML = `
    <div class="example-meta">
      <div>
        <h3>${example.name}</h3>
        <p>${example.description}</p>
      </div>
      <div class="example-links">
        <a href="${example.schema}" target="_blank" rel="noreferrer">Protocol Schema JSON</a>
        ${typesLink}
        <a href="${example.docs}" target="_blank" rel="noreferrer">Generated Docs (raw)</a>
      </div>
    </div>
    <div class="example-doc">
      <div class="loader">Loading generated documentation…</div>
      <iframe id="example-doc-frame" title="${example.name} documentation" class="embedded-doc"></iframe>
    </div>
    <details class="example-json" open>
      <summary>Protocol Schema</summary>
      <pre><code id="example-schema-json">Loading schema…</code></pre>
    </details>
    ${typesDetails}
  `;

  const schemaTarget = previewEl.querySelector('#example-schema-json');
  const typesTarget = previewEl.querySelector('#example-types-json');

  loadExampleDocumentation(example, previewEl);
  loadExampleJson(example.schema, schemaTarget, `${example.name} protocol schema`);
  if (example.types && typesTarget) {
    loadExampleJson(example.types, typesTarget, `${example.name} shared types`);
  }
};

const init = async () => {
  renderShell();
  await renderReadmeSections();
  await loadTypeReference();
  renderExamplesList();
};

window.addEventListener('DOMContentLoaded', init);
