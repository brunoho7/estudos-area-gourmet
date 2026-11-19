# Área Gourmet · Reservas do Condomínio

Aplicativo web para os moradores reservarem e cancelarem o uso da área gourmet.
O acesso é restrito a usuários cadastrados, com **e-mail, nome e senha**.

Esta pasta está em:

```
C:\Users\bruno\OneDrive\Documentos\deepseek-harness\default-workspace\agendamento-area-gourmet
```

---

## Versão publicada na web

**https://brunoho7.github.io/estudos-area-gourmet/**

- Código: **https://github.com/brunoho7/estudos-area-gourmet**
- Banco e autenticação: **Supabase**
- O site fica no **GitHub Pages**; não é preciso deixar nenhum computador ligado.

---

## Acesso ao aplicativo

1. Ao abrir o site, aparece a tela **Entrar / Criar conta**.
2. Quem ainda não tem conta clica em **Criar conta** e informa:
   - nome completo;
   - e-mail;
   - senha (mínimo 6 caracteres, repetida para confirmação).
3. O Supabase envia um **e-mail de confirmação**. Depois de confirmar, o cadastro fica **pendente** até que o administrador aprove.
4. Sem login, o calendário não é carregado — só a tela de acesso aparece.
5. Usuários pendentes ou recusados veem uma tela de status e não conseguem reservar.

**Administrador:** o e-mail **brunosilveira@grupoemon.com.br** é definido como administrador. Se ainda não existir conta com ele, crie uma em **Criar conta**; ela já nasce como administrador. O administrador vê o painel **Administração** na barra lateral, onde aprova, recusa e define papéis.

**Quem pode cancelar:** somente o morador que fez a reserva. A interface esconde o botão para os demais, e o banco também bloqueia a operação.

**Meu perfil:** no cabeçalho, o botão **Perfil** abre os dados do morador (nome, nº do apartamento, bloco e telefone). É possível editar, salvar e, se quiser, excluir a própria conta — a exclusão apaga perfil, reservas, documentos e o usuário do Auth. Ao abrir uma nova reserva, esses dados são preenchidos automaticamente.

**Meus documentos:** na barra lateral, o painel **Meus documentos** permite enviar até **2 arquivos** (PDF, JPG, PNG, WEBP, TXT, DOC/DOCX ou XLS/XLSX, até 10 MB), baixar, renomear, substituir e excluir. O administrador tem uma aba **Todos** e pode baixar os documentos de qualquer morador.

**Privacidade:** nomes e apartamentos são visíveis apenas para usuários logados.

---

## O que o aplicativo faz

- Cadastro, confirmação de e-mail e login.
- **Aprovação de moradores:** novo cadastro fica pendente até o administrador aprovar.
- **Painel de administração** (somente administradores): aprovar, recusar, promover/rebaixar usuários.
- **Meu perfil:** nome, apartamento, bloco e telefone, com edição e exclusão da conta.
- **Meus documentos:** até 2 arquivos no Supabase Storage, com CRUD; administrador vê todos.
- Calendário mensal com navegação entre meses e botão **Ir para hoje**.
- Dias reservados aparecem em verde com o nome do responsável e o apartamento.
- Clique em um dia livre para reservar (apartamento, telefone opcional, nº de pessoas e observações).
- O formulário de reserva carrega automaticamente nome, apartamento, bloco e telefone do perfil.
- Clique em um dia reservado para ver os detalhes.
- Cancelamento apenas das próprias reservas.
- Datas passadas não podem ser reservadas.
- Cada dia aceita **uma** reserva.
- Atualização automática do calendário a cada 60 segundos.
- Layout responsivo (funciona no celular).

---

## Onde ficam os dados

| Onde | O que fica |
| --- | --- |
| Supabase → `auth.users` | Contas (e-mail e senha criptografada) |
| Supabase → `public.profiles` | Nome, e-mail, apartamento, bloco, telefone, papel (`admin`/`resident`) e status (`pending`/`approved`/`rejected`) |
| Supabase → `public.documents` | Metadados dos documentos (dono, nome, caminho, tamanho) |
| Supabase Storage → `documentos` | Arquivos propriamente ditos (bucket privado) |
| Supabase → `public.reservations` | Reservas, vinculadas ao usuário (`user_id`) |
| `data/reservations.json` | Apenas o servidor local opcional (`server.js`) |

**Backup:** use o painel do Supabase (Database → Backups). O arquivo local `data/reservations.json` não é usado pela versão publicada.

---

## Regras e limites atuais

- O cadastro está **aberto**, mas todo novo usuário entra como **pendente** e só acessa após aprovação do administrador.
- O administrador é **brunosilveira@grupoemon.com.br**. Para esse e-mail, o cadastro já nasce aprovado como administrador.
- Contas que já existiam antes da migração foram aprovadas automaticamente para não perderem o acesso.
- A exclusão da conta é definitiva e apaga também reservas e documentos do morador.
- Documentos: máximo de **2 por morador**, 10 MB por arquivo, formatos PDF, JPG, PNG, WEBP, TXT, DOC/DOCX e XLS/XLSX. O administrador vê os de todos.
- Não há recuperação de senha na interface; o administrador pode redefinir em **Authentication → Users**.
- O plano gratuito do Supabase pode pausar o projeto após uma semana sem uso; reative no painel.
- Limite de **40 pessoas** por reserva.
- Sem controle de horário: a reserva é para o dia inteiro.

---

## Estrutura dos arquivos

```
agendamento-area-gourmet/
├── index.html                  Interface, tela de acesso e calendário
├── config.js                   URL + chave publishable do Supabase
├── assets/
│   ├── styles.css              Visual do aplicativo
│   ├── app.js                  Autenticação, calendário, reservas e cancelamentos
│   └── vendor/supabase.js      Biblioteca oficial do Supabase
├── supabase/
│   ├── schema.sql              Tabelas, perfis, RLS, aprovação, administração e documentos
│   ├── migration-perfil.sql    Campos de perfil para bancos já existentes
│   ├── migration-admin.sql     Papéis e aprovação para bancos já existentes
│   └── migration-documentos.sql Bucket e políticas dos documentos
├── server.js                   Servidor local opcional (Node)
├── iniciar.bat                 Atalho do servidor local no Windows
├── README.md                   Visão geral para o GitHub
├── LEIA-ME.md                  Este arquivo
└── data/
    └── reservations.json       Dados do servidor local (não usado na web)
```

---

## Personalização rápida

- **Nome do condomínio / título:** edite o cabeçalho e a tela de acesso em `index.html`.
- **Regras exibidas:** edite a seção “Como funciona” em `index.html`.
- **Cores e fontes:** variáveis no início de `assets/styles.css` (`:root`).
- **Limite de pessoas:** ajuste `MAX_GUESTS` em `assets/app.js` e em `supabase/schema.sql` (e execute o SQL de novo).
- **Cadastro fechado:** Supabase → Authentication → Providers → Email → desmarque “Allow new users to sign up”.
- **Domínio próprio:** GitHub Pages permite configurar um domínio; depois atualize a Site URL no Supabase.

---

## Problemas comuns

| Problema | Solução |
| --- | --- |
| “Confirme seu e-mail antes de entrar” | Abra o link enviado pelo Supabase (verifique spam). O e-mail pode demorar alguns minutos. |
| E-mail de confirmação não chega | Confirme a Site URL em Authentication → URL Configuration; o plano gratuito do Supabase tem limite de envios por hora. |
| “E-mail ou senha incorretos” | Confira a senha; o síndico pode redefini-la em Authentication → Users. |
| “Este e-mail já está cadastrado” | Use **Entrar** ou recupere a senha pelo painel do Supabase. |
| “Módulo de perfil ainda não foi ativado” | Execute `supabase/migration-perfil.sql` no SQL Editor do Supabase. |
| “Acesso em análise” após entrar | O administrador ainda não aprovou o cadastro. Peça a aprovação e clique em **Verificar aprovação**. |
| Não aparece o painel **Administração** | Entre com o e-mail de administrador (`brunosilveira@grupoemon.com.br`) e confirme se o SQL de administração foi executado. |
| “Acesso não autorizado” | O administrador recusou o cadastro; ele pode aprovar novamente no painel. |
| Perfil não salva | Confirme se os SQLs de perfil e administração foram executados e se o morador está logado. |
| “Bucket documentos ainda não foi criado” | Execute `supabase/migration-documentos.sql` no SQL Editor. |
| “Você já possui 2 documentos” | O limite é 2 por morador; exclua um documento para enviar outro. |
| Documento não aparece para o morador | Confirme se o upload terminou e se o SQL de documentos foi executado; recarregue a página. |
| Site publicado abre em “Modo local” | O `config.js` está vazio ou a página foi aberta como arquivo (`file://`). Use o link publicado. |
| Calendário vazio para todos | Verifique se o projeto do Supabase está ativo (não pausado). |
| Morador não consegue cancelar | Só o dono da reserva pode cancelar; confirme se ele está na conta correta. |

---

## Versão local (opcional)

A versão oficial é a publicada. Para testar a interface sem nuvem, abra `index.html` direto no navegador: ele usa o armazenamento local e não acessa o banco compartilhado.

O `iniciar.bat`/`server.js` servem a mesma versão web (com login) quando o `config.js` está preenchido; servem para desenvolvimento, não são necessários para os moradores.

---

## Próximos passos possíveis

- Aprovação de cadastro pelo síndico.
- Recuperação de senha (“Esqueci minha senha”).
- Painel do síndico para gerenciar moradores e reservas.
- Reserva por período (almoço, jantar, dia inteiro).
- Notificações por e-mail/WhatsApp.
- Domínio próprio.
