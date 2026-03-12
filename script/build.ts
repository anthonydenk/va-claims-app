import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir, writeFile, cp } from "fs/promises";
import { existsSync } from "fs";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "mammoth",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pdf-parse",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  // Build standalone server for local/traditional hosting
  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Build Vercel serverless function (fully bundled, no externals)
  console.log("building vercel serverless function...");
  const funcDir = ".vercel/output/functions/api.func";
  await mkdir(funcDir, { recursive: true });

  await esbuild({
    entryPoints: ["server/vercel-handler.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: `${funcDir}/index.mjs`,
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    // Bundle everything — no externals for serverless
    external: [],
    banner: {
      js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`,
    },
    logLevel: "info",
  });

  // Write Vercel function config
  await writeFile(
    `${funcDir}/.vc-config.json`,
    JSON.stringify({
      runtime: "nodejs20.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      maxDuration: 60,
      supportsResponseStreaming: true,
    })
  );

  // Copy static assets to Vercel output
  const staticDir = ".vercel/output/static";
  await rm(staticDir, { recursive: true, force: true });
  await cp("dist/public", staticDir, { recursive: true });

  // Write Vercel output config
  await writeFile(
    ".vercel/output/config.json",
    JSON.stringify({
      version: 3,
      routes: [
        { src: "/api/(.*)", dest: "/api" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    })
  );

  console.log("vercel build output created.");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
