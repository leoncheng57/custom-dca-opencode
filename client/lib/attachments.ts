export const MAX_IMAGE_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export interface ImageAttachment {
  filename: string;
  mime: string;
  url: string;
}

export interface AttachmentSelection {
  files: File[];
  error: string | null;
}

export function selectImageFiles(files: Iterable<File>, currentCount: number): AttachmentSelection {
  const selected = [...files];
  const available = Math.max(0, MAX_IMAGE_ATTACHMENTS - currentCount);
  const accepted: File[] = [];
  let invalidType = false;
  let oversized = false;
  let overCap = false;

  for (const file of selected) {
    if (!IMAGE_MIME_TYPES.has(file.type)) {
      invalidType = true;
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      oversized = true;
      continue;
    }
    if (accepted.length >= available) {
      overCap = true;
      continue;
    }
    accepted.push(file);
  }

  const errors = [
    invalidType && "Use PNG, JPEG, GIF, or WebP images",
    oversized && "keep each image under 3 MiB",
    overCap && "attach at most 4 images",
  ].filter(Boolean);

  return { files: accepted, error: errors.length ? `${errors.join("; ")}.` : null };
}

export function readImageAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ filename: file.name || "pasted-image", mime: file.type, url: String(reader.result) });
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}
