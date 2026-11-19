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
- Cada morador pode enviar até **2 documentos** (PDF, imagens ou Office, até 10 MB) e fazer o CRUD apenas dos próprios arquivos.
- O administrador pode ver e baixar os documentos de todos os moradores.
- Pode também **excluir a própria conta**, o que apaga perfil, reservas e documentos.
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
- **Meus documentos:** até 2 arquivos no Supabase Storage, com envio, download, renomeação, substituição e exclusão; o administrador vê os de todos.
- **Previsão do tempo:** ao abrir uma reserva ou os detalhes de uma data futura, o app mostra a previsão do dia via Open-Meteo (até 16 dias).
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
│   ├── weather.js              Previsão do tempo (Open-Meteo)
│   └── vendor/supabase.js      Biblioteca oficial do Supabase (v2)
├── supabase/
│   ├── schema.sql              Tabelas, perfis, RLS, aprovação, administração e documentos
│   ├── migration-perfil.sql    Campos do perfil (bancos já existentes)
│   ├── migration-admin.sql     Papéis e aprovação (bancos já existentes)
│   └── migration-documentos.sql Bucket, tabela e políticas dos documentos
├── server.js                   Servidor local opcional (Node)
├── iniciar.bat                 Atalho do servidor local no Windows
├── LEIA-ME.md                  Manual completo em português
└── package.json
```

## Configurar o Supabase

1. Crie um projeto em <https://supabase.com>.
2. No **SQL Editor**, execute todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql). Se o banco já existia antes dos campos de perfil, execute também [`supabase/migration-perfil.sql`](supabase/migration-perfil.sql); antes da aprovação/administração, execute [`supabase/migration-admin.sql`](supabase/migration-admin.sql); para ativar os documentos, execute [`supabase/migration-documentos.sql`](supabase/migration-documentos.sql).
3. Em **Project Settings > API**, copie a **Project URL** e a chave **publishable** (ou **anon public**).
4. Em **Authentication > URL Configuration**, defina:
   - **Site URL:** `https://SEU-USUARIO.github.io/SEU-REPO/`
   - **Redirect URLs:** `https://SEU-USUARIO.github.io/SEU-REPO/**`
5. Preencha [`config.js`](config.js):

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseAnonKey: 'SUA-CHAVE-PUBLISHABLE',
  weather: {
    latitude: -23.5505,
    longitude: -46.6333,
    timezone: 'America/Sao_Paulo',
    label: 'São Paulo'
  }
};
```

## Previsão do tempo

A previsão usa a API **Open-Meteo**, sem chave e sem backend. Ajuste `weather` no [`config.js`](config.js) para as coordenadas aproximadas do condomínio. O app consulta uma vez os próximos 16 dias, guarda em cache por 30 minutos e mostra o cartão na reserva e nos detalhes.

- Datas além dos 16 dias mostram “previsão ainda não disponível”, com a data a partir da qual ela aparece.
- Falhas da API não bloqueiam a reserva.
- A atribuição **Open-Meteo** é obrigatória e aparece no cartão.
- O plano gratuito é para uso não comercial; para uso comercial, consulte os planos da Open-Meteo.

## Rodar localmente

A versão oficial é a publicada no GitHub Pages. Para testar a interface sem nuvem, abra `index.html` diretamente no navegador: ele entra em modo local (dados só naquele navegador) e não acessa o banco compartilhado.

Com o `config.js` preenchido, o `iniciar.bat`/`server.js` servem a mesma versão com login e banco Supabase — útil para desenvolvimento.

## Limitações

- O cadastro está **aberto**, mas todo novo usuário fica **pendente** até a aprovação do administrador.
- O administrador é definido pelo e-mail **brunosilveira@grupoemon.com.br**. Se ainda não houver conta com esse e-mail, crie uma em **Criar conta**; ela nasce como administrador.
- A exclusão da conta é definitiva: apaga perfil, reservas, documentos e o usuário do Supabase Auth.
- Documentos: máximo de **2 por morador**, 10 MB por arquivo, formatos PDF, JPG, PNG, WEBP, TXT, DOC/DOCX e XLS/XLSX.
- Previsão do tempo limitada aos próximos **16 dias**; não é uma promessa meteorológica e não inclui alertas de eventos severos.
- Não há recuperação de senha na interface (pode ser adicionada com o Supabase Auth).
- O plano gratuito do Supabase pode pausar o projeto após uma semana sem uso; reative no painel.

## Atualizar o site

Edite os arquivos e envie para a branch `main`. O GitHub Pages publica a nova versão automaticamente em alguns minutos.
