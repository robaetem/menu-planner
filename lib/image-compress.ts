const MAX_SIDE = 1600;

/** Decode a photo, scale the longest side to <= 1600px and return a JPEG data URL (quality 0.8). */
export async function compressImage(file: File): Promise<string> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    source = bmp;
    width = bmp.width;
    height = bmp.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      source = img;
      width = img.naturalWidth;
      height = img.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (!width || !height) throw new Error("empty image");
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}
