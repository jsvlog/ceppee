import type { MetadataRoute } from "next";

/** Public pages only — the reviewer itself needs a pass, so indexing it is noise. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/dashboard", "/payment/", "/study/", "/exam/", "/lesson/"],
      },
    ],
    sitemap: "https://www.teacherceppee.com/sitemap.xml",
    host: "https://www.teacherceppee.com",
  };
}
