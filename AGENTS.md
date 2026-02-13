# AGENTS.md

Operational guidance for coding agents working in this repository.
Use this as default behavior unless the user gives more specific instructions.

## Rule precedence and external rule files

1. Direct user instructions
2. Repository-specific rule files (if present)
3. This AGENTS.md

Checked for additional rule files:

-   `.cursorrules`: not found
-   `.cursor/rules/`: not found
-   `.github/copilot-instructions.md`: not found

If any of these files appear later, follow them and update this file.

## Project snapshot

-   Node.js project using ESM (`"type": "module"`)
-   Main entrypoint: `index.js`
-   Main code: `src/`
-   Unit tests: `test/unit` (Mocha + Chai + Sinon)
-   BDD tests: `test/bdd` (Cucumber, `.feature` + `.mjs` steps)
-   DI container: Awilix (`src/service/dependency-injection.js`)
-   Lint stack: ESLint (`airbnb/base` + `prettier`) and Prettier

## Environment defaults

-   Prefer Node.js 20.x (CI uses `actions/setup-node@v3` with `node-version: 20.x`)
-   `package.json` allows Node >=16 and npm >=8, but use Node 20 for CI parity
-   Install dependencies with `npm install`
-   Infra commonly required for local runs/tests:
    -   MySQL on `localhost:3306`
    -   Blazegraph (`blazegraph.jar`) for BDD flows
    -   Redis on default port for full startup scenarios
-   Typical local env:
    -   `REPOSITORY_PASSWORD=password`
    -   `JWT_SECRET=test-secret`

## Build, run, lint, and test commands

-   Build-equivalent (contract compile): `npm run compile-contracts`
-   Install + compile: `npm install && npm run compile-contracts`
-   Run node: `npm start`
-   Run bootstrap config: `npm run bootstrap-node`
-   Start local blockchain: `npm run start:local_blockchain -- 8545`
-   Start local blockchain v1: `npm run start:local_blockchain:v1 -- 8545`
-   Start local blockchain v2: `npm run start:local_blockchain:v2 -- 8545`
-   Stop local blockchain: `npm run kill:local_blockchain -- 8545`
-   Lint: `npm run lint`
-   Lint staged files: `npm run lint-staged`
-   Format all common files: `npx prettier --write "**/*.{js,json,mjs,md,yml,yaml}"`
-   Pre-commit hook runs `npm run lint-staged`

Test suites:

-   Unit tests: `npm run test:unit`
-   Module-focused tests: `npm run test:modules`
-   BDD tests (default): `npm run test:bdd`
-   BDD release tags: `npm run test:bdd:release`
-   BDD publish-errors tags: `npm run test:bdd:publish-errors`
-   BDD update-errors tags: `npm run test:bdd:update-errors`
-   BDD get-errors tags: `npm run test:bdd:get-errors`

Current CI checks:

-   `npm run lint`
-   `npm run test:bdd`

## Running a single test (important)

`npm run test:unit` expands `$(find test/unit -name '*.js')`, so use direct Mocha/Cucumber calls for single-test runs.

-   Unit file: `npx mocha --exit test/unit/service/get-service.test.js`
-   Unit file + coverage: `npx nyc --all mocha --exit test/unit/service/get-service.test.js`
-   Unit by name: `npx mocha --exit test/unit/service/get-service.test.js --grep "Completed get"`
-   BDD feature: `npx cucumber-js --config cucumber.js --format progress --format-options '{"colorsEnabled": true}' test/bdd/features/smoke.feature --import test/bdd/steps/ --exit`
-   BDD scenario by name: `npx cucumber-js --config cucumber.js --format progress --format-options '{"colorsEnabled": true}' test/bdd/ --import test/bdd/steps/ --name "Setting up and Checking Uptime of Nodes by Info API Calls" --exit`
-   BDD tag example: `npx cucumber-js --config cucumber.js --tags "@smoke" --format progress --format-options '{"colorsEnabled": true}' test/bdd/ --import test/bdd/steps/ --exit`

## Code style guidelines

### Modules and imports

-   Use ESM imports/exports (`import`, `export default`, named exports)
-   Use explicit local file extensions (`./service.js`)
-   Prefer import grouping: external packages, project imports, relative imports
-   Keep one blank line between import groups
-   Use `createRequire(import.meta.url)` only where require semantics are needed (for example ABI JSON)

### Formatting and lint

-   Prettier: `tabWidth: 4`, `singleQuote: true`, `semi: true`, `trailingComma: all`
-   Prettier: `printWidth: 100`, `arrowParens: always`
-   ESLint extends `airbnb/base` and `prettier`
-   `no-console` is warn; prefer logger in runtime code
-   `linebreak-style` is unix
-   `import/extensions` is disabled, but ESM still needs explicit local extensions

### Types and docs

-   This codebase is JavaScript, not TypeScript
-   Use JSDoc for non-trivial public methods and complex structures
-   Reuse constants/enums from `src/constants/constants.js` instead of ad hoc literals

### Naming conventions

-   Files: kebab-case (`get-service.js`, `publish-http-api-controller-v1.js`)
-   Classes: PascalCase (`GetService`, `BaseController`)
-   Variables/functions: camelCase
-   Constants: UPPER_SNAKE_CASE
-   Boolean-like names: `is*`, `has*`, `can*`, `should*`
-   Versioned HTTP artifacts: `*-v0.js`, `*-v1.js`
-   Migrations: timestamp prefix + kebab-case description

### Architecture and flow

-   Pass dependencies through constructor `ctx` objects
-   Register long-lived runtime dependencies in Awilix
-   Reuse base classes/patterns (`OperationService`, `Command`, module managers)
-   Prefer extending existing managers/services before adding parallel abstractions

### Async, errors, and logging

-   Use `async`/`await` consistently
-   Use `Promise.all` for independent async operations
-   Keep `await` in loops only when sequencing is truly required
-   Never swallow errors silently
-   In controllers/services, log context-rich messages and mark failed operations through existing flows
-   In command handlers, use existing `handleError`/`recover` patterns
-   Prefer `this.logger.*` in runtime code; avoid new `console.*` unless following existing entrypoint/test style

### API and validation

-   Keep HTTP request schema updates in versioned files under `src/controllers/http-api/*/request-schema`
-   Maintain v0/v1 compatibility unless task explicitly requires a breaking change
-   Validate new input fields with existing validation middleware/service patterns

### Tests

-   Keep unit tests in `test/unit/**/*.test.js`
-   Keep BDD steps in `test/bdd/steps/**/*.mjs`
-   Add or update tests when changing commands/services/controllers
-   Never leave accidental `describe.only` or `it.only`

## Agent change checklist

-   Read neighboring code before editing to match local patterns
-   Make the smallest viable change
-   Reuse helpers/constants and avoid duplicate logic
-   Run targeted tests first, then broader suites as needed
-   Run `npm run lint` after meaningful edits
-   Avoid committing secrets (`.env`) or generated runtime data folders (`data*`, logs)
-   Do not force-push or rewrite shared branch history
