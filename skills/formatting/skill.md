# Skill File Summarization
If this skill file exceeds 15,000 tokens, summarize and rewrite it to retain only the most up-to-date, concise, and actionable information, just like AI-HISTORY.md.
# Formatting Skills

## Control-flow & Formatting Rules
- Never write `if true` as a single-line condition. Always use a braced form: `if { true }`.
- Always format `if` statements and `for` loops as multi-line blocks with braces and line breaks, even for single-line bodies.
- When writing SQL blocks, prefer multi-line, verbatim string blocks (C# @"...") and avoid packing SQL into single-line statements.

## SQL String Style
- Use C# verbatim multiline string syntax with @"..." for SQL blocks. Do not use concatenated strings or string interpolation for SQL content.
- Prettify SQL inside the @"" block: align keywords, break long clauses to multiple lines, and keep parameters intact.
- When executing SQL, use parameterized commands and do not inline values into the SQL text.

# HTML Popup Panel Placement
- Always add new popup panels at the bottom of HTML files.

# Code Placement
- Always place new variables (e.g., public isSystemSelectPanelOpen = true) next to other similar variables in the class.
- Always place new functions below other functions already in the file, maintaining logical grouping and order.
- Validate that all new code is inserted at the correct location for readability and maintainability.
