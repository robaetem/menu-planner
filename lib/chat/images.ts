import type { UIMessage } from "ai";

export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const DATA_URL = /^data:image\/(jpeg|png|webp|gif);base64,/;

const isImage = (p: UIMessage["parts"][number]) => p.type === "file";

/** Keep image parts only in the last user message; elsewhere they become a "[foto]" text part. */
export function stripOldImages(messages: UIMessage[]): UIMessage[] {
  let keep = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      keep = i;
      break;
    }
  }
  return messages.map((m, i) =>
    i === keep || !m.parts.some(isImage)
      ? m
      : { ...m, parts: m.parts.map((p) => (isImage(p) ? { type: "text" as const, text: "[foto]" } : p)) },
  );
}

/** Image data URLs of the last user message that has images (max 3). */
export function latestImages(messages: UIMessage[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    const urls = messages[i].parts.flatMap((p) => (p.type === "file" ? [p.url] : []));
    if (urls.length) return urls.slice(0, MAX_IMAGES);
  }
  return [];
}

/** Dutch error text when the (already stripped) messages hold a bad file part, else null. */
export function imageError(messages: UIMessage[]): string | null {
  for (const m of messages) {
    const files = m.parts.filter((p) => p.type === "file") as { url: string }[];
    if (files.length > MAX_IMAGES) return "Maximaal 3 foto's per bericht";
    for (const f of files) {
      if (typeof f.url !== "string" || !DATA_URL.test(f.url)) return "Alleen foto's (jpeg, png, webp of gif) kunnen mee";
      if (f.url.length * 0.75 > MAX_IMAGE_BYTES) return "Een foto is te groot (max 3 MB)";
    }
  }
  return null;
}
