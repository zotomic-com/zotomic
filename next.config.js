/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  experimental: {
    // Keep recently visited routes in the client router cache so going back and
    // forth (and revisiting a page) is instant instead of refetching the RSC
    // payload every time. Marketing pages are static; app/admin pages are live.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

module.exports = nextConfig;
