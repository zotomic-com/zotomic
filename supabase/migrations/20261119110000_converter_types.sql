-- Converter service: admin-editable converter sub-services.
-- Each row is one sub-service shown under Services → Converter.
-- Admin can add / edit / delete rows from /admin/services/converter.

create table if not exists converter_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  grp text not null default 'image' check (grp in ('image', 'video', 'audio')),
  description text,
  accept text not null default '',
  multiple boolean not null default false,
  needs_file boolean not null default true,
  options jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists converter_types_group_idx on converter_types (grp, sort_order);

alter table converter_types enable row level security;
-- service-role only: the site reads through SUPABASE_SERVICE_ROLE_KEY.

insert into converter_types (slug, label, grp, description, accept, multiple, options, sort_order)
values
  ('images-to-pdf', 'Images → PDF', 'image',
   'Combine photos and scans into one tidy PDF.',
   'image/*', true, '[]'::jsonb, 0),

  ('pdf-to-images', 'PDF → Images', 'image',
   'Split every PDF page into its own image file.',
   '.pdf,.application/pdf', false,
   '[{"id":"format","label":"Output format","type":"select","value":"png","options":["png","jpg","webp"]},{"id":"dpi","label":"DPI (quality)","type":"number","value":150,"min":72,"max":600,"step":1}]'::jsonb, 1),

  ('video-to-video', 'Video → Video', 'video',
   'Re-encode a video into another format or quality.',
   'video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v', false,
   '[{"id":"format","label":"Output format","type":"select","value":"mp4","options":["mp4","webm","mov","mkv"]},{"id":"quality","label":"Quality","type":"select","value":"high","options":["original","high","medium","low"]}]'::jsonb, 2),

  ('video-to-audio', 'Video → Audio', 'video',
   'Extract the soundtrack from any video.',
   'video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v', false,
   '[{"id":"format","label":"Audio format","type":"select","value":"mp3","options":["mp3","aac","ogg","wav","flac"]},{"id":"bitrate","label":"Bitrate","type":"select","value":"192k","options":["64k","128k","192k","256k","320k"]}]'::jsonb, 3),

  ('video-to-gif', 'Video → GIF', 'video',
   'Turn a clip into a looping animated GIF.',
   'video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v', false,
   '[{"id":"fps","label":"FPS","type":"number","value":10,"min":1,"max":30,"step":1},{"id":"scale","label":"Max width (px)","type":"number","value":480,"min":100,"max":1920,"step":10}]'::jsonb, 4),

  ('video-trim', 'Trim Video', 'video',
   'Cut a video down to just the part you need.',
   'video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v', false,
   '[{"id":"start","label":"Start time (HH:MM:SS)","type":"text","value":"00:00:00"},{"id":"duration","label":"Duration (HH:MM:SS, optional)","type":"text","value":""}]'::jsonb, 5),

  ('video-compress', 'Compress Video', 'video',
   'Shrink a video file without wrecking the quality.',
   'video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v', false,
   '[{"id":"crf","label":"CRF (18 = best, 35 = smallest)","type":"number","value":28,"min":18,"max":35,"step":1},{"id":"preset","label":"Encoder preset","type":"select","value":"medium","options":["ultrafast","superfast","veryfast","faster","fast","medium","slow","slower","veryslow"]}]'::jsonb, 6),

  ('audio-to-text', 'Audio → Text', 'audio',
   'Transcribe speech from an audio file into written text.',
   'audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac', false,
   '[{"id":"language","label":"Spoken language","type":"select","value":"auto","options":["auto","en","es","fr","de","it","pt","ru","zh","ja","ko","ar","hi","bn"]}]'::jsonb, 7),

  ('audio-convert', 'Convert Audio', 'audio',
   'Move audio between MP3, WAV, OGG, FLAC and more.',
   'audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.opus', false,
   '[{"id":"format","label":"Output format","type":"select","value":"mp3","options":["mp3","wav","ogg","flac","m4a","aac"]},{"id":"bitrate","label":"Bitrate","type":"select","value":"192k","options":["64k","128k","192k","256k","320k"]}]'::jsonb, 8),

  ('audio-compress', 'Compress Audio', 'audio',
   'Reduce an audio file size with a lower bitrate.',
   'audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac', false,
   '[{"id":"bitrate","label":"Target bitrate","type":"select","value":"128k","options":["32k","64k","96k","128k","160k","192k"]}]'::jsonb, 9),

  ('audio-trim', 'Trim Audio', 'audio',
   'Cut a podcast or voice note to length.',
   'audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac', false,
   '[{"id":"start","label":"Start time (HH:MM:SS)","type":"text","value":"00:00:00"},{"id":"duration","label":"Duration (HH:MM:SS, optional)","type":"text","value":""}]'::jsonb, 10)
on conflict (slug) do nothing;
