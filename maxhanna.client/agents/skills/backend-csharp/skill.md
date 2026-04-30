# User and FileEntry Construction (2026-04-05)
- When constructing a user object from the database, never include the password field in the returned object.
- The most important fields for a user object are: id, username, displayPictureFile, and profileBackgroundPictureFile.
- displayPictureFile and profileBackgroundPictureFile must be constructed as FileEntry objects (not just IDs), even if only the ID is available. If more file info is available (e.g., file name, directory), include it in the FileEntry.
- For anonymous users, use id = 0 and username = "Anonymous"; displayPictureFile and profileBackgroundPictureFile should be null.
- Always use the same construction logic for user objects in all controllers (e.g., RatingsController, UserController) to ensure consistency for frontend consumers.
- When joining user and file tables in SQL, prefer a single query that retrieves all needed fields for constructing the user and FileEntry objects in one shot.
- Never expose sensitive fields (like password) in any API response.
# Skill File Summarization
If this skill file exceeds 15,000 tokens, summarize and rewrite it to retain only the most up-to-date, concise, and actionable information, just like AI-HISTORY.md.
# Backend C# Skills

## General Workflow
- Ensure code compiles and is free of errors before saving/committing.
- For server changes, run `dotnet build` in `maxhanna.Server` and fix compile errors first.
- Always validate that changes do not introduce new errors or warnings.
- If a change would break compilation, do not apply it and notify the user.
- Document non-trivial changes or refactors in commit messages or comments.

## Backend C# Specifics
- Ensure all controller actions validate input and return appropriate status codes.
- Use async/await for all database and IO operations.
- Validate all user input before processing.
- Document API endpoints with comments.
- Place simple DTOs and helper classes under the controller's `DataContracts` folder as separate class files.
- Use manual, parameterized SQL with explicit transactions; prefer `async/await` and keep the transaction in the same method.
- Many database columns can be NULL. Always check `IsDBNull` before accessing values.
- Prefer the explicit `IsDBNull` pattern for nullable ints where callers expect a nullable result.
- Controllers use raw SQL in strings and helper methods under `Controllers/` and `Controllers/DataContracts/` for DTOs.
- When replacing expensive in-memory loops that join DB-backed sets, prefer moving the work into a single parameterized SQL query (CTE or grouped subquery).

## Editing Style
- When adding new methods to a class, append them at the end of the class body.
- If adding multiple related helpers, group them together near other helpers at the end.

## Error Handling
- After every edit, check for compile and lint errors. Fix before proceeding.
- If unable to fix, notify the user and halt further edits.

## Commit/Change Documentation
- Summarize the purpose of each change in a comment or commit message.
- For multi-file changes, list affected files and a brief description of the change.

## Tests & Verification
- For non-trivial server changes, prefer a tiny integration smoke check and collect error traces if the change hits production errors.
