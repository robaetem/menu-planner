# Chat tools: coverage and eval

## What the chat can do

Read tools (select only, whitelisted tables): `getPlanning`, `findMeals`, `listRecipes`, `getRecipe`,
`getFreezer`, `getShoppingList`, `getSettings`, `appGuide`, `searchCode`, `listFiles`, `readFile`.

Data changes: `proposeChange` (no execute). The client shows a "Doen / Niet doen" card; after Doen it
posts `{ ops }` to `POST /api/chat/apply`, which validates the ops again, snapshots every household
table, runs the ops through the app's own server actions, keeps only the changed rows (before and
after) in `chat_data_changes`, and rolls everything back when one op fails. `POST
/api/chat/apply/<undoId>/undo` puts the rows back, unless someone edited them since (409, nothing written).

App changes: `request_change`, unchanged: the bot asks "Zal ik ...?" and calls it only after a yes.

## Coverage: every action in the app

| Screen action (server action) | Read | Change op |
| --- | --- | --- |
| Situation per person (setMode) | getPlanning, getSettings | setSituation |
| Day note (setDayNote) | getPlanning, findMeals (notes) | setDayNote |
| Plan a recipe (assignRecipe) | getPlanning | addMeal |
| Plan a potje (planPotje) | getPlanning, getFreezer | addPotjeMeal |
| Drag a meal (moveMeal) | getPlanning | moveMeal |
| Delete a meal (deleteMeal) | getPlanning | deleteMeal (only when asked) |
| Vleesjes of a meal (setMealVleesjes) | getPlanning (reserved, tekort) | setMealVleesjes |
| Freezer vegetables of a meal (setMealGroenten) | getPlanning | setMealGroenten |
| Extra potjes (setMealFreezer) | getPlanning | setExtraPotjes |
| Add days (extendDays) | getSettings (planning runs until) | extendPlanning |
| Situations list (create/update/deleteMode) | getSettings | create/rename/deleteSituation |
| Vleesjes (createVleesje, setVleesjeCount, deleteVleesje) | getFreezer | addVleesje, setVleesjeCount, deleteVleesje |
| Groenten (create/update/deleteGroente) | getFreezer | addGroente, updateGroente, deleteGroente |
| Potjes (createPotje, adjustPotje, deletePotje) | getFreezer | addPotjes, changePotjes, deletePotjes |
| Recipes (createRecipe, updateRecipe, deleteRecipe) | listRecipes, getRecipe | createRecipe, updateRecipe, deleteRecipe |
| Recipe photo link (setRecipeImageUrl, clearRecipeImage) | getRecipe (foto) | setRecipeImage, clearRecipeImage |
| Tags (create/update/deleteTag) | getSettings | createTag, renameTag, deleteTag |
| Shopping list text (saveShoppingDoc) | getShoppingList | addShoppingItems, checkShoppingItems, removeShoppingItems |
| Update from planning (generateShoppingList) | getShoppingList (herkomst) | updateShoppingFromPlanning |
| Shop sections (create/rename/deleteCategory, setIngredientCategory, recomputeCategories) | getSettings (with `ingredient`) | create/rename/deleteShoppingSection, setIngredientSection, recomputeShoppingSections |
| How the app works | system prompt, appGuide, searchCode, readFile | request_change (app changes) |

Not covered: uploading a photo file (the chat has no attachments; a link works), the light/dark
toggle (browser only), reordering meals inside one box, rewording one line of the shopping list
(remove + add works). Name suggestions (recordVleesjeName, recordPotjeName) follow from the create ops.

## Eval (`scripts/eval-chat-tools.ts`, production data, read only)

Same model, prompt and settings as `/api/chat`; `proposeChange` and `request_change` are stubbed as
approved, nothing is written (a fetch guard blocks every non-GET to Supabase and GitHub; 0 write
attempts in every run). 67 questions: planning, history, recipes, freezer, shopping, settings, how the
app works, data changes and app changes. Ground truth comes from raw selects.

Decided (Robin, 2026-11-07): only `z-ai/glm-5.3-flash` is used, also for evals, and there is no LLM
judge. The script prints question, truth, proposal and answer per case; grade them by reading. Keep
runs small: `--only id,id` with the 5-10 cases that matter.

| Run | Correct | Correct in at most 3 tool steps | Avg steps | Tool p50 / p95 / max |
| --- | --- | --- | --- | --- |
| Before (old tools, 58 questions, LLM judge) | 46.6% | 37.9% | 2.21 | 196 / 272 / 609 ms |
| After (66 questions, LLM judge, 4 runs) | 89.4-95.4% | 89.4-93.8% | 1.00-1.11 | 104-114 / 195-231 / 295-774 ms |
| After, final prompt, 10 key cases graded by hand | 10/10 | 10/10 | 1.3 | 123 / 181 / 181 ms |

The 10 hand-graded cases: "zet op 20/11 dat robin in gent zit", "verander Robin thuis eens naar
robin gent", "Zet Robin maandag op Gent", delete tomorrow's meal, "geen zin meer in de maaltijd van
morgen" (no delete, asks), move a meal a day, app change asks "Zal ik ...?" and only calls
`request_change` after "ja", potjes count, tonight's meal. Reading the LLM-judged failures by hand:
about half were judge mistakes; the rest were the chat model (an ingredient taken from the method
text, 5 days shown for "de komende 7 dagen" as the prompt asks, a miscounted list). Tool calls take
100-200 ms; spikes above 300 ms came from 5 questions running at once.

## Tests

`scripts/test-chat-tools.ts`: static safety checks on `lib/chat` (no writes, table and import allow
lists, only `request_change` has a side effect, `proposeChange` has no execute, delete ops need
`userAskedToDelete: true`), helper and search tests, and with `CHAT_TEST_LOCAL_DB=1` apply and undo
on the LOCAL Supabase only: situation, a 10-op change, a failing op that rolls back, delete and undo
(same id back), recipe edit, photo link, undo twice refused, undo refused after a later edit. Every
undo is checked against a full snapshot of all household tables.
