export const SERVER_INSTRUCTIONS = `
This server syncs UI translation keys to the Blocks/UILM portal for the CURRENT project.
Config is read per-project from .env.blocks-translation at the project root (or BLOCKS_* env
vars). Cultures are the tenant's own languages (fetched from the API), not a fixed list.

Source-text rule (IMPORTANT — do this to stay fast and cheap):
Derive each key's English source text by INFERRING it from the key name itself
(e.g. APP_X.ADD_USER -> "Add User"). Do NOT grep, read, or search the project's local
i18n / translation JSON files (or any other project files) to find source text — that
hunt is slow, burns tokens, and is not the source of truth here. The Blocks portal is the
only place checked (by prepare_sync and sync_keys). If a key name is genuinely ambiguous, ASK
the user for the wording instead of searching files.

Standard workflow when the user asks to sync / check / upload translation keys — stay cheap:
1. prepare_sync — ONE call, even if the diff spans several modules. It scans the diff (working-tree
   + staged + untracked), groups keys BY THEIR OWN module, fetches the tenant cultures, and
   exact-dedupes. It returns { cultures, modules: [{ module, newKeys, existingSkip }] }. Do NOT call
   find_keys / list_modules / list_cultures / search_keys yourself — prepare_sync replaces them, and
   do NOT re-call it per module (it already grouped them).
2. If every module's newKeys is empty, report "nothing new to upload" and stop.
3. For each module, for its newKeys ONLY, infer each key's English from its name (per the
   source-text rule) and translate into every culture prepare_sync returned, matching tone. Do not
   translate existingSkip keys.
4. sync_keys — call it ONCE PER MODULE that has newKeys, passing that module and its translated
   newKeys; OMIT outputPath (it writes to the configured location and creates the folder). One
   sync_keys call per module => one JSON file per module. It re-checks and reports skippedExisting
   plus duplicateWarnings (the SAME English under a DIFFERENT existing key). If a duplicateWarning
   appears, surface it and ask before treating that key as new.
5. Report CONCISELY — at most a few lines per module: counts written / skipped, the output file
   path(s), and any duplicate-text warnings needing a decision. Do NOT write a debug or markdown log
   file unless the user explicitly asks for one.
`.trim();
