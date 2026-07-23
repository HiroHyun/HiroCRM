"use client";

// Full-size screenshot viewer (step 5), nested inside the add/detail dialogs'
// own Dialog — Base UI nested dialogs are first-class, and Escape closes only
// the topmost popup.

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { strings } from "../../lib/strings";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "../ui/dialog";

export interface ScreenshotLightboxProps {
  urls: string[];
  index: number;
  onIndexChange: (i: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScreenshotLightbox({
  urls,
  index,
  onIndexChange,
  open,
  onOpenChange,
}: ScreenshotLightboxProps) {
  // if/else (not a bare `> 1` comparison right before the JSX return) keeps
  // check-copy's naive JSX-text scanner from reading the tail of this file
  // as one giant text node (see idiom note in screenshot-field.tsx).
  let hasMultiple: boolean;
  if (urls.length > 1) {
    hasMultiple = true;
  } else {
    hasMultiple = false;
  }
  const url = urls[index];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <div className="mb-3 flex items-center justify-between">
          <DialogTitle>
            {strings.lightbox.title(String(index + 1), String(urls.length))}
          </DialogTitle>
          <DialogClose
            aria-label={strings.lightbox.close}
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-muted hover:text-ink"
          >
            <X size={16} aria-hidden />
          </DialogClose>
        </div>
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-border bg-bg">
          {url != null && (
            <Image
              src={url}
              alt={strings.upload.screenshotAlt}
              fill
              unoptimized
              className="object-contain"
            />
          )}
        </div>
        {hasMultiple && (
          <div className="mt-3 flex items-center justify-between">
            <Button
              onClick={() => onIndexChange(index - 1)}
              disabled={index === 0}
              aria-label={strings.lightbox.previous}
              iconOnly
            >
              <ChevronLeft size={16} aria-hidden />
            </Button>
            <Button
              onClick={() => onIndexChange(index + 1)}
              disabled={index === urls.length - 1}
              aria-label={strings.lightbox.next}
              iconOnly
            >
              <ChevronRight size={16} aria-hidden />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
