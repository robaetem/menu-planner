export const RECIPE_IMAGE_BUCKET = "recipe-images";
export const RECIPE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const RECIPE_IMAGE_URL_MAX_LENGTH = 2048;
export const RECIPE_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export const RECIPE_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function normalizeRecipeImageUrl(value: string | null | undefined): string | null {
  const clean = value?.trim();
  if (!clean || clean.length > RECIPE_IMAGE_URL_MAX_LENGTH) return null;
  try {
    const url = new URL(clean);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

export function isRemoteRecipeImagePath(path: string | null | undefined): boolean {
  return normalizeRecipeImageUrl(path) !== null;
}

export function getRecipeImageUrl(path: string | null | undefined): string | null {
  const clean = path?.trim();
  if (!clean) return null;
  const remoteUrl = normalizeRecipeImageUrl(clean);
  if (remoteUrl) return remoteUrl;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/${RECIPE_IMAGE_BUCKET}/${clean}`;
}
