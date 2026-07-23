import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Every <Image> in this app already passes `unoptimized`: screenshots are
    // operator uploads served from a session-guarded route, so the optimizer
    // has nothing to do. Disabling it here stops Next mounting the
    // /_next/image endpoint at all, which removes the only runtime path to
    // image-optimization issues and to the `sharp` package Next installs for
    // that endpoint. See SECURITY.md.
    unoptimized: true,
  },
};

export default nextConfig;
