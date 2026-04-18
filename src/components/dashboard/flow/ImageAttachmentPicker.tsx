"use client";

import { useState, useEffect } from "react";
import { ImageIcon } from "lucide-react";

interface KnowledgeImage {
  id: string;
  url: string;
  description: string;
  tags: string[];
}

interface ImageAttachmentPickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function ImageAttachmentPicker({ selectedIds, onChange }: ImageAttachmentPickerProps) {
  const [images, setImages] = useState<KnowledgeImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/knowledge/images/list")
      .then((res) => (res.ok ? res.json() : { images: [] }))
      .then((data) => setImages(data.images ?? []))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (loading) {
    return <p className="text-xs text-[var(--ws-text-muted)]">Loading images...</p>;
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--ws-border-strong)] px-3 py-2">
        <ImageIcon className="h-4 w-4 text-[var(--ws-text-muted)]" />
        <p className="text-xs text-[var(--ws-text-muted)]">
          No images available. Upload images in the Knowledge Base tab first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {images.map((img) => (
        <label
          key={img.id}
          className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--ws-border)] px-3 py-2 transition-colors hover:bg-[var(--ws-page)]"
        >
          <input
            type="checkbox"
            checked={selectedIds.includes(img.id)}
            onChange={() => toggle(img.id)}
            aria-label={img.description}
            className="h-4 w-4 rounded border-[var(--ws-border-strong)] text-[var(--ws-accent)]"
          />
          <img
            src={img.url}
            alt={img.description}
            className="h-8 w-8 rounded object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-[var(--ws-text-primary)]">{img.description}</p>
            {img.tags.length > 0 && (
              <p className="truncate text-xs text-[var(--ws-text-muted)]">
                {img.tags.join(", ")}
              </p>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}
