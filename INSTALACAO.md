# Contagem de Pneus — instalação

Pacote pronto para subir em domínio próprio. São três etapas: publicar os
arquivos, criar o servidor de dados e ligar os dois.

Tempo estimado: 20 a 30 minutos, uma vez só.

---

## O que vem na pasta

| Arquivo | Para que serve |
|---|---|
| `index.html` | O app inteiro. É o único arquivo que você edita. |
| `manifest.json` | Faz o app virar ícone na tela do celular. |
| `sw.js` | Deixa o app abrir mesmo sem internet. |
| `icone-192.png` / `icone-512.png` | Ícone do app. |
| `apps-script.gs` | Servidor: guarda os dados e envia o e-mail diário. |

---

## Passo 1 — Publicar os arquivos

Suba a pasta inteira para o seu domínio, por exemplo em
`https://pneus.consorciorecifeambiental.com.br` ou
`https://www.consorciorecifeambiental.com.br/pneus/`.

**Duas exigências:**

- Tem que ser **HTTPS**. Sem isso o celular não instala o ícone nem guarda os dados.
- Os cinco arquivos ficam **na mesma pasta**, sem renomear nada.

Se a empresa já tem hospedagem, é só jogar a pasta via FTP ou pelo painel.
Se não tiver, o **Netlify** resolve de graça: entre em `app.netlify.com/drop`
e arraste a pasta para a página — sai no ar em segundos, com HTTPS. Depois dá
para apontar o domínio da empresa para lá.

Abra o endereço no navegador. O app deve aparecer funcionando, com o aviso
"só neste aparelho" no topo — é o esperado até o passo 3.

---

## Passo 2 — Criar o servidor (Google Apps Script)

É ele que junta a contagem de todo mundo e dispara o e-mail. Use uma conta
Google da empresa.

1. Abra **script.google.com** e clique em **Novo projeto**.
2. Dê o nome de *Contagem de Pneus*.
3. Apague o código de exemplo, abra o arquivo `apps-script.gs` num editor de
   texto, copie tudo e cole ali.
4. No começo do código, confira estas quatro linhas:

   ```js
   var EMAIL = "italo.amaro@consorciorecifeambiental.com.br";
   var COPIA = "";        // outro e-mail em cópia, se quiser
   var HORA_ENVIO = 18;   // hora do relatório automático
   var EMPRESA = "Consórcio Recife Ambiental";
   ```

5. Salve (ícone do disquete).
6. No seletor de funções, escolha **instalar** e clique em **Executar**.
   O Google vai pedir autorização: *Revisar permissões* → escolha a conta →
   *Avançado* → *Acessar Contagem de Pneus (não seguro)* → *Permitir*.
   O aviso aparece porque o script é seu, não passou pela revisão do Google.
7. Ainda no Apps Script, clique em **Implantar → Nova implantação**.
   - Tipo: **App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   - **Implantar**
8. Copie o endereço que aparece. Termina com `/exec`.

> "Qualquer pessoa" vale para o endereço do script, não para a sua conta
> Google. Quem tiver o endereço consegue gravar contagem, então não divulgue
> fora da equipe.

---

## Passo 3 — Ligar o app ao servidor

Abra o `index.html` num editor de texto. Bem no começo do bloco de código,
procure:

```js
var API = "";
```

Cole o endereço do passo 2 entre as aspas:

```js
var API = "https://script.google.com/macros/s/AKfy.../exec";
```

Salve e suba o arquivo de novo. Recarregue o app: o topo deve mostrar
**sincronizado**. A partir daí todo mundo que abrir o endereço vê a mesma
contagem.

---

## Passo 4 — Colocar o ícone no celular

Mande o endereço para a equipe. Cada um abre no celular:

- **Android / Chrome** — menu de três pontinhos → *Adicionar à tela inicial*
- **iPhone / Safari** — botão de compartilhar → *Adicionar à Tela de Início*

Fica um ícone verde de pneu, abrindo em tela cheia como qualquer aplicativo.

---

## Como funciona o dia a dia

Cada pneu tem quatro campos:

| Campo | O que é |
|---|---|
| **Saldo do sistema** | O que o sistema diz que deveria ter |
| **Contagem** | O que foi contado no pátio |
| **Entrada** | O que entrou e ainda não baixou no sistema |
| **ME** | Material em manutenção externa |

A diferença sai sozinha:

```
Diferença = Contagem + Entrada + ME − Saldo do sistema
```

- Diferença **negativa** → **FALTA** (cartão fica vermelho)
- Diferença **positiva** → **SOBRA** (cartão fica laranja)
- **Zero** → confere (cartão fica verde)

A aba **Diferenças** junta tudo que não bateu, ordenado da maior falta para a
maior sobra.

O botão **+ Pneu** cadastra medida, marca e código novos. O pneu entra na
lista de toda a equipe.

Ao tocar em **Finalizar dia e enviar planilha**, o servidor manda o e-mail com
a planilha anexa, em três abas: *Contagem*, *ALERTA - Diferenças* e *Resumo*.
Quando há falta ou sobra, o assunto começa com `[ALERTA]` e as linhas
divergentes vêm coloridas.

Todo dia no horário configurado (18h por padrão) o relatório também sai
sozinho, sem ninguém precisar tocar em nada.

---

## Ajustes comuns

**Trocar o horário do e-mail** — no Apps Script, mude `HORA_ENVIO`, salve e
execute `instalar` de novo.

**Mandar para mais gente** — preencha `COPIA` com o outro endereço.

**Testar o e-mail agora** — execute a função `testarEnvio`.

**Ver os dados brutos** — execute `instalar` e olhe o registro: ele mostra o
link da planilha "Contagem de Pneus — base de dados", criada no Drive da conta.

**Publicar uma alteração no app** — depois de mexer no `index.html`, abra o
`sw.js` e troque `pneus-v1` por `pneus-v2`. Sem isso o celular pode continuar
mostrando a versão antiga.

---

## Se algo não funcionar

**Fica sempre em "sem conexão"** — o endereço do `API` provavelmente está
errado ou a implantação não está como "Qualquer pessoa". Abra o endereço
direto no navegador: deve responder `{"ok":true,...}`.

**O e-mail não chega** — confira a caixa de spam. No Apps Script, em
*Execuções*, dá para ver se o disparo rodou e qual foi o erro. Conta Google
gratuita envia até 100 e-mails por dia; Workspace, 1.500.

**O ícone não aparece na opção do celular** — só funciona em HTTPS, e o
`manifest.json` precisa estar na mesma pasta do `index.html`.

**Dois lançaram ao mesmo tempo** — o app junta os dois: cada aparelho só grava
por cima dos pneus que ele mesmo mexeu. Nada se perde.

---

## Segurança

Não há senha. Quem tiver o endereço consegue lançar e apagar contagem. Para o
uso no pátio isso costuma bastar, mas trate o link como interno.

Se precisar de controle de acesso, o caminho é publicar o app numa área do
site já protegida por login, ou trocar o Apps Script por um backend com
autenticação.
