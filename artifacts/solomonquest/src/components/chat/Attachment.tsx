import { memo, useState } from "react";
import { Download, FileText, ImageOff, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SafeImage } from "@/components/common/SafeImage";
import type { ChatMessage } from "./types";
import { fileExtension, formatFileSize, isImageAttachment } from "./format";

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-1 w-full rounded-full bg-muted overflow-hidden"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Upload progress"
    >
      <div className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${value}%` }} />
    </div>
  );
}

export function ImageLightbox({
  url,
  name,
  open,
  onOpenChange,
}: {
  url: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(96vw,1100px)] w-auto p-0 gap-0 bg-background border overflow-hidden [&>button:last-child]:hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <DialogTitle className="flex-1 min-w-0 truncate text-sm font-medium">{name}</DialogTitle>
          <DialogDescription className="sr-only">Image attachment preview</DialogDescription>
          <a
            href={url}
            download={name}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md text-sm font-medium hover:bg-muted"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span className="hidden sm:inline">Download</span>
            <span className="sr-only sm:hidden">Download</span>
          </a>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center h-10 w-10 rounded-md hover:bg-muted"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="bg-muted/40 flex items-center justify-center max-h-[80dvh]">
          <img src={url} alt={name} className="max-h-[80dvh] max-w-full object-contain" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Image thumbnail (opens a lightbox) or a file card with a download button. */
export const AttachmentView = memo(function AttachmentView({
  msg,
  own = false,
}: {
  msg: ChatMessage;
  /** On a primary-coloured bubble (phones, own messages). */
  own?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isImage = isImageAttachment(msg.attachmentType);
  const name = msg.attachmentName ?? "Attachment";
  const progress = msg._progress ?? 0;

  if (isImage) {
    const src = msg._previewUrl ?? msg.attachmentUrl ?? undefined;
    return (
      <>
        <button
          type="button"
          onClick={() => msg.attachmentUrl && setOpen(true)}
          disabled={!msg.attachmentUrl}
          className="relative block mt-1 rounded-xl overflow-hidden border bg-muted max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Open image ${name}`}
        >
          <SafeImage
            src={src}
            alt={name}
            loading="lazy"
            className="block w-[240px] sm:w-[300px] max-w-full aspect-[4/3] object-cover bg-muted"
            fallback={
              <span className="flex items-center gap-2 px-3 py-6 w-[220px] text-sm text-muted-foreground">
                <ImageOff className="w-4 h-4" aria-hidden="true" /> {name}
              </span>
            }
          />
          {msg._uploading && (
            <span className="absolute inset-0 flex flex-col items-center justify-end gap-1.5 p-3 bg-background/60">
              <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none text-foreground" aria-hidden="true" />
              <ProgressBar value={progress} />
            </span>
          )}
        </button>
        {msg.attachmentUrl && (
          <ImageLightbox url={msg.attachmentUrl} name={name} open={open} onOpenChange={setOpen} />
        )}
      </>
    );
  }

  const card = (
    <>
      <span
        className={`h-10 w-10 rounded-lg flex flex-col items-center justify-center shrink-0 ${
          own ? "bg-primary-foreground/15 text-primary-foreground" : "bg-primary/10 text-primary"
        }`}
        aria-hidden="true"
      >
        <FileText className="w-4 h-4" />
        <span className="text-[8px] font-bold leading-none mt-0.5">{fileExtension(name)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium truncate">{name}</span>
        <span className={`block text-xs ${own ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
          {msg._uploading ? `Uploading… ${progress}%` : formatFileSize(msg.attachmentSize) || fileExtension(name)}
        </span>
        {msg._uploading && (
          <span className="block mt-1">
            <ProgressBar value={progress} />
          </span>
        )}
      </span>
      {!msg._uploading && msg.attachmentUrl && (
        <span
          className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
            own ? "hover:bg-primary-foreground/10" : "hover:bg-muted"
          }`}
          aria-hidden="true"
        >
          <Download className="w-4 h-4" />
        </span>
      )}
    </>
  );

  const cls = `mt-1 flex items-center gap-3 text-sm rounded-xl border px-3 py-2 w-[min(100%,300px)] ${
    own ? "border-primary-foreground/20" : "bg-card hover:bg-muted/60"
  } transition-colors`;

  if (msg._uploading || !msg.attachmentUrl) return <div className={cls}>{card}</div>;
  return (
    <a
      href={msg.attachmentUrl}
      target="_blank"
      rel="noopener noreferrer"
      download={name}
      className={cls}
      aria-label={`Download ${name}${msg.attachmentSize ? `, ${formatFileSize(msg.attachmentSize)}` : ""}`}
    >
      {card}
    </a>
  );
});
