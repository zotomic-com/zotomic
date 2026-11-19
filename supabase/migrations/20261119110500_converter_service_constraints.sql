-- Allow the "converter" service in the shared tool tables.
-- The service_usage / service_access / service_tokens CHECK constraints were
-- written before the Converter shipped, so usage logging and per-user access
-- rows for converter jobs would otherwise be rejected.

alter table service_usage drop constraint if exists service_usage_service_check;
alter table service_usage add constraint service_usage_service_check
  check (service in ('downloader', 'text_to_audio', 'video_generator', 'screenshot_organizer', 'converter'));

alter table service_access drop constraint if exists service_access_service_check;
alter table service_access add constraint service_access_service_check
  check (service in ('downloader', 'text_to_audio', 'video_generator', 'screenshot_organizer', 'converter'));

alter table service_tokens drop constraint if exists service_tokens_services_check;
alter table service_tokens add constraint service_tokens_services_check
  check (services in ('downloader', 'text_to_audio', 'both', 'video_generator', 'screenshot_organizer', 'converter', 'all'));
