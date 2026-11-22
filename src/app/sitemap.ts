import type { MetadataRoute } from "next";

const BASE = "https://teacherceppee.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/review/cse`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/review/let`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/coaches`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
}
