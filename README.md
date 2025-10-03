# Vite TypeScript NPM Package

Scaffold TypeScript npm packages using this template to bootstrap your next library.

Built with **Vite** for fast builds and development with HMR, plus **vite-plugin-dts** for bundled type definitions.

> [!TIP]
> Looking for a JavaScript version of this template? Try: [Vite JavaScript NPM Package](https://github.com/jasonsturges/vite-npm-package)
>
> Or, try a tsup version of this template: [tsup NPM Package](https://github.com/jasonsturges/tsup-npm-package)


## Getting Started

Use this template via GitHub's "Use this template" button or:

```bash
gh repo create <name> --template="https://github.com/jasonsturges/vite-typescript-npm-package"
```

**Important**: Check package name availability before you start to avoid renaming later:

```bash
npm search <term>
```


## Usage

The following tasks are available:

- `npm run build` - Build production distributable (JS + types)
- `npm run dev` - Watch mode to detect changes (rebuilds dist/ and types)
- `npm start` - Vite dev server with HMR for local development
- `npm run build:types` - Build only TypeScript declarations

### Output Formats

This template builds multiple distribution formats:

- **ESM** (`dist/index.es.js`) - Modern ES modules
- **CommonJS** (`dist/index.cjs.js`) - Node.js compatibility
- **UMD** (`dist/index.umd.js`) - Universal module definition
- **IIFE** (`dist/index.iife.js`) - Browser global variable
- **Types** (`dist/index.d.ts`) - Bundled TypeScript declaration file

### Exports

Export everything from the top-level `index.ts` for inclusion in the build.

For example, if you have a `utils/` folder with an `arrayUtils.ts` file:

```ts
// src/utils/arrayUtils.ts
export const distinct = <T>(array: T[] = []) => [...new Set(array)];
```

Include that export in the top-level `index.ts`:

```ts
// src/index.ts
export { distinct } from "./utils/arrayUtils"
```


## Development

Multiple strategies for development are available.

### Local Development with HMR

Vite's dev server provides real-time HMR updates:

```bash
npm start
```

This starts Vite's dev server hosting `index.html` for local development with hot module replacement. This file is not included in the production build. Only exports from `src/index.ts` are bundled into the library.

The template includes a React app example, which can be replaced with Vue, Solid.js, Svelte, or any framework.

For UI projects, consider adding [Storybook](https://storybook.js.org/) to isolate component development.

### Watch Mode Development

For development with `npm link` or when working with other projects:

```bash
npm run dev
```

Vite detects changes and compiles all modules to `dist/`, including bundled type declarations.

### Linked Project Development

To test your library in other projects before publishing:

#### Using Link

1. **From this library**: Start watch mode and link the package
   ```bash
   npm run dev
   npm link
   ```

2. **From your app**: Link to this library
   ```bash
   npm link "mylib"
   ```

A symlink is created in your app's `node_modules/`. Changes to your library are automatically rebuilt and reflected in your app.

#### Using Pack

Create a tarball to test the exact package that will be published:

```bash
npm pack
```

This creates a `[name].tgz` tarball. Install it in your test app:

```bash
npm install /path/to/[name].tgz
```


## Development Cleanup

Once development completes, unlink both projects:

- **From your app**:
  ```bash
  npm unlink "mylib"
  ```

- **From your library**:
  ```bash
  npm unlink
  ```

If you forget to unlink, manually clean up:

**For yarn**:
```bash
rm -rf ~/.config/yarn/link/mylib
```

**For npm**:
```bash
sudo npm rm --global "mylib"
npm ls --global --depth 0  # confirm removal
```

Or simply reinstall dependencies in your app to clear symlinks:
```bash
rm -rf node_modules && npm install
```


## Release Publishing

Update your `package.json` to the next version number and tag a release.

### Configuration

Add `publishConfig` to your `package.json`:

```json
"publishConfig": {
  "registry": "https://registry.npmjs.org/",
  "access": "public"
}
```

For private GitHub packages:

```json
"publishConfig": {
  "registry": "https://npm.pkg.github.com/@MyOrg"
}
```

### Publishing

Before publishing, ensure a clean build:

```bash
rm -rf dist
npm run build
```

Verify your package name is available:

```bash
npm search <term>
```

Once ready to publish:

```bash
npm login
npm publish --access public
```


## Continuous Integration

For continuous integration with GitHub Actions, create `.github/workflows/publish.yml`

### Public NPM Packages

```yml
name: Publish Package to npmjs
on:
  release:
    types: [created]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Private GitHub Packages

```yml
name: Publish Package to GitHub Packages
on:
  release:
    types: [created]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: "https://npm.pkg.github.com"
          scope: "@MyOrg"
      - run: npm ci
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Setup Secrets

Obtain an "Automation" CI/CD access token from [npm](https://www.npmjs.com/) to bypass 2FA:
1. Click your profile image � Access Tokens
2. Generate a new Automation token

Add secrets to your repository:
1. Repository � Settings � Security � Secrets and variables � Actions
2. Add `NPM_TOKEN` secret

For more information:
- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
- [Publish to npmjs and GPR with npm](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#publish-to-npmjs-and-gpr-with-npm)
