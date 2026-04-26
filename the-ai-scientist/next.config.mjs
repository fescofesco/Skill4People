import { execSync } from "node:child_process";

function captureBuildSha() {
  // Prefer Vercel's auto-injected SHA when present (GitHub integration deploy).
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  if (process.env.BUILD_SHA) return process.env.BUILD_SHA;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

function captureBuildRef() {
  if (process.env.VERCEL_GIT_COMMIT_REF) return process.env.VERCEL_GIT_COMMIT_REF;
  if (process.env.BUILD_REF) return process.env.BUILD_REF;
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const buildSha = captureBuildSha();
const buildRef = captureBuildRef();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep these out of the webpack bundle; they need to load at runtime
    // from node_modules (pdf-parse uses pdfjs-dist which trips webpack's
    // ESM/CJS interop with `Object.defineProperty called on non-object`).
    serverComponentsExternalPackages: ["openai", "pdf-parse", "pdfjs-dist", "@napi-rs/canvas"]
  },
  env: {
    BUILD_SHA: buildSha,
    BUILD_REF: buildRef,
    BUILD_TIME: new Date().toISOString()
  }
};

export default nextConfig;
