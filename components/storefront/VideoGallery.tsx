import { VideoCard, type StorefrontVideo } from "./VideoCard";

/** Responsive grid of videos — mixed aspect ratios are fine, each card keeps its own. */
export function VideoGallery({ videos }: { videos: StorefrontVideo[] }) {
  if (!videos.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {videos.map((v) => (
        <VideoCard key={v.id} video={v} />
      ))}
    </div>
  );
}
