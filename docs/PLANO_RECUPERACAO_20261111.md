# Plano de reconciliação da Central de Leads — 11/11/2026

## Estado verificado

O deploy publicado na Netlify é de 13/10 e foi enviado por API; o site não tem repositório vinculado. A `main` local e remota é de setembro, com quatro arquivos locais modificados. A busca no workspace, arquivos compactados e histórico remoto consultado não encontrou a fonte completa do deploy de outubro. O bundle público comprova presença de recursos, mas não recupera o código original nem comprova o comportamento completo.

A rota de verificação respondeu 401 sem credencial; as rotas de resumo e CRM responderam 503 em requisições sem credenciais. A senha válida não foi testada. As quatro funções publicadas identificadas são chatbot-monitor, dashboard-data, google-data e n8n-leads. Testes locais de n8n-leads e chatbot, build e lint passaram, sem demonstrar o estado de produção.

## Recuperação da fonte e preservação

1. Procurar o diretório ou pacote original usado no upload manual de outubro com o responsável e em backups autorizados. Conferir correspondência com o deploy e preservar as alterações locais antes de comparar.
2. Se a fonte completa não for recuperada, usar o bundle publicado como evidência de telas e fluxos e reimplementar o necessário sobre a base local, em ambiente isolado. O bundle não substitui a fonte nem garante equivalência.
3. Inventariar e validar telas, relatórios, páginas e ativos existentes; senha antiga, cadastro/edição CRM, campos e identidade, reincidência, formulários Meta, histórico persistido e avisos de leitura parcial. Identificar o contrato efetivo do CRM antes de reimplementar; confirmar gravações por leitura independente. Não supor que recursos identificados em documentos ou textos de bundle funcionam hoje.

## Acesso

Higor pediu retirar a senha. Preparar a remoção da senha da aplicação; não presumir que deseja tornar dados pessoais e operações de CRM públicos. Definir com ele uma proteção substituta e o acesso desejado antes de publicar. Uma opção é acesso individual pelo Cloudflare Access, com autorização por identidade e validação do token na origem, inclusive nos endpoints de dados e escrita; testar acesso direto ao domínio Netlify para evitar bypass. A opção exige configuração e eventual autenticação dos usuários; não foi escolhida por Higor. Sem proteção substituta, documentar claramente a exposição e obter decisão explícita antes de qualquer alteração externa.

## Backup e reversão

O arquivo `backups/dashboard-public-snapshots/netlify-public-assets-20261111T121403Z.zip` contém 15 dos 16 caminhos listados, obtidos publicamente. O arquivo de configuração listado não estava disponível; sete HTMLs servidos não coincidiram com o SHA-1 do manifesto. O ZIP passou nas verificações internas de integridade, mas é apenas snapshot parcial, não é fonte nem backup restaurável completo: não inclui funções, configuração integral ou segredos.

Preservar o deploy anterior retido na Netlify e registrar sua referência em local seguro. Republish de deploy retido é uma possível reversão de código/ativos somente se ainda disponível, não foi testada e constitui alteração em produção; não garante reversão de variáveis ou configurações externas. Não presumir que corrige os 503. Preparar e testar a reversão em ambiente isolado quando tecnicamente possível e verificar o resultado publicado após autorização.

## Critérios antes de publicar

- Reconciliar funcionalidades e ativos de outubro; preservar modificações locais existentes.
- Testar em ambiente isolado, com dados fictícios e sem mensagens ou gravações em produção: telas, acesso e negação, API, CRM com confirmação persistida, histórico, duplicidade e leitura parcial.
- Validar a proteção escolhida inclusive no acesso direto à origem, e testar falhas sem divulgar informações de clientes.
- Apresentar diff, evidência dos testes, inventário das diferenças, backup e plano realista de reversão. Publicação, alteração de acesso e configuração externa dependem de autorização específica de Higor.
