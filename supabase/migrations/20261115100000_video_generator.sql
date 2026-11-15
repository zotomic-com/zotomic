-- Service tools: add the Video Generator tool.
-- 1. Widen the CHECK constraints on the service columns.
-- 2. Add the public "Video Generator" service card.

ALTER TABLE service_tokens
  DROP CONSTRAINT IF EXISTS service_tokens_services_check;
ALTER TABLE service_tokens
  ADD CONSTRAINT service_tokens_services_check
  CHECK (services IN ('downloader', 'text_to_audio', 'both', 'video_generator', 'all'));

ALTER TABLE service_access
  DROP CONSTRAINT IF EXISTS service_access_service_check;
ALTER TABLE service_access
  ADD CONSTRAINT service_access_service_check
  CHECK (service IN ('downloader', 'text_to_audio', 'video_generator'));

ALTER TABLE service_usage
  DROP CONSTRAINT IF EXISTS service_usage_service_check;
ALTER TABLE service_usage
  ADD CONSTRAINT service_usage_service_check
  CHECK (service IN ('downloader', 'text_to_audio', 'video_generator'));

INSERT INTO platform_service_cards (title, description, icon, status, href, sort_order, enabled)
SELECT 'Video Generator',
       'Paste a script — get a finished vertical video with neural narration, word-synced captions and an animated background.',
       'Clapperboard',
       'live',
       '/services/video-generator',
       COALESCE((SELECT MAX(sort_order) + 1 FROM platform_service_cards), 1),
       true
WHERE NOT EXISTS (SELECT 1 FROM platform_service_cards WHERE title = 'Video Generator');
