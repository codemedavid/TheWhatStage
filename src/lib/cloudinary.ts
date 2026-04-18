import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Validate an image file's type and size before upload.
 * Throws a descriptive error if validation fails.
 */
export function validateImageFile(file: File): void {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new ValidationError(
      `Invalid file type: ${file.type}. Allowed: jpeg, png, webp, gif`
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: 10MB`
    );
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Upload an image buffer to Cloudinary.
 * Returns the secure URL and public ID.
 */
export async function uploadImage(
  buffer: Buffer,
  tenantId: string
): Promise<UploadResult> {
  const result = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `whatstage/${tenantId}/knowledge`,
          resource_type: "image",
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error("Upload failed"));
          resolve(result);
        }
      );
      stream.end(buffer);
    }
  );

  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * Delete an image from Cloudinary by its public ID.
 */
export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId);
}
