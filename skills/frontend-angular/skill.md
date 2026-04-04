# Skill File Summarization
If this skill file exceeds 15,000 tokens, summarize and rewrite it to retain only the most up-to-date, concise, and actionable information, just like AI-HISTORY.md.
# Frontend Angular Skills

## Template & Binding Rules
- Do NOT use `ngClass`. Use string-based `[class]` or explicit boolean class bindings (e.g. `[class.foo]="cond"`).
- Do NOT use `[ngModel]`; use `[value]` and `(input)` handlers.
- Use explicit boolean attribute bindings (e.g. `[disabled]`).

## Angular Considerations
- Prefer explicit getters in components for computed template values.
- Avoid template expressions that call heavy functions repeatedly; cache values in component properties/getters.

## Template Formatting
- Keep `[class]` expressions readable; prefer a component getter that returns a single spaced class string.

## Accessibility & UX
- When adding interactive controls, include a `title` attribute for tooltips and a visible label when practical.

## Angular Specifics
- Do NOT assign values or call multiple expressions directly in HTML event handlers. Use a function in the TypeScript file and call it from the template.
- Use standalone components and modules where possible.
- Prefer reactive forms over template-driven forms for complex input handling.
- Use `[value]` and `(input)` for input elements.
- Use `[class]` for dynamic class binding.
- Follow Angular style guide for file and folder structure.
- Use HttpClient for all HTTP requests.
- Avoid use of `any` type; prefer explicit interfaces and types.
- Use Observables and RxJS for async operations.

## Editing Style
- When adding new methods to a component, append them at the end of the class.
- Place loose component properties/variables near the top of the class.
- Place newly added functions and helper methods at the bottom of the class.

## Error Handling
- After every edit, check for compile and lint errors. Fix before proceeding.
- If unable to fix, notify the user and halt further edits.

## Commit/Change Documentation
- Summarize the purpose of each change in a comment or commit message.
- For multi-file changes, list affected files and a brief description of the change.
