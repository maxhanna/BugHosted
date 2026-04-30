# General Skills (Always Do)

These skills must be loaded and followed for every Copilot chat request, regardless of keywords:

- Always validate that all code compiles before completing a task.
- Prefer small, incremental patches over large changes.
- Place new code in the most contextually appropriate location, not just at the top or bottom of files.
- Follow project folder and import conventions.
- Keep skill files under 15,000 tokens; rewrite and shorten if exceeded.
- All functions must have an explicit return type; do not rely on type inference for function returns.
- Never use the `any` type in any logic; use explicit, safe types and proper narrowing instead.