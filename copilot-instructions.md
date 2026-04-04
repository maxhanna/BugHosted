## AI Copilot Skill & Lessons Learned Flow

1. **Skill Detection & Loading**
	- On every user prompt, scan for keywords (e.g., "validate", "format", "angular", "c#") and check the file context (e.g., editing a .cs file).
	- Immediately load all relevant skill files from the /skills directory before taking any action or generating a response.
	- If multiple skills apply, load all relevant skill files and combine their guidance.

2. **Task Execution**
	- Follow the best practices and rules from the loaded skill file(s) while performing the requested task.

3. **Lessons Learned Logging**
	- After completing the task, write a "lessons learned" entry in each relevant skill file (e.g., /skills/validation/ai-skill.md for validation tasks).
	- Each entry must be concise, factual, and focused on actionable insights for future tasks within that skill domain.

+4. **AI-HISTORY.md as Overarching Guide**
	- Use /skills/ai-history.md for general, cross-domain best practices and meta-guidance that apply to all skills and workflows.
	- Only add broadly applicable insights to /skills/ai-history.md.
	- If /skills/ai-history.md exceeds 15,000 tokens, summarize and trim to retain only the most important, recent insights.

5. **Skill File Summarization**
	- If any skill file exceeds 15,000 tokens, summarize and rewrite it to retain only the most up-to-date, concise, and actionable information.

6. **Continuous Improvement**
	- At the start of each new task, review AI-HISTORY.md for general guidance and load the relevant skill files for specific best practices.
	- Apply both general and domain-specific lessons to avoid repeating mistakes and to improve performance over time.
 
# Copilot Instructions (read before handling requests)

These are project-specific guidelines that must be followed for every change.

## Project environment
- Angular version: 19.x (see maxhanna.client/package.json dependencies)


## Skills Guidance
For detailed rules and best practices, see the appropriate skill file in the /skills directory:
- Frontend Angular: /skills/frontend-angular/ai-skill.md
- Backend C#: /skills/backend-csharp/ai-skill.md
- Formatting: /skills/formatting/ai-skill.md
- Validation: /skills/validation/ai-skill.md


## Lessons Learned Logging (AI-HISTORY.md)
- At the end of every response, the assistant must include a "lessons learned" section written to AI-HISTORY.md in the root of this repo.
- This section should record what worked, what failed, and why things were done a certain way, focusing on actionable insights for future tasks.
- The assistant should read AI-HISTORY.md at the start of every new task to avoid repeating mistakes and to build on past successes.
- The "lessons learned" section must be concise, factual, and focused on practical improvements.
- The assistant is encouraged to reflect on its own performance and identify areas for improvement in the "lessons learned" section.
- When AI-HISTORY.md or any sub-skill file exceeds 15,000 tokens, the assistant should summarize key insights and remove older entries to keep the file manageable and focused on recent learnings.

- Ask the user for clarification rather than making assumptions that change UI behavior.

---
Keep this file up to date when project conventions change.
# Copilot Instructions for Code Editing

## General Workflow
- Before making any code change, ensure the code compiles and is free of errors.
 - All edits must produce code that compiles successfully before being saved or committed. For server changes run `dotnet build` in `maxhanna.Server`; for client changes run `tsc` or your Angular build step. Fix any compile errors first.
- Use the latest Angular standards and best practices for all frontend work.
- Avoid deprecated or discouraged patterns (e.g., do not use `ngModel`).
- Prefer `[value]` and `(input)` for input binding, and `[class]` for dynamic classes instead of `[ngClass]`.
- Always validate that your changes do not introduce new errors or warnings.
- If a change would break compilation, do not apply it and notify the user.
- Document any non-trivial changes or refactors in commit messages or comments as appropriate.



---
This file should be referenced by the agent before making any code edits in this workspace. When component general behavior or purpose changes, update README.md Component Overview section.

