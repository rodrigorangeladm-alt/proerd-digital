# Integração do fluxo de solicitação e autorização

Arquivos:
- `supabase/migrations/20261115_service_demand_authorization.sql`
- `src/ServiceDemandWorkflow.tsx`

## Alteração necessária em `src/App.tsx`

Adicione junto aos imports:
```tsx
import ServiceDemandWorkflow from "./ServiceDemandWorkflow";
```

Substitua o bloco atual `{tab==="demands" && <section> ... </section>}` por:
```tsx
{tab === "demands" && (
  <ServiceDemandWorkflow
    supabase={supabase!}
    profile={profile}
    schools={schools}
    demands={demands}
    onRefresh={refresh}
  />
)}
```

O `refresh()` existente já carrega as demandas e escolas. A migração acrescenta leitura das demandas pelo instrutor que as criou.

## Aplicação
1. Faça backup do banco de testes.
2. Execute o SQL no SQL Editor do Supabase.
3. Integre os dois arquivos ao projeto.
4. Rode `npm run build` e corrija eventuais incompatibilidades antes de publicar.

## Regras
- Instrutor envia pedido com status `Aguardando autorização`.
- Administração pode autorizar, indeferir ou devolver para correção.
- Ao autorizar, a demanda fica atribuída ao instrutor solicitante.
- O registro de atividade continua condicionado à demanda autorizada.
- A migração mantém os status legados do fluxo anterior.

A integração ao GitHub/Render não foi feita nesta etapa. Use dados fictícios na PoC.
