-- Citas se capturaban como hora local (Sinaloa) pero se guardaban como UTC.
-- Mazatlan es UTC-7; sumar 7 h deja las que ya existían a la hora que eligieron.

update visits
set scheduled_at = scheduled_at + interval '7 hours'
where scheduled_at is not null;
