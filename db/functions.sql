-- =====================================================================
-- PlanoFerias — Funções, RPCs e Triggers (planoferias)
-- Correr DEPOIS de schema.sql e ANTES de policies.sql.
-- =====================================================================

-- É o utilizador atual um membro autorizado? (SECURITY DEFINER evita
-- recursão de RLS ao ler a própria tabela members dentro das policies)
CREATE OR REPLACE FUNCTION planoferias.is_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = planoferias AS $$
  SELECT EXISTS (SELECT 1 FROM members WHERE id = auth.uid());
$$;

-- Inscrição no PlanoFerias — chamada pela app no primeiro acesso do
-- utilizador (mesmo padrão do Bet4Fun: auth.users é PARTILHADO por
-- várias apps neste projeto Supabase, por isso NÃO se usa um trigger em
-- auth.users — isso criaria um perfil PlanoFerias para quem se regista
-- em QUALQUER app do projeto).
--
-- Só os 2 emails autorizados abaixo ficam com perfil (Diogo e Margarida).
-- Qualquer outro email autenticado com Google fica sem perfil — a app
-- interpreta isso como "não autorizado" e termina a sessão.
CREATE OR REPLACE FUNCTION planoferias.ensure_profile()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = planoferias AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
  v_pessoa text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF EXISTS (SELECT 1 FROM members WHERE id = v_uid) THEN RETURN; END IF;  -- já inscrito

  SELECT email, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email,'@',1))
    INTO v_email, v_name
    FROM auth.users WHERE id = v_uid;

  v_pessoa := CASE lower(v_email)
    WHEN 'diogo.andre.f.silva@gmail.com'  THEN 'Diogo'
    WHEN 'margaridamano.lgf@gmail.com'    THEN 'Margarida'
    ELSE NULL
  END;

  IF v_pessoa IS NULL THEN
    RAISE EXCEPTION 'Utilizador não autorizado: %', v_email;
  END IF;

  INSERT INTO members(id, pessoa, email, display_name)
    VALUES (v_uid, v_pessoa, v_email, v_name)
    ON CONFLICT (id) DO NOTHING;
END; $$;

GRANT EXECUTE ON FUNCTION planoferias.ensure_profile() TO authenticated;
