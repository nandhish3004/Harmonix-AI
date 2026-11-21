// Export the same film as a self-contained HTML file, including its sample screens.
import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const names = ["scan", "material", "viewport", "tuner", "modes"];
const screens = Object.fromEntries(await Promise.all(names.map(async name => [name,
  `data:image/png;base64,${(await readFile(`public/film-screens/${name}.png`)).toString("base64")}`
])));
const result = await build({
  entryPoints: ["scripts/film-standalone.tsx"], bundle: true, write: false,
  outdir: "standalone-build", minify: true, platform: "browser", format: "iife",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "embed-film-screens", setup(builder) {
    builder.onLoad({ filter: /LabWorld\.tsx$/ }, async ({ path }) => {
      const source = await readFile(path, "utf8");
      const original = '`/film-screens/${name}.png`';
      if (!source.includes(original)) throw new Error("Film screen reference not found");
      return { contents: source.replace(original, `(${JSON.stringify(screens)})[name]`), loader: "tsx" };
    });
  }}],
});
const js = result.outputFiles.find(file => file.path.endsWith(".js"));
const css = result.outputFiles.find(file => file.path.endsWith(".css"));
if (!js || !css) throw new Error("Standalone film JS or CSS missing");
const encoded = Buffer.from(js.text, "utf8").toString("base64");
const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harmonix AR — Interactive Film</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden} ${css.text.replaceAll("</style", "<\\/style")}</style></head><body><div id="root"></div><script>const bytes=Uint8Array.from(atob("${encoded}"),c=>c.charCodeAt(0));const script=document.createElement("script");script.textContent=new TextDecoder().decode(bytes);document.body.appendChild(script);</script></body></html>\n`;
await mkdir("docs", { recursive: true });
await writeFile("docs/harmonix-film.html", html);
console.log(`Wrote docs/harmonix-film.html (${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MiB)`);
