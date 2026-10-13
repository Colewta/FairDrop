# FairDrop Frontend

React + TypeScript + Vite. A interface oferece demonstração em um clique,
importação guiada em três passos, modelos salvos, lotes de previsão e revisão
individual com fatores e histórico. Veja o [guia principal](../README.md).

## Executar

Node.js 22 e backend disponível em localhost:8000:

```powershell
npm install
npm run dev
```

Abra http://localhost:5173. Para executar backend e frontend pelo Docker, use
`docker compose up --build -d` na raiz `FairDrop`. O frontend roda em Node.js 22
com `npm install` e `npm run dev`; o Compose configura o acesso ao Vite e a URL
da API. As dependências ficam em um volume separado de `node_modules`.

A raiz também possui o iniciador Windows `Iniciar FairDrop.cmd`.

`VITE_API_URL` altera a API. No Compose da raiz, aponta para a porta publicada
do backend no computador. No build o padrão é `/api`, encaminhado pelo Nginx
quando se usa a configuração anterior de `Frontend/Dockerfile`.
A interface atual não possui formulário de chave de acesso. Use o backend com
`FAIRDROP_API_TOKEN` vazio para esta interface. A página inicial explica os
caminhos de uso. O modo técnico é opcional.

## Validar

```powershell
npm run lint
npm run build
npm run test:e2e
```

Playwright testa a importação guiada até a previsão e o caminho com modelos
pré-treinados. Usa Edge headless e servidores temporários nas portas 8017/5177.
Screenshots e dados de teste ficam em `test-results`, fora do Git.
Em sistemas sem Edge, altere `channel` no `playwright.config.ts` e instale o
navegador desejado pelo Playwright.

## Páginas

`/`, `/datasets`, `/datasets/new`, `/datasets/:id`, `/models`, `/models/:id`,
`/predictions`, `/predictions/new`, `/predictions/:id`, `/students/:id`.
O fluxo anterior permanece em `/legacy`. Cards, gráficos e serviços legados
continuam disponíveis; as páginas novas usam contratos tipados em `types/platform.ts`.
