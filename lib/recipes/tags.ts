// The recipe tags — used both as the toggle options in the recipe editor and as
// the filter chips on the Recepten page (same set, same order).
export const RECIPE_TAGS: { value: string; label: string }[] = [
  { value: "snel", label: "Snel" },
  { value: "verse groenten", label: "Verse groenten" },
  { value: "diepvriesvriendelijk", label: "Diepvriesvriendelijk" },
  { value: "zomer", label: "Zomer" },
  { value: "winter", label: "Winter" },
  { value: "pasta", label: "Pasta" },
];

export const RECIPE_TAG_VALUES = RECIPE_TAGS.map((t) => t.value);
