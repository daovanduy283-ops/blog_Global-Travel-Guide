// Fetches the channel's public YouTube RSS feed and writes videos.json.
// No login, no API key — a single plain GET to a public feed, same as any RSS reader.
import { writeFileSync, readFileSync } from "node:fs";

const CHANNEL_ID = "UCrVPqMWCJUqlmrwMlConVIQ";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const OUT_PATH = new URL("../videos.json", import.meta.url);
const EXCERPT_MAX = 220;

function decodeXml(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function excerptOf(description) {
  const decoded = decodeXml(description || "").trim();
  const firstParagraph = decoded.split(/\n\s*\n/)[0] || "";
  const collapsed = firstParagraph.replace(/\s+/g, " ").trim();
  if (collapsed.length <= EXCERPT_MAX) return collapsed;
  return collapsed.slice(0, EXCERPT_MAX).replace(/\s+\S*$/, "") + "…";
}

function parseFeed(xml) {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => m[1]);
  return entries.map((entry) => {
    const id = (entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/) || [])[1];
    const title = decodeXml((entry.match(/<title>(.*?)<\/title>/) || [])[1] || "");
    const published = (entry.match(/<published>(.*?)<\/published>/) || [])[1];
    const thumbnail = (entry.match(/<media:thumbnail url="(.*?)"/) || [])[1];
    const description = (entry.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1];
    const views = Number((entry.match(/<media:statistics views="(\d+)"/) || [])[1] || 0);
    return { id, title, published, thumbnail, views, excerpt: excerptOf(description) };
  }).filter((v) => v.id && v.title && v.published);
}

async function main() {
  const isLocalTest = process.argv.includes("--local-xml");
  const xml = isLocalTest
    ? readFileSync(process.argv[process.argv.indexOf("--local-xml") + 1], "utf8")
    : await fetch(FEED_URL, { headers: { "User-Agent": "Mozilla/5.0 (compatible; RSS reader)" } }).then((r) => r.text());

  const videos = parseFeed(xml).sort((a, b) => new Date(b.published) - new Date(a.published));

  let previous = [];
  try { previous = JSON.parse(readFileSync(OUT_PATH, "utf8")); } catch {}

  const changed = JSON.stringify(previous) !== JSON.stringify(videos);
  writeFileSync(OUT_PATH, JSON.stringify(videos, null, 2) + "\n");
  console.log(changed ? `Updated videos.json (${videos.length} videos).` : "No changes.");
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`, { flag: "a" });
  }
}

main();
