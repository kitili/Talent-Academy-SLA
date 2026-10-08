const ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (ID.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return ID.test(id || "") ? id! : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      const id = url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop();
      return ID.test(id || "") ? id! : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeEmbedSrc(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
}
