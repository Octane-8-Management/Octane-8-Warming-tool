/** @type {import('next').NextConfig} */
const nextConfig = {
  onDemandEntries: {
    // Keep compiled dev pages in memory much longer (default is 25s) so
    // switching between Trigger and Dashboard doesn't trigger a recompile.
    maxInactiveAge: 60 * 60 * 1000,
    // Keep all of this app's pages warm at once (default is 2).
    pagesBufferLength: 10,
  },
};

export default nextConfig;
