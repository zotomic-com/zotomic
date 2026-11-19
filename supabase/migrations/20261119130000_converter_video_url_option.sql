-- Optional "paste a video link" field for the Video converters.
-- The engine downloads the link (YouTube / TikTok / Instagram / Facebook)
-- and runs the normal conversion, so a file upload is optional.

update converter_types
set options =
      '[{"id":"url","type":"text","label":"Video link (optional)","value":"","placeholder":"https://youtube.com/watch?v=…"}]'::jsonb
      || options,
    updated_at = now()
where grp = 'video'
  and not (options @> '[{"id":"url"}]'::jsonb);
