# Socialfy Agenda

Snapshot do cal.com na versao MIT (repositorio `calcom/cal.diy`, commit `b3321936c347744a759e0f36a9793bb78c9bca78`),
com marca Socialfy e o workflow `.github/workflows/build-image.yml` que constroi a imagem
`ghcr.io/marcosdanielsf/calcom-agenda` para a VPS da Socialfy. Licenca: `LICENSE` (MIT, Cal.com, Inc.).

## Modo visual do Nexus

Atualizado: 2026-10-06 10:12 BRT. Implementacao local, sem deploy ou aceite de produto.

`?shell=nexus` retira sidebar, topo, navegacao inferior, atalhos globais e modal promocional.
Titulos, filtros, acoes locais, dialog de fuso e guards de autenticacao/onboarding continuam ativos.
Funciona em `/event-types`, `/bookings/upcoming`, `/availability`, `/apps`,
`/settings/my-account/profile` e descendentes dessas areas. `/bookings` e so o prefixo;
o destino da aba Reservas deve ser `/bookings/upcoming`.

A preferencia dura 24 horas no cookie host-only `nexus_agenda_shell`, `Path=/`,
`SameSite=Lax`, `Secure` em HTTPS. O servidor entrega a preferencia inicial e o cliente
preserva o modo ao navegar sem query. `?shell=standalone` remove a preferencia e restaura
a casca original. `?standalone=true` conserva o contrato legado, sem aplicar o tema Nexus.
Fora das cinco areas, o modo nao altera a pagina. O cookie e somente visual e nunca autentica.

`?theme=dark` e `?theme=light` selecionam o tema; valor invalido cai para claro. A preferencia
dura 24 horas no cookie host-only `nexus_agenda_theme` e acompanha navegacao e F5. Mensagem do
parent usa exclusivamente `{ type: "nexus:theme", theme: "light" | "dark" }`, origem
`https://nexus.socialfy.me` e `source === window.parent`; chaves extras sao recusadas. A
mensagem atualiza cookie e query com `history.replaceState`, preservando o state do Next. Depois
de instalar o listener, o filho envia `{ type: "nexus:theme-ready" }` para a origem permitida;
isso permite ao parent reenviar o tema sem corrida de hidratacao.

Roboto e carregada pelo `next/font`; ambos os temas usam corpo 14px/21px, raio 8px e pagina
transparente. Um script estatico nonceado aplica `html.dark` no `head`, o ThemeProvider recebe
`forcedTheme` somente durante o modo Nexus, e o marcador SSR e o primeiro filho do `body`.
Assim tokens, utilitarios `dark:*`, app e portais convergem antes da hidratacao; ao sair, o tema
standalone anterior e restaurado. As rotas cobertas estao no App Router; `_document.tsx` foi
inspecionado e nao precisa de alteracao. Dentro de iframe cross-site, o cookie `SameSite=Lax`
pode nao gravar, mas a query sincronizada conserva o tema na aba.

Em producao, nenhuma origem alem de `https://nexus.socialfy.me` e aceita. Runtime local pode
declarar `NEXUS_AGENDA_LOCAL_PARENT_ORIGIN`, somente fora de producao e somente para origem
loopback exata. `agenda-preview.socialfy.me` nao esta liberado; um preview remoto exigira
configuracao server-owned explicita futura.

Arquivos tocados em `apps/web/` estao sob o `LICENSE` MIT da raiz. O inventario Git desta
base nao contem pasta `ee`; nenhuma area comercial, embed, pagamento ou API de plataforma
foi importada. Avisos de copyright e licenca ficam preservados na distribuicao.

Validacao reproduzivel, na raiz deste fork com Node 20 e dependencias instaladas:

```sh
node .yarn/releases/yarn-4.12.0.cjs vitest run apps/web/modules/shell/Shell.nexus.test.tsx
node scripts/nexus-shell-style-smoke.mjs
node .yarn/releases/yarn-4.12.0.cjs type-check:ci --force
node .yarn/releases/yarn-4.12.0.cjs biome check apps/web/app/layout.tsx apps/web/modules/shell/NexusShell.tsx apps/web/modules/shell/nexusThemeOrigin.ts apps/web/modules/shell/Shell.nexus.test.tsx apps/web/styles/nexus-shell.css scripts/nexus-shell-style-smoke.mjs
```

O teste novo falhou primeiro em 11 cenarios de tema; a revisao de precedencia acrescentou mais
dois vermelhos antes da correcao. A suite focal cobre HTML de documento SSR, cookie, query,
navegacao, F5, origem/source/payload do `postMessage`, URL e history state. O smoke Chromium
mede os dois temas, tipografia, raio, tokens e `dialog` no body como portal. Nenhum deles prova
login integrado, dados reais ou produto em `socialfy.me`.

Resultados locais desta sessao: 44 testes de componente aprovados e smoke de CSS aprovado,
incluindo regras reais `dark:text-white` e `dark:bg-cal-muted` do CSS compilado.
O typecheck completo aprovou 9 tarefas antes do ultimo ajuste de precedencia; o gate final foi
reexecutado antes do commit local. Biome ficou sem erros; avisos informativos de regras nursery
e `!important` preservam comportamento preexistente contra variaveis inline.

## Limites conhecidos do modo integrado

- **Cookie dentro de iframe.** Em iframe de outro site o navegador nao grava o cookie `SameSite=Lax`.
  Nesse caso so a query (`?shell=nexus`) mantem o modo, entao a tela embutida precisa carregar com ela
  em toda navegacao inicial. Fora de iframe o cookie guarda a preferencia por 24 horas.
- **Origem do pai fixa.** A origem que pode mandar o tema por `postMessage` esta fixa em
  `https://nexus.socialfy.me` (`NexusShell.tsx`, constante `NEXUS_THEME_PARENT_ORIGIN`). Um dominio
  white-label nao sincroniza o tema por mensagem: ele cai na query `theme` ou no cookie.
- **Tema escuro e `color-scheme`.** O Nexus fixa `color-scheme` claro na pagina que contem o iframe.
  Com o tema escuro, o navegador pinta o fundo do iframe opaco em vez de transparente, entao o
  conteudo escuro nao deixa ver o fundo da pagina pai.
- **Topo mobile de Configuracoes.** No modo integrado some apenas o topo padrao. O topo injetado por
  Configuracoes fica, porque abaixo de 1024 px ele e o unico botao que abre o menu interno.

SSO, abas no Nexus e projecao de reservas no CRM sao proximas pecas do plano
`docs/plans/2026-10-05-2305-agenda-modulo-nativo.md` no repositorio Nexus. A prova de produto
fica para dominio Socialfy apos deploy autorizado pelo Marcos. Rollback visual: remover
o parametro e o cookie ou usar `?shell=standalone`; nao ha migration nesta entrega.

## Login unico

Atualizado: 2026-10-06 BRT. Receptor do login unico Nexus para Agenda (`POST /api/nexus/sso`).
Contrato dos dois lados: `docs/contracts/nexus-agenda-sso-v1.md` no repo do Nexus.

O Nexus assina um token Ed25519 de ate 60 s e o navegador o posta num formulario
(`token`, `dest`, `theme`). A Agenda confere `Origin`, assinatura, `iss`, `aud`, validade e
`jti` de uso unico (`VerificationToken` com `identifier = nexus-sso`), vincula ou cria a conta
(`Account` com `provider = nexus`, `providerAccountId = sub`; email igual ao de conta nao
vinculada e 409, nunca vincula por email) e responde 303 com o cookie de sessao do motor (8 h).

Envs do runtime da Agenda:

- `NEXUS_AGENDA_SSO_PUBLIC_KEY`: PEM spki da chave publica, multilinha ou numa linha so com
  `\n` literal. Sem ela a rota responde 503 `agenda_sso_unavailable`.
- `NEXUS_AGENDA_LOCAL_PARENT_ORIGIN`: origem loopback exata aceita no `Origin`, so fora de producao.
- `NEXTAUTH_SECRET` (ja existente): segredo que assina o cookie de sessao.

Fora da v1: logout conjunto (sair do Nexus nao derruba a sessao da Agenda antes das 8 h) e troca
de conta do Nexus no mesmo navegador. O cadastro publico fica fechado no build
(`NEXT_PUBLIC_DISABLE_SIGNUP=true`).
