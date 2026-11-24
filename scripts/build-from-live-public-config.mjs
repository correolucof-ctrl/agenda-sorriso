// Rebuild the extracted package with the public Supabase configuration already
// embedded in the existing production client. Never prints or saves the key.
import { spawnSync } from "node:child_process";

const site = "https://agenda-sorriso.correo-lucof-708.workers.dev";
const expectedProject = "rgbircqnsnoilpshavva";
const page = await (await fetch(site)).text();
const entry = page.match(/<script[^>]+src="(\/assets\/index-[^"]+\.js)"/)?.[1];
if (!entry) throw new Error("Arquivo principal da versão publicada não encontrado");
const script = await (await fetch(new URL(entry, site))).text();
const urls = [...new Set(script.match(/https:\/\/[a-z0-9]+\.supabase\.co/g) ?? [])];
const keys = [...new Set(script.match(/sb_publishable_[A-Za-z0-9_-]+/g) ?? [])];
if (urls.length !== 1 || new URL(urls[0]).hostname !== `${expectedProject}.supabase.co` || keys.length !== 1) {
  throw new Error("Configuração pública não corresponde ao projeto Supabase esperado");
}
const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    VITE_STANDALONE: "true",
    VITE_GOOGLE_LOGIN: "false",
    VITE_SUPABASE_URL: urls[0],
    VITE_SUPABASE_PUBLISHABLE_KEY: keys[0],
  },
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
