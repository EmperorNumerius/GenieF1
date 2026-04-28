import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so Cloudflare Pages can serve us as plain HTML/JS/CSS.
  // The frontend talks to the backend via NEXT_PUBLIC_API_BASE — no SSR needed.
  output: "export",
  // Static export can't optimize images at runtime, so disable it.
  // We use plain <img> tags everywhere already.
  images: {
    unoptimized: true,
  },
  // Trailing slashes make Cloudflare Pages routing happier with /index.html.
  trailingSlash: true,
  // Type/lint errors should fail the build, but production deploys shouldn't be
  // blocked by warnings — keep defaults.
};

export default nextConfig;
