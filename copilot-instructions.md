# Copilot Instructions for Code Editing

## General Workflow
- Before making any code change, ensure the code compiles and is free of errors.
- Use the latest Angular standards and best practices for all frontend work.
- Avoid deprecated or discouraged patterns (e.g., do not use `ngModel`).
- Prefer `[value]` and `(input)` for input binding, and `[class]` for dynamic classes instead of `[ngClass]`.
- Always validate that your changes do not introduce new errors or warnings.
- If a change would break compilation, do not apply it and notify the user.
- Document any non-trivial changes or refactors in commit messages or comments as appropriate.

## Angular Specifics
 - Do NOT assign values or call multiple expressions directly in HTML event handlers (e.g., `(input)="fileSearchComponent.searchTerms = $event.target.value; fileSearchComponent.getDirectory();"`).
	 Instead, create a function in the TypeScript file and call it from the template (e.g., `(input)="onSearchInput($event)"`).
- Use standalone components and modules where possible.
- Prefer reactive forms over template-driven forms for complex input handling.
- Use `[value]` and `(input)` for input elements.
- Use `[class]` for dynamic class binding.
- Follow Angular style guide for file and folder structure.
- Use HttpClient for all HTTP requests.
- Avoid use of `any` type; prefer explicit interfaces and types.
- Use Observables and RxJS for asynchronous operations.

## Backend (C#) Specifics
- Ensure all controller actions validate input and return appropriate status codes.
- Use async/await for all database and IO operations.
- Validate all user input before processing.
- Document API endpoints with comments.

## Editing Style for Adding Methods
- When adding new methods to an existing class, append them at the end of the class body (just before the final closing brace) rather than inserting them at the top of the class. This preserves the original logical ordering and minimizes merge conflicts.
- If adding multiple related helper methods, group them together near other helpers (still placed at the end) and add a short comment header describing their purpose.
- For TypeScript/Angular components follow the same approach: append new component methods/properties to the end of the class in the TypeScript file.

## Error Handling
- After every edit, check for compile and lint errors.
- If errors are found, fix them before proceeding with further changes.
- If unable to fix, notify the user and halt further edits.

## Commit/Change Documentation
- Summarize the purpose of each change in a comment or commit message.
- For multi-file changes, list affected files and a brief description of the change.

---
This file should be referenced by the agent before making any code edits in this workspace. When component general behavior or purpose changes, update README.md Component Overview section.