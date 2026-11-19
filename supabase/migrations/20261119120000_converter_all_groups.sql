-- Port the remaining converter sub-services from the original downloader
-- sidebar: Document (5), extra Video (2), Text (8), AI Image (4).
--
-- The public page is driven entirely by this table, so adding the rows is what
-- makes them appear under Services → Converter. Admins can still edit every
-- field from /admin/services/converter.

-- 1. Allow the three new groups.
alter table converter_types drop constraint if exists converter_types_grp_check;
alter table converter_types add constraint converter_types_grp_check
  check (grp in ('image', 'document', 'video', 'audio', 'text', 'ai'));

-- 2. Stable ordering: image 0-9, document 10-19, video 20-29,
--    audio 30-39, text 40-49, ai 50-59.
update converter_types set sort_order = 0  where slug = 'images-to-pdf';
update converter_types set sort_order = 1  where slug = 'pdf-to-images';

update converter_types set sort_order = 20 where slug = 'video-to-video';
update converter_types set sort_order = 21 where slug = 'video-to-audio';
update converter_types set sort_order = 22 where slug = 'video-to-gif';
update converter_types set sort_order = 23 where slug = 'video-trim';
update converter_types set sort_order = 24 where slug = 'video-compress';

update converter_types set sort_order = 30 where slug = 'audio-to-text';
update converter_types set sort_order = 31 where slug = 'audio-convert';
update converter_types set sort_order = 32 where slug = 'audio-compress';
update converter_types set sort_order = 33 where slug = 'audio-trim';

-- 3. Insert the missing sub-services.
insert into converter_types (slug, label, grp, description, accept, multiple, needs_file, options, sort_order)
values
  -- Document -------------------------------------------------------------
  ('docs-to-pdf', 'Documents → PDF', 'document',
   'Turn Word, Excel, PowerPoint, RTF or text files into PDF.',
   '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.odt,.ods,.odp', true, true, '[]'::jsonb, 10),

  ('pdf-to-docx', 'PDF → Word', 'document',
   'Export a PDF as an editable Word document.',
   '.pdf,.application/pdf', false, true, '[]'::jsonb, 11),

  ('pdf-to-xlsx', 'PDF → Excel', 'document',
   'Pull the tables out of a PDF into a spreadsheet.',
   '.pdf,.application/pdf', false, true, '[]'::jsonb, 12),

  ('pdf-to-pptx', 'PDF → PowerPoint', 'document',
   'Make each PDF page a full-bleed slide.',
   '.pdf,.application/pdf', false, true, '[]'::jsonb, 13),

  ('pdf-to-txt', 'PDF → Text', 'document',
   'Extract the selectable text from a PDF.',
   '.pdf,.application/pdf', false, true, '[]'::jsonb, 14),

  -- Video (the two the first pass missed) --------------------------------
  ('video-to-text', 'Video → Text', 'video',
   'Transcribe the speech in a video into written text.',
   'video/*,.mp4,.webm,.mov,.mkv,.avi,.flv,.wmv,.m4v', false, true,
   '[{"id":"language","label":"Language","type":"select","value":"auto","options":["auto","en","es","fr","de","it","pt","ru","zh","ja","ko","ar","hi"]}]'::jsonb, 25),

  ('video-to-skill', 'Video → Skill', 'video',
   'Turn a tutorial video into a reusable AI skill document.',
   'video/*,.mp4,.webm,.mov,.mkv,.avi,.flv,.wmv,.m4v', false, true,
   '[{"id":"language","label":"Language","type":"select","value":"auto","options":["auto","en","es","fr","de","it","pt","ru","zh","ja","ko","ar","hi"]},{"id":"skillName","label":"Skill name (optional)","type":"text","value":"","placeholder":"e.g., Python Data Analysis"},{"id":"targetLLM","label":"Target LLM","type":"select","value":"universal","options":["universal","claude","chatgpt","gemini","copilot","cursor"]}]'::jsonb, 26),

  -- Audio (the one the first pass missed) --------------------------------
  ('text-to-audio', 'Text → Audio', 'audio',
   'Read any text aloud with a natural neural voice.',
   '', false, false,
   '[{"id":"text","label":"Text to speak","type":"textarea","value":"","rows":8,"placeholder":"Type or paste the text you want spoken…"},{"id":"voice","label":"Voice","type":"select","value":"en-US-GuyNeural","options":["en-US-GuyNeural","en-US-AriaNeural","en-US-JennyNeural","en-GB-RyanNeural","en-GB-SoniaNeural","en-AU-NatashaNeural","en-IN-NeerjaNeural","bn-BD-NabanitaNeural","bn-IN-BashkarNeural","hi-IN-MadhurNeural","ar-SA-HamedNeural","es-ES-AlvaroNeural","fr-FR-HenriNeural","de-DE-ConradNeural","pt-BR-AntonioNeural","ru-RU-DmitryNeural","zh-CN-YunxiNeural","ja-JP-KeitaNeural","ko-KR-InJoonNeural"]},{"id":"rate","label":"Speed","type":"select","value":"0%","options":["-50%","-25%","0%","+25%","+50%"]},{"id":"volume","label":"Volume","type":"select","value":"0%","options":["-50%","-25%","0%","+25%","+50%"]}]'::jsonb, 34),

  -- Text ----------------------------------------------------------------
  ('text-translate', 'Translator', 'text',
   'Translate text between 20 languages.',
   '', false, false,
   '[{"id":"text","label":"Text to translate","type":"textarea","value":"","rows":8,"placeholder":"Paste the text you want translated…"},{"id":"sourceLang","label":"Source language","type":"select","value":"auto","options":["auto","en","bn","hi","es","fr","de","it","pt","ru","zh","ja","ko","ar","tr","vi","th","id","ms","tl"]},{"id":"targetLang","label":"Target language","type":"select","value":"en","options":["en","bn","hi","es","fr","de","it","pt","ru","zh","ja","ko","ar","tr","vi","th","id","ms","tl"]}]'::jsonb, 40),

  ('unicode-to-bijoy', 'Unicode → Bijoy', 'text',
   'Convert Bangla Unicode text to Bijoy ANSI.',
   '', false, false,
   '[{"id":"text","label":"Unicode text","type":"textarea","value":"","rows":8,"placeholder":"বাংলা ইউনিকোড এখানে পেস্ট করুন…"}]'::jsonb, 41),

  ('bijoy-to-unicode', 'Bijoy → Unicode', 'text',
   'Convert Bijoy ANSI text to Bangla Unicode.',
   '', false, false,
   '[{"id":"text","label":"Bijoy text","type":"textarea","value":"","rows":8,"placeholder":"Bijoy ANSI text paste here…"}]'::jsonb, 42),

  ('text-case', 'Case Converter', 'text',
   'Change text to upper, lower, title, camel, snake and more.',
   '', false, false,
   '[{"id":"text","label":"Text","type":"textarea","value":"","rows":8,"placeholder":"Paste text here…"},{"id":"caseType","label":"Convert to","type":"select","value":"lower","options":["lower","upper","title","sentence","camel","pascal","snake","kebab","alternating","inverse"]}]'::jsonb, 43),

  ('text-encode', 'Encode / Decode', 'text',
   'Base64, URL, HTML, hex and ROT13 in both directions.',
   '', false, false,
   '[{"id":"text","label":"Text","type":"textarea","value":"","rows":8,"placeholder":"Paste text here…"},{"id":"encodeType","label":"Operation","type":"select","value":"base64-encode","options":["base64-encode","base64-decode","url-encode","url-decode","html-encode","html-decode","rot13","hex-encode","hex-decode"]}]'::jsonb, 44),

  ('text-hash', 'Hash Generator', 'text',
   'MD5, SHA-1, SHA-256, SHA-512, RIPEMD-160 and CRC32.',
   '', false, false,
   '[{"id":"text","label":"Text","type":"textarea","value":"","rows":8,"placeholder":"Paste text here…"},{"id":"hashType","label":"Algorithm","type":"select","value":"md5","options":["md5","sha1","sha256","sha512","ripemd160","crc32"]}]'::jsonb, 45),

  ('text-diff', 'Text Diff', 'text',
   'Compare two text files and highlight what changed.',
   '.txt,.text', true, true, '[]'::jsonb, 46),

  ('text-count', 'Word / Char Count', 'text',
   'Words, characters, sentences, lines and reading time.',
   '', false, false,
   '[{"id":"text","label":"Text","type":"textarea","value":"","rows":8,"placeholder":"Paste text here…"}]'::jsonb, 47),

  -- AI image tools ------------------------------------------------------
  ('remove-background', 'Remove Background', 'ai',
   'Cut the subject out and leave a transparent PNG.',
   'image/*,.png,.jpg,.jpeg,.webp,.bmp', false, true, '[]'::jsonb, 50),

  ('add-background', 'Add Background', 'ai',
   'Put a transparent image on a colour or another picture.',
   'image/*,.png,.jpg,.jpeg,.webp,.bmp', true, true,
   '[{"id":"background","label":"Background","type":"text","value":"#ffffff","placeholder":"#ffffff, or add a 2nd image as the background"}]'::jsonb, 51),

  ('add-overlay', 'Add Overlay / Sticker', 'ai',
   'Paste a logo or sticker onto a photo.',
   'image/*,.png,.jpg,.jpeg,.webp,.bmp', true, true,
   '[{"id":"x","label":"X position","type":"number","value":0,"min":0},{"id":"y","label":"Y position","type":"number","value":0,"min":0},{"id":"scale","label":"Scale","type":"number","value":1,"min":0.1,"max":5,"step":0.1}]'::jsonb, 52),

  ('add-text', 'Add Text', 'ai',
   'Write a caption straight onto an image.',
   'image/*,.png,.jpg,.jpeg,.webp,.bmp', false, true,
   '[{"id":"text","label":"Text","type":"text","value":"Your text here"},{"id":"x","label":"X position","type":"number","value":50,"min":0},{"id":"y","label":"Y position","type":"number","value":50,"min":0},{"id":"fontSize","label":"Font size","type":"number","value":48,"min":8,"max":200},{"id":"color","label":"Colour (hex)","type":"text","value":"#ffffff"}]'::jsonb, 53)
on conflict (slug) do nothing;
