export const RECIPE_IMAGE_BUCKET = "recipe-images";
export const RECIPE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const RECIPE_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export const RECIPE_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function getRecipeImageUrl(path: string | null | undefined): string | null {
  const clean = path?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!clean || !url) return null;
  return `${url}/storage/v1/object/public/${RECIPE_IMAGE_BUCKET}/${clean}`;
}
