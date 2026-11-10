# Área Gourmet · Reservas do Condomínio

Aplicativo web para os moradores reservarem e cancelarem o uso da área gourmet.
Todos veem no calendário quais dias estão reservados e quem reservou.

Esta pasta está em:

```
C:\Users\bruno\OneDrive\Documentos\deepseek-harness\default-workspace\agendamento-area-gourmet
```

---

## Como usar

### Opção 1 — Compartilhado entre os moradores (recomendado)

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
| Compartilhado (`iniciar.bat`) | `data/reservations.json` |
| Local (`index.html`) | Armazenamento do próprio navegador (localStorage) |

**Backup:** com o servidor parado, copie o arquivo `data/reservations.json` para outro lugar. Para restaurar, basta colocá-lo de volta na pasta `data`.

O arquivo começa vazio (`{"reservations": []}`). As reservas são gravadas automaticamente a cada reserva/cancelamento.

---

## Regras e limites atuais

- Não há login nem senha: o cancelamento é validado pelo nome + apartamento informados. Quem souber esses dados pode cancelar uma reserva. Para um controle mais rígido, o próximo passo seria criar login de morador e/ou uma senha de administração.
- Os nomes e apartamentos ficam visíveis para todos que acessam o endereço.
- Limite de **40 pessoas** por reserva (pode ser alterado no código).
- Sem controle de horário: a reserva é para o dia inteiro. Se precisar de períodos (almoço/jantar), é possível evoluir.
- O servidor precisa estar ligado para o modo compartilhado funcionar.
- Para acesso pela internet (fora do Wi-Fi), o ideal é publicar o projeto em uma hospedagem; abrir porta no roteador exige cuidados de segurança.

---

## Estrutura dos arquivos

```
agendamento-area-gourmet/
├── index.html              Interface (calendário, modais, textos)
├── assets/
│   ├── styles.css          Visual do aplicativo
│   └── app.js              Lógica do calendário, reservas e cancelamentos
├── server.js               Servidor local + API (sem dependências externas)
├── iniciar.bat             Atalho para iniciar o modo compartilhado
├── package.json            Metadados e comando "npm start"
├── LEIA-ME.md              Este arquivo
└── data/
    └── reservations.json   Reservas (criado automaticamente)
```

---

## Personalização rápida

- **Nome do condomínio / título:** edite o cabeçalho em `index.html`.
- **Regras exibidas no site:** edite a seção “Como funciona” em `index.html`.
- **Cores e fontes:** edite as variáveis no início de `assets/styles.css` (`:root`).
- **Limite de pessoas:** ajuste `MAX_GUESTS` em `assets/app.js` e em `server.js` (os dois precisam ficar iguais).
- **Porta do servidor:** execute `set PORT=8080` antes de `node server.js` ou acrescente essa linha no `iniciar.bat`.
- **Horário de funcionamento / regras de uso:** podem ser incluídos no formulário e nas validações do `server.js`.

---

## Problemas comuns

| Problema | Solução |
| --- | --- |
| “Node.js nao foi encontrado” | Instale o Node.js LTS em <https://nodejs.org> e execute o `iniciar.bat` de novo. |
| “A porta 3000 ja esta em uso” | Feche o outro programa ou use `set PORT=3001` antes de iniciar. |
| Outros moradores não acessam | Confirme o IP mostrado na janela do servidor, se estão no mesmo Wi-Fi e se o firewall do Windows liberou o Node.js em redes privadas. |
| Calendário não atualiza | Verifique se a janela do servidor continua aberta. |
| Abri o `index.html` e ninguém vê minha reserva | Isso é o modo local. Use o `iniciar.bat` para compartilhar. |

---

## Próximos passos possíveis

- Login de moradores e painel do síndico.
- Reserva por período (almoço, jantar, dia inteiro).
- Aprovação de reservas e lista de espera.
- Notificações por e-mail/WhatsApp.
- Publicação em nuvem para acesso fora do condomínio.
