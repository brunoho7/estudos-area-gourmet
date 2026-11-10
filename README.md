# Área Gourmet · Reservas do Condomínio

Aplicativo web para moradores reservarem e cancelarem a área gourmet do condomínio.
Todos veem no calendário os dias reservados e quem reservou.

## Versão publicada

O site fica no **GitHub Pages** e as reservas são compartilhadas pelo **Supabase**:

- **Site:** _(preencher após a publicação)_
- **Banco:** Supabase (tabela `public.reservations` + funções `create_reservation` e `cancel_reservation`)

## Como funciona

- Calendário mensal com navegação e botão **Ir para hoje**.
- Dias reservados aparecem em verde com nome e apartamento.
- Uma reserva por dia; datas passadas bloqueadas.
- Cancelamento somente com o nome + apartamento usados na reserva.
- Layout responsivo e atualização automática a cada 60 segundos.

## Tecnologia

- **Front-end:** HTML, CSS e JavaScript puro (sem build).
- **Banco:** Supabase/PostgreSQL com RLS; escrita apenas por funções `security definer`.
- **Hospedagem:** GitHub Pages.
- **Servidor local opcional:** `server.js` (Node.js, sem dependências) para uso offline/Docker.

A chave `anon` do Supabase é pública por design. Quem protege os dados são as políticas de RLS e as funções SQL em [`supabase/schema.sql`](supabase/schema.sql). Nunca coloque a chave `service_role` no site.

## Rodar localmente

1. Instale o Node.js LTS.
2. Dê duplo clique em `iniciar.bat` (Windows) ou execute `node server.js`.
3. Abra `http://localhost:3000`.

Sem Node, abra `index.html` direto: o app funciona em modo local (dados só naquele navegador).

## Configurar o Supabase

1. Crie um projeto em <https://supabase.com>.
2. No **SQL Editor**, execute o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
3. Em **Project Settings > API**, copie a **Project URL** e a chave **anon public**.
4. Preencha [`config.js`](config.js):

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseAnonKey: 'SUA-CHAVE-ANON'
};
```

## Estrutura

```
.
├── index.html              Interface
├── config.js               URL + chave anon do Supabase
├── assets/
│   ├── styles.css          Visual
│   └── app.js              Calendário, reservas e cancelamentos
├── supabase/
│   └── schema.sql          Tabela, políticas e funções
├── server.js               Servidor local opcional (Node)
├── iniciar.bat             Atalho do servidor local no Windows
├── LEIA-ME.md              Manual completo em português
└── package.json
```

## Limitações

- Não há login de morador; o cancelamento é validado por nome + apartamento.
- Os nomes e apartamentos ficam visíveis para quem tem o link.
- O plano gratuito do Supabase pode pausar o projeto por inatividade; um ping diário via GitHub Actions evita isso (opcional).
