# Socialfy Agenda

Snapshot do cal.com na versao MIT (repositorio `calcom/cal.diy`, commit `b3321936c347744a759e0f36a9793bb78c9bca78`),
com marca Socialfy e o workflow `.github/workflows/build-image.yml` que constroi a imagem
`ghcr.io/marcosdanielsf/calcom-agenda` para a VPS da Socialfy. Licenca: `LICENSE` (MIT, Cal.com, Inc.).

## Modo visual do Nexus

Atualizado: 2026-10-06 00:48 BRT. Implementacao local, sem deploy ou aceite de produto.

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

Roboto e carregada pelo `next/font`; o tema claro usa os tokens aprovados de `v2-shell.css`
do Nexus, corpo 14px/21px e raio 8px. O marcador renderizado no servidor ativa o CSS tambem
para portais, sem escrita global de estilo em effects. A preferencia escura anterior retorna
ao sair do modo. Com `.dark` no elemento `html`, os utilitarios `dark:` continuam ativos e a
tela pode ficar misturada no tema escuro. Dentro de iframe cross-site, o cookie `SameSite=Lax`
nao grava; nesse caso, somente a query mantem o modo, inclusive na peca 3.

Arquivos tocados em `apps/web/` estao sob o `LICENSE` MIT da raiz. O inventario Git desta
base nao contem pasta `ee`; nenhuma area comercial, embed, pagamento ou API de plataforma
foi importada. Avisos de copyright e licenca ficam preservados na distribuicao.

Validacao reproduzivel, na raiz deste fork com Node 20 e dependencias instaladas:

```sh
node .yarn/releases/yarn-4.12.0.cjs vitest run apps/web/modules/shell/Shell.nexus.test.tsx
node scripts/nexus-shell-style-smoke.mjs
node .yarn/releases/yarn-4.12.0.cjs type-check:ci --force
```

O primeiro teste rodou contra o Shell original: cinco falhas pela sidebar ainda montada.
Os testes de componente cobrem servidor, cookie, saida, navegacao, CTAs e rotas recusadas;
o smoke Chromium mede somente a cascata CSS, inclusive portal e restauracao. Nenhum deles
prova login integrado, dados reais ou produto em `socialfy.me`.

Resultados locais: 22 testes de componente aprovados, smoke de CSS aprovado e typecheck
completo com 9 tarefas aprovadas. Biome sem erros, com 16 avisos de estilo e
sugestoes informativas. O typecheck revelou mock de cores desatualizado em
`packages/lib/__mocks__/constants.ts`; os dois valores foram alinhados as constantes
ja existentes do fork. Esse arquivo tambem esta sob a licenca MIT da raiz.

SSO, abas no Nexus e projecao de reservas no CRM sao proximas pecas do plano
`docs/plans/2026-10-05-2305-agenda-modulo-nativo.md` no repositorio Nexus. A prova de produto
fica para dominio Socialfy apos deploy autorizado pelo Marcos. Rollback visual: remover
o parametro e o cookie ou usar `?shell=standalone`; nao ha migration nesta entrega.
