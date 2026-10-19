-- Controle de Pneus — estrutura usada no Supabase (Postgres)
-- ------------------------------------------------------------
-- Você NÃO precisa rodar este arquivo manualmente: o próprio servidor
-- (db.js) cria essa tabela automaticamente, sozinho, a primeira vez que
-- liga com o DATABASE_URL configurado.
--
-- Este arquivo existe só como referência / documentação — para você (ou
-- alguém de TI, no futuro) entender exatamente o que o sistema guarda no
-- banco, caso precise olhar direto no Supabase um dia.

CREATE TABLE IF NOT EXISTS app_store (
  id         text PRIMARY KEY,         -- sempre o texto fixo 'main' (o sistema guarda tudo numa única linha)
  data       jsonb NOT NULL,           -- todo o conteúdo do sistema: almoxarifados, materiais, movimentações, usuários, contagens
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Para olhar os dados direto no Supabase (aba "SQL Editor"), alguns exemplos úteis:

-- Ver quando foi a última atualização:
--   select updated_at from app_store where id = 'main';

-- Ver quantos materiais existem cadastrados:
--   select jsonb_array_length(data->'materials') from app_store where id = 'main';

-- Ver a lista de usuários cadastrados (sem mostrar as senhas, que ficam como hash):
--   select jsonb_array_elements(data->'users') from app_store where id = 'main';
