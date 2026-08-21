import { describe, expect, it } from "vitest";

import { MAX_IMAGE_BYTES, selectImageFiles } from "../client/lib/attachments.js";

function file(name: string, type: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("image attachment selection", () => {
  it("accepts supported images within the remaining cap", () => {
    const result = selectImageFiles([file("one.png", "image/png"), file("two.webp", "image/webp")], 1);
    expect(result.files.map((item) => item.name)).toEqual(["one.png", "two.webp"]);
    expect(result.error).toBeNull();
  });

  it("reports rejected type, size, and cap instead of silently dropping files", () => {
    const result = selectImageFiles([
      file("page.html", "text/html"),
      file("large.jpg", "image/jpeg", MAX_IMAGE_BYTES + 1),
      file("one.png", "image/png"),
      file("two.gif", "image/gif"),
    ], 3);
    expect(result.files.map((item) => item.name)).toEqual(["one.png"]);
    expect(result.error).toBe("Use PNG, JPEG, GIF, or WebP images; keep each image under 3 MiB; attach at most 4 images.");
  });
});
