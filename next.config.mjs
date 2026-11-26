/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      { source: "/utmcai.js", headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Cache-Control", value: "public, max-age=300" }
      ] },
      { source: "/api/collect", headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
        { key: "Access-Control-Allow-Headers", value: "Content-Type" }
      ] }
    ];
  }
};
export default nextConfig;
