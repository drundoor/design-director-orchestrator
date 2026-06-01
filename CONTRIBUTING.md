# Contributing

Keep contributions generic, public-safe, and fixture-driven.

## Public-Safety Rules

- Do not add private project names, customer data, local usernames, absolute
  machine paths, private screenshots, logs, browser history, or credentials.
- Use generic fixtures and examples.
- Keep referenced skills optional unless their license and attribution are
  included.
- Do not vendor screenshots, fonts, paid kits, templates, or copied website
  material without an explicit license record.

## Development

Run the script smoke tests before opening a pull request:

```sh
npm test
npm run smoke:web
npm run smoke:native
npm run smoke:native:fail
```

When adding a visual heuristic, add paired bad and fixed fixtures so the check
proves it catches the invariant without overfitting to one product.
