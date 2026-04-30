# Project Skills Loader 
- Always check the user's request for keywords and match them against the `/skills/SKILLS_LOADER.md` keyword-to-skill mapping. For each matched keyword, load the corresponding skill file(s) (e.g., `SKILL.md`, `*.instructions.md`) from the mapped folder(s) in `/skills/` before taking any other action.
- If a skill applies to the user's request, load and read the file(s) before taking any other action.
- If multiple skills are relevant, load all before proceeding.
- Skills in this folder contain best practices, domain knowledge, and project-specific workflows.
- Always read and apply the instructions in `general/ALWAYS_DO.md` for every Copilot chat request, regardless of keywords.

# SKILL FILE SIZE POLICY
# Each skill file must not exceed 15,000 tokens. If a skill file grows beyond this limit, rewrite it to keep only the most relevant skills and shorten each skill as much as possible while preserving clarity and utility.