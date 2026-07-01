export function setPageMeta({ title, description, image, url }: { title: string; description?: string; image?: string; url?: string }) {
  document.title = title + " | SolomonQuest";
  setMeta("description", description ?? "SolomonQuest — The modern LMS for schools. Courses, quizzes, chat, and more.");
  setMeta("og:title", title + " | SolomonQuest");
  setMeta("og:description", description ?? "");
  if (image) setMeta("og:image", image);
  if (url) setMeta("og:url", url);
  setMeta("twitter:card", "summary_large_image");
  setMeta("twitter:title", title + " | SolomonQuest");
}

function setMeta(name: string, content: string) {
  let el = document.querySelector("meta[name='" + name + "'],meta[property='" + name + "']") as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    const attr = name.startsWith("og:") || name.startsWith("twitter:") ? "property" : "name";
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}
