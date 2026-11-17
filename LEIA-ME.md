# Área Gourmet · Reservas do Condomínio

Aplicativo web para os moradores reservarem e cancelarem o uso da área gourmet.
Todos veem no calendário quais dias estão reservados e quem reservou.

Esta pasta está em:

```
C:\Users\bruno\OneDrive\Documentos\deepseek-harness\default-workspace\agendamento-area-gourmet
```

---

## Versão publicada na web

O aplicativo está no ar em:

**https://brunoho7.github.io/estudos-area-gourmet/**

As reservas ficam no Supabase e são compartilhadas por todos que abrem o link. Não é preciso deixar nenhum computador ligado. O código fica em **https://github.com/brunoho7/estudos-area-gourmet** (branch `main`; o GitHub Pages publica automaticamente a cada envio).

---

## Como usar localmente

Para o dia a dia, use o link publicado. As opções abaixo servem para rodar o app no seu computador.

### Opção 1 — Servidor local compartilhado (alternativa)

1. Dê **duplo clique em `iniciar.bat`**.
2. O navegador abre em `http://localhost:3000`.
3. A janela preta que ficar aberta é o servidor. **Não feche enquanto estiver usando.**
4. Para os outros moradores acessarem, use o endereço de rede que aparece na janela, por exemplo:

   ```
   Na rede:  http://192.168.0.10:3000
   ```

   Todos precisam estar no **mesmo Wi-Fi/rede** e o computador do servidor precisa estar ligado.
   Na primeira execução o Windows pode pedir para liberar o Node.js no firewall — permita em **redes privadas**.

Assim, as reservas ficam salvas em um único arquivo (`data/reservations.json`) e todo mundo vê o mesmo calendário.

### Opção 2 — Sem instalar nada (modo local)

Dê **duplo clique em `index.html`**. O app funciona, mas as reservas ficam salvas **somente neste navegador/computador** e não são compartilhadas. Serve para testar ou para uso em um único dispositivo.

> O `iniciar.bat` procura o Node.js instalado no computador. Neste computador ele também consegue usar o runtime Node.js que acompanha o DeepSeek Harness, então deve funcionar sem instalação extra. Se não funcionar, instale o Node.js LTS em <https://nodejs.org> e tente de novo.

---

## O que o aplicativo faz

- Calendário mensal com navegação entre meses e botão **Ir para hoje**.
- Dias reservados aparecem em verde com o nome do responsável e o apartamento.
- Clique em um dia livre para reservar (nome, apartamento, telefone opcional, nº de pessoas e observações).
- Clique em um dia reservado para ver os detalhes.
- Cancelamento mediante confirmação do **nome e apartamento** usados na reserva.
- Datas passadas não podem ser reservadas.
- Cada dia aceita **uma** reserva.
- Atualização automática do calendário a cada 60 segundos (modo compartilhado).
- Layout responsivo (funciona no celular).

---

## Onde ficam os dados

| Modo | Onde fica |
| --- | --- |
| Publicado (GitHub Pages) | Supabase — tabela `public.reservations` |
| Servidor local (`iniciar.bat`) | `data/reservations.json` |
| Local (`index.html`) | Armazenamento do próprio navegador (localStorage) |

**Backup:** no modo publicado, use os backups do painel do Supabase (Database → Backups). No modo local, com o servidor parado, copie o arquivo `data/reservations.json` para outro lugar.

No modo publicado não existe arquivo local de reservas; o `data/reservations.json` é usado apenas pelo servidor Node.

---

## Regras e limites atuais

- Não há login nem senha: o cancelamento é validado pelo nome + apartamento informados. Quem souber esses dados pode cancelar uma reserva. Para um controle mais rígido, o próximo passo seria criar login de morador e/ou uma senha de administração.
- Os nomes e apartamentos ficam visíveis para todos que acessam o endereço.
- Limite de **40 pessoas** por reserva (pode ser alterado no código).
- Sem controle de horário: a reserva é para o dia inteiro. Se precisar de períodos (almoço/jantar), é possível evoluir.
- O servidor local precisa estar ligado para o modo compartilhado por rede funcionar. Na versão publicada, não.
- A versão publicada funciona pela internet; o modo local (`iniciar.bat`) atende apenas a mesma rede Wi-Fi.
- O plano gratuito do Supabase pode pausar o projeto após uma semana sem uso; reative no painel do Supabase.

---

## Estrutura dos arquivos

```
agendamento-area-gourmet/
├── index.html              Interface (calendário, modais, textos)
├── config.js               URL + chave publishable do Supabase
├── assets/
│   ├── styles.css          Visual do aplicativo
│   └── app.js              Lógica do calendário, reservas e cancelamentos
├── supabase/
│   └── schema.sql          Tabela, RLS e funções do banco
├── server.js               Servidor local + API (sem dependências externas)
├── iniciar.bat             Atalho para iniciar o servidor local
├── package.json            Metadados e comando "npm start"
├── README.md               Visão geral para o GitHub
├── LEIA-ME.md              Este arquivo
└── data/
    └── reservations.json   Reservas do servidor local (criado automaticamente)
```

---

## Personalização rápida

- **Nome do condomínio / título:** edite o cabeçalho em `index.html`.
- **Regras exibidas no site:** edite a seção “Como funciona” em `index.html`.
- **Cores e fontes:** edite as variáveis no início de `assets/styles.css` (`:root`).
- **Limite de pessoas:** ajuste `MAX_GUESTS` em `assets/app.js`, em `server.js` e em `supabase/schema.sql` (os três precisam ficar iguais).
- **Regras de validação:** além do `server.js`, ajuste as funções em `supabase/schema.sql` e execute o SQL novamente.
- **Porta do servidor:** execute `set PORT=8080` antes de `node server.js` ou acrescente essa linha no `iniciar.bat`.
- **Horário de funcionamento / regras de uso:** podem ser incluídos no formulário e nas validações do `server.js` e do schema do Supabase.

---

## Problemas comuns

| Problema | Solução |
| --- | --- |
| “Node.js nao foi encontrado” | Instale o Node.js LTS em <https://nodejs.org> e execute o `iniciar.bat` de novo. |
| “A porta 3000 ja esta em uso” | Feche o outro programa ou use `set PORT=3001` antes de iniciar. |
| Outros moradores não acessam o servidor local | Confirme o IP mostrado na janela, se estão no mesmo Wi-Fi e se o firewall liberou o Node.js em redes privadas. |
| Site publicado abre em “Modo local” | Confira se o `config.js` tem a URL e a chave publishable do Supabase e recarregue a página sem cache. |
| Site publicado não mostra as reservas | O projeto do Supabase pode estar pausado ou o `supabase/schema.sql` não foi executado. Verifique no painel do Supabase. |
| Calendário local não atualiza | Verifique se a janela do servidor continua aberta. |
| Abri o `index.html` e ninguém vê minha reserva | Isso é o modo local. Use o link publicado para compartilhar. |

---

## Próximos passos possíveis

- Login de moradores e painel do síndico.
- Reserva por período (almoço, jantar, dia inteiro).
- Aprovação de reservas e lista de espera.
- Notificações por e-mail/WhatsApp.
- Domínio próprio no lugar do endereço `github.io`.
