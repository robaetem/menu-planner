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
attempts in every run). 66 questions: planning, history, recipes, freezer, shopping, settings, how the
app works, data changes and app changes. Judge: an LLM with a calendar and the ground truth from raw
selects.

| Run | Pass | Pass in at most 3 tool steps | Avg steps | Tool p50 / p95 / max |
| --- | --- | --- | --- | --- |
| Before (old tools) | 46.6% | 37.9% | 2.21 | 196 / 272 / 609 ms |
| After, run 1 | 95.4% | 93.8% | 1.08 | 109 / 231 / 295 ms |
| After, run 2 | 90.8% | 90.8% | 1.00 | 110 / 197 / 343 ms |
| After, run 3 | 92.3% | 92.3% | 1.11 | 114 / 225 / 348 ms |
| After, run 4 | 89.4% | 89.4% | 1.02 | 104 / 195 / 774 ms |

Reading the failures of the after runs by hand: about half are judge mistakes (it miscounts lists,
doubts correct weekdays, or misses a proposal that is in the log). The rest are the chat model: it
sometimes adds an ingredient from the method text, shows 5 days for "de komende 7 dagen" (the prompt
asks for 5), or counts a list wrong. Tool calls are 100-200 ms; spikes above 300 ms come from 5
questions running at once. Use `EVAL_JUDGE` to pick the judge (default `z-ai/glm-5.3-flash`, the
cheap chat model) and `--rejudge <label>` to grade an earlier run again without asking the chat.

## Tests

`scripts/test-chat-tools.ts`: static safety checks on `lib/chat` (no writes, table and import allow
lists, only `request_change` has a side effect, `proposeChange` has no execute, delete ops need
`userAskedToDelete: true`), helper and search tests, and with `CHAT_TEST_LOCAL_DB=1` apply and undo
on the LOCAL Supabase only: situation, a 10-op change, a failing op that rolls back, delete and undo
(same id back), recipe edit, photo link, undo twice refused, undo refused after a later edit. Every
undo is checked against a full snapshot of all household tables.
