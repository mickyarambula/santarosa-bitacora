create table team_invitations (
 id text primary key,
 email text not null,
 token_hash text not null unique,
 created_by text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 claimed_by text,
 claimed_at timestamptz,
 revoked_at timestamptz
);
