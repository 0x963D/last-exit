CREATE SCHEMA IF NOT EXISTS last_exit;
CREATE TABLE IF NOT EXISTS last_exit.budget (
  id text PRIMARY KEY, cap_nano bigint NOT NULL CHECK(cap_nano>=0),
  used_nano bigint NOT NULL DEFAULT 0 CHECK(used_nano>=0), enabled boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS last_exit.sessions (
  id uuid PRIMARY KEY, state jsonb NOT NULL, expires_at timestamptz NOT NULL,
  lease uuid, lease_until timestamptz
);
CREATE TABLE IF NOT EXISTS last_exit.limits (
  id text PRIMARY KEY, uses integer NOT NULL DEFAULT 0, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS last_exit.reservations (
  id uuid PRIMARY KEY, budget_id text NOT NULL REFERENCES last_exit.budget(id),
  session_id uuid NOT NULL, reserved_nano bigint NOT NULL, actual_nano bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS last_exit.usage_daily (
  budget_id text NOT NULL REFERENCES last_exit.budget(id),
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  event text NOT NULL CHECK(event IN ('page_view','started','reply_completed','passed','caught','rejected')),
  total bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(budget_id,day,event)
);
INSERT INTO last_exit.budget(id,cap_nano) VALUES ('public-v1',1000000000),('preview-v1',100000000)
ON CONFLICT(id) DO NOTHING;

CREATE OR REPLACE FUNCTION last_exit.rate(k text, maximum integer) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  INSERT INTO last_exit.limits(id,uses,expires_at) VALUES(k,1,now()+interval '2 hours')
  ON CONFLICT(id) DO UPDATE SET uses=last_exit.limits.uses+1 RETURNING uses INTO n;
  RETURN n<=maximum;
END $$;

CREATE OR REPLACE FUNCTION last_exit.count_usage(bid text, kind text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO last_exit.usage_daily(budget_id,event,total) VALUES(bid,kind,1)
  ON CONFLICT(budget_id,day,event) DO UPDATE SET total=last_exit.usage_daily.total+1;
$$;

CREATE OR REPLACE FUNCTION last_exit.begin_turn(sid uuid, version integer, token uuid, bid text, rate_key text, reserve bigint)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE b last_exit.budget; s last_exit.sessions;
BEGIN
  SELECT * INTO b FROM last_exit.budget WHERE id=bid FOR UPDATE;
  IF NOT FOUND OR NOT b.enabled OR b.used_nano+reserve>b.cap_nano THEN RETURN jsonb_build_object('error','quota'); END IF;
  SELECT * INTO s FROM last_exit.sessions WHERE id=sid AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','session'); END IF;
  IF (s.state->>'version')::integer<>version THEN RETURN jsonb_build_object('error','stale'); END IF;
  IF s.lease_until>now() THEN RETURN jsonb_build_object('error','busy'); END IF;
  IF NOT last_exit.rate(rate_key,60) THEN RETURN jsonb_build_object('error','rate'); END IF;
  UPDATE last_exit.budget SET used_nano=used_nano+reserve WHERE id=bid;
  INSERT INTO last_exit.reservations(id,budget_id,session_id,reserved_nano) VALUES(token,bid,sid,reserve);
  UPDATE last_exit.sessions SET lease=token,lease_until=now()+interval '90 seconds' WHERE id=sid;
  RETURN jsonb_build_object('state',s.state);
END $$;

CREATE OR REPLACE FUNCTION last_exit.finish_turn(sid uuid, token uuid, updated jsonb, actual bigint)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE r last_exit.reservations; s last_exit.sessions;
BEGIN
  -- Same lock order as begin_turn; never refund an unknown/expired reservation twice.
  SELECT * INTO r FROM last_exit.reservations WHERE id=token;
  IF NOT FOUND OR r.session_id<>sid OR actual<0 OR actual>r.reserved_nano THEN RETURN false; END IF;
  PERFORM 1 FROM last_exit.budget WHERE id=r.budget_id FOR UPDATE;
  SELECT * INTO s FROM last_exit.sessions WHERE id=sid FOR UPDATE;
  IF NOT FOUND OR s.lease IS DISTINCT FROM token THEN RETURN false; END IF;
  SELECT * INTO r FROM last_exit.reservations WHERE id=token FOR UPDATE;
  IF r.actual_nano IS NOT NULL THEN RETURN false; END IF;
  UPDATE last_exit.budget SET used_nano=used_nano-r.reserved_nano+actual WHERE id=r.budget_id;
  UPDATE last_exit.reservations SET actual_nano=actual WHERE id=token;
  UPDATE last_exit.sessions SET state=updated,lease=NULL,lease_until=NULL WHERE id=sid;
  PERFORM last_exit.count_usage(r.budget_id,'reply_completed');
  IF s.state->>'status'='active' AND updated->>'status' IN ('passed','caught','rejected') THEN
    PERFORM last_exit.count_usage(r.budget_id,updated->>'status');
  END IF;
  RETURN true;
END $$;
