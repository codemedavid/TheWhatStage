"use client";

import { useState, useRef, useEffect } from "react";
import { ImageIcon, X, Upload, FolderOpen } from "lucide-react";

interface KnowledgeImage {
  id: string;
  url: string;
  description: string;
}

interface ImageAttachmentPickerProps {
  selectedUrl: string | null;
  onSelect: (url: string) => void;
  onClear: () => void;
}

export default function ImageAttachmentPicker({
  selectedUrl,
  onSelect,
  onClear,
}: ImageAttachmentPickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "knowledge">("menu");
  const [images, setImages] = useState<KnowledgeImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setView("menu");
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "");
    fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: "POST", body: formData }
    )
      .then((res) => res.json())
      .then((data) => {
        if (data.secure_url) {
          onSelect(data.secure_url);
          setOpen(false);
          setView("menu");
        }
      })
      .catch(() => {});
  };

  const handleKnowledgeClick = async () => {
    setView("knowledge");
    setLoadingImages(true);
    try {
      const res = await fetch("/api/knowledge/images/list");
      if (res.ok) {
        const data = await res.json();
        setImages(data.images ?? []);
      }
    } catch {} finally {
      setLoadingImages(false);
    }
  };

  const handleImageSelect = (url: string) => {
    onSelect(url);
    setOpen(false);
    setView("menu");
  };

  if (selectedUrl) {
    return (
      <div className="relative inline-block">
        <img src={selectedUrl} alt="Attached image" className="h-10 w-10 rounded-lg border border-[var(--ws-border)] object-cover" />
        <button onClick={onClear} aria-label="Remove image" className="absolute -right-1.5 -top-1.5 rounded-full bg-[var(--ws-danger)] p-0.5 text-white">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={() => setOpen(!open)} aria-label="Attach image" className="rounded-full p-2.5 text-[var(--ws-text-muted)] transition-colors hover:bg-[var(--ws-page)] hover:text-[var(--ws-text-primary)]">
        <ImageIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute bottom-12 left-0 z-10 w-56 rounded-lg border border-[var(--ws-border)] bg-white py-1 shadow-[var(--ws-shadow-md)]">
          {view === "menu" && (
            <>
              <button onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--ws-text-secondary)] hover:bg-[var(--ws-page)]">
                <Upload className="h-4 w-4" />
                Upload from device
              </button>
              <button onClick={handleKnowledgeClick} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--ws-text-secondary)] hover:bg-[var(--ws-page)]">
                <FolderOpen className="h-4 w-4" />
                Knowledge Images
              </button>
            </>
          )}
          {view === "knowledge" && (
            <div className="max-h-48 overflow-y-auto">
              {loadingImages && <p className="px-3 py-2 text-xs text-[var(--ws-text-muted)]">Loading...</p>}
              {!loadingImages && images.length === 0 && <p className="px-3 py-2 text-xs text-[var(--ws-text-muted)]">No images found</p>}
              {images.map((img) => (
                <button key={img.id} onClick={() => handleImageSelect(img.url)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--ws-page)]">
                  <img src={img.url} alt={img.description} className="h-8 w-8 rounded object-cover" />
                  <span className="truncate text-xs text-[var(--ws-text-secondary)]">{img.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
    </div>
  );
}
