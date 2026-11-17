# Área Gourmet · Reservas do Condomínio

Aplicativo web para moradores reservarem e cancelarem a área gourmet do condomínio.
O acesso é restrito a usuários cadastrados: cada pessoa entra com **e-mail e senha**, e só quem está logado vê o calendário.

## Versão publicada

- **Site:** https://brunoho7.github.io/estudos-area-gourmet/
- **Código:** https://github.com/brunoho7/estudos-area-gourmet
- **Banco:** Supabase/PostgreSQL (`reservations`, `profiles`)
- **Autenticação:** Supabase Auth (e-mail + senha), com confirmação de e-mail

## Acesso e segurança

- Cadastro com **nome, e-mail e senha**; o e-mail precisa ser confirmado.
- Todo novo cadastro nasce como **morador pendente** e só entra depois da aprovação do administrador.
- O administrador é **brunosilveira@grupoemon.com.br**.
- Cada morador pode editar no **Meu perfil**: nome, nº do apartamento, bloco e telefone.
- Pode também **excluir a própria conta**, o que apaga perfil e reservas.
- Sem login, o aplicativo mostra apenas a tela de acesso — o calendário não é carregado.
- As reservas ficam visíveis somente para usuários autenticados.
- Cada morador pode cancelar **apenas as próprias reservas**.
- O banco usa RLS: leitura liberada para `authenticated`; criação/cancelamento apenas pelas funções SQL; anônimo não lê nem grava.
- A chave `publishable` (ou `anon`) é pública por design. **Nunca** coloque a chave `service_role` no site.

## Como funciona

- Login, cadastro e confirmação de e-mail.
- **Aprovação de moradores** pelo administrador: pendente, aprovado ou recusado.
- **Painel de administração** (visível apenas para administradores) para aprovar, recusar e definir papéis.
- **Meu perfil:** nome, apartamento, bloco e telefone, com edição e exclusão da conta.
- Calendário mensal com navegação e botão **Ir para hoje**.
- Dias reservados aparecem em verde com nome e apartamento.
- Uma reserva por dia; datas passadas bloqueadas.
- Ao abrir uma reserva, nome, apartamento, bloco e telefone são carregados do perfil do morador.
- O nome exibido na reserva vem do perfil do usuário logado.
- Layout responsivo e atualização automática a cada 60 segundos.

## Tecnologia

- **Front-end:** HTML, CSS e JavaScript puro (sem build).
- **Autenticação e banco:** Supabase (Auth + PostgreSQL com RLS).
- **Hospedagem:** GitHub Pages.
- **Servidor local opcional:** `server.js` (Node.js, sem dependências) para desenvolvimento/offline.

## Estrutura

```
.
├── index.html                  Interface, tela de acesso e calendário
├── config.js                   URL + chave publishable do Supabase
├── assets/
│   ├── styles.css              Visual
│   ├── app.js                  Autenticação, calendário, reservas e cancelamentos
│   └── vendor/supabase.js      Biblioteca oficial do Supabase (v2)
├── supabase/
│   ├── schema.sql              Tabelas, perfis, RLS, aprovação e administração
│   ├── migration-perfil.sql    Campos do perfil (bancos já existentes)
│   └── migration-admin.sql     Papéis e aprovação (bancos já existentes)
├── server.js                   Servidor local opcional (Node)
├── iniciar.bat                 Atalho do servidor local no Windows
├── LEIA-ME.md                  Manual completo em português
└── package.json
```

## Configurar o Supabase

1. Crie um projeto em <https://supabase.com>.
2. No **SQL Editor**, execute todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql). Se o banco já existia antes dos campos de perfil, execute também [`supabase/migration-perfil.sql`](supabase/migration-perfil.sql); antes da aprovação/administração, execute [`supabase/migration-admin.sql`](supabase/migration-admin.sql).
3. Em **Project Settings > API**, copie a **Project URL** e a chave **publishable** (ou **anon public**).
4. Em **Authentication > URL Configuration**, defina:
   - **Site URL:** `https://SEU-USUARIO.github.io/SEU-REPO/`
   - **Redirect URLs:** `https://SEU-USUARIO.github.io/SEU-REPO/**`
5. Preencha [`config.js`](config.js):

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseAnonKey: 'SUA-CHAVE-PUBLISHABLE'
};
```

## Rodar localmente

A versão oficial é a publicada no GitHub Pages. Para testar a interface sem nuvem, abra `index.html` diretamente no navegador: ele entra em modo local (dados só naquele navegador) e não acessa o banco compartilhado.

Com o `config.js` preenchido, o `iniciar.bat`/`server.js` servem a mesma versão com login e banco Supabase — útil para desenvolvimento.

## Limitações

- O cadastro está **aberto**, mas todo novo usuário fica **pendente** até a aprovação do administrador.
- O administrador é definido pelo e-mail **brunosilveira@grupoemon.com.br**. Se ainda não houver conta com esse e-mail, crie uma em **Criar conta**; ela nasce como administrador.
- A exclusão da conta é definitiva: apaga perfil, reservas e o usuário do Supabase Auth.
- Não há recuperação de senha na interface (pode ser adicionada com o Supabase Auth).
- Não há painel de administração.
- O plano gratuito do Supabase pode pausar o projeto após uma semana sem uso; reative no painel.

## Atualizar o site

Edite os arquivos e envie para a branch `main`. O GitHub Pages publica a nova versão automaticamente em alguns minutos.
