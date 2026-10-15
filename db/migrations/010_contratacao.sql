-- Link de contratação: teses com oposição, contrato padrão e assinatura eletrônica com código por e-mail.
alter table client_authorizations add column if not exists opposed_theses jsonb;
alter table client_authorizations add column if not exists representative_cpf varchar(11);
alter table client_authorizations add column if not exists signer_ip varchar(80);
alter table client_authorizations add column if not exists signer_user_agent varchar(400);
alter table client_authorizations add column if not exists contract_hash char(64);
alter table client_authorizations add column if not exists otp_hash char(64);
alter table client_authorizations add column if not exists otp_email varchar(254);
alter table client_authorizations add column if not exists otp_expires_at timestamptz;
alter table client_authorizations add column if not exists otp_attempts integer not null default 0;
