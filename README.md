# PROERD DIGITAL | PoC 0.1

Aplicação web inicial para validar o fluxo:
1. cadastro de escola;
2. abertura de demanda;
3. designação de instrutor;
4. aceite ou recusa justificada;
5. registro de atividade;
6. validação administrativa;
7. painel de indicadores.

## Aviso de uso
Esta é uma prova de conceito independente, sem vínculo ou integração com sistemas da PMDF. Use exclusivamente dados fictícios. Não cadastre nomes, matrículas, telefones, e-mails funcionais, dados de alunos, documentos, endereços reais ou informações operacionais. Não use esta PoC para decisões ou rotinas oficiais.

## Requisitos
- Node.js 20 ou superior
- Conta gratuita Supabase
- Conta GitHub
- Conta Render

## 1. Criar o banco no Supabase
1. Crie um projeto novo no Supabase, exclusivo para esta PoC.
2. Guarde a senha do banco em seu gerenciador de senhas. Não a envie por chat.
3. Abra SQL Editor > New query.
4. Copie e execute todo o conteúdo de `supabase/migrations/001_initial_schema.sql`.
5. Em Authentication > Providers, mantenha habilitado Email.
6. Para facilitar os testes, você pode desabilitar temporariamente a confirmação de e-mail em Authentication > Settings, mas reative-a antes de qualquer uso além do ambiente isolado.

## 2. Rodar localmente
1. Instale Node.js 20+.
2. Extraia o ZIP.
3. Na pasta do projeto, copie `.env.example` para `.env`.
4. No Supabase, abra Project Settings > API. Copie Project URL e a chave publicável (anon/publishable) para `.env`:
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_ANON_KEY=...`
5. Nunca use `service_role` no frontend.
6. No terminal, execute:

```bash
npm install
npm run dev
```

7. Abra o endereço local indicado pelo Vite.

## 3. Criar o primeiro administrador de teste
1. Na tela da aplicação, crie uma conta com e-mail de teste e senha forte.
2. Confirme o e-mail, se necessário, e entre.
3. No Supabase, abra SQL Editor e execute, substituindo pelo e-mail fictício utilizado:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and u.email = 'seu-email-de-teste@exemplo.com';
```

4. Saia e entre novamente na aplicação. O perfil será carregado com papel de administrador.
5. Crie escolas fictícias.
6. Cadastre pelo menos uma conta de instrutor em janela anônima ou outro navegador. O perfil novo começa como instrutor.
7. Como administrador, designe demandas ao instrutor.

## 4. Publicar no GitHub
1. Crie um repositório privado chamado `proerd-digital-poc`.
2. Não envie o arquivo `.env`. O `.gitignore` já o exclui.
3. Envie os arquivos do projeto para o repositório.

Se usar Git no computador:

```bash
git init
git add .
git commit -m "Primeira versão da PoC PROERD DIGITAL"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/proerd-digital-poc.git
git push -u origin main
```

## 5. Publicar gratuitamente no Render
1. Entre no Render e conecte sua conta GitHub.
2. Selecione New > Static Site.
3. Escolha o repositório `proerd-digital-poc`.
4. Configure:
   - Branch: `main`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
5. Em Environment, adicione:
   - `VITE_SUPABASE_URL` = URL do projeto Supabase
   - `VITE_SUPABASE_ANON_KEY` = chave publicável/anon do Supabase
6. Clique em Create Static Site.
7. O Render fornecerá um endereço gratuito `*.onrender.com`.
8. Em cada atualização enviada ao GitHub, o Render poderá publicar uma nova versão automaticamente.

## 6. Teste de aceite recomendado
- [ ] Criar usuário administrador de teste.
- [ ] Criar usuário instrutor de teste.
- [ ] Cadastrar uma escola fictícia.
- [ ] Criar demanda para uma turma fictícia.
- [ ] Designar a demanda ao instrutor.
- [ ] Aceitar a designação.
- [ ] Registrar a atividade.
- [ ] Validar a atividade como administrador.
- [ ] Conferir o indicador de atividades validadas.
- [ ] Confirmar que o instrutor não enxerga escolas, demandas ou atividades de outros instrutores.

## Limitações conhecidas da versão 0.1
- Não há integração com Gênesis, SGPol, SEI GDF, Gmail ou sistemas internos.
- Não há portal externo para escolas.
- Não há envio real de e-mail ou notificações push.
- Não há exportação Excel/PDF.
- O histórico de auditoria registra eventos básicos, mas ainda não guarda comparação detalhada dos valores antes/depois.
- A recusa de designação usa função de banco controlada; a devolução de atividade e as demais regras ainda precisam de testes de segurança adicionais antes de ampliar o uso.
- O perfil inicial é instrutor. A promoção a administrador é manual no banco.
- O acesso é por e-mail e senha; MFA e políticas institucionais ainda não foram configurados.

## Segurança e governança
Este código é um ponto de partida para testes técnicos, não uma solução pronta para uso institucional ou produção. Antes de qualquer piloto com dados reais, é indispensável avaliação e autorização da PMDF, análise de segurança, revisão das políticas RLS, proteção de dados pessoais e de crianças/adolescentes, política de retenção, backups, recuperação, gestão de incidentes e definição de responsáveis pelo sistema.
