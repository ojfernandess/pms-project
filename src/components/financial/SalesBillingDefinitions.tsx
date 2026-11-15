import { Card } from "@/components/ui/card";

export function SalesBillingDefinitions() {
  return (
    <div className="space-y-4 text-sm">
      <Card className="border-primary/30 bg-primary/5 p-4">
        <p>
          Cada indicador segue: <strong>o que é</strong>, <strong>de onde vem</strong> (reservas do PMS) e{" "}
          <strong>como calcular</strong>. A lógica central está em <code>operatingReportEngine</code> — o front apenas
          exibe.
        </p>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="text-lg font-semibold">Vendas no período</h3>
        <p className="text-muted-foreground">
          Soma do <strong>valor total</strong> das reservas cuja <strong>data de criação</strong> está no intervalo. Uma
          reserva conta uma vez; o mês da hospedagem não altera o mês da venda.
        </p>
        <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs">
          Vendas no período = Σ total_amount (reservas criadas no intervalo, status válido)
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="text-lg font-semibold">Faturamento do período</h3>
        <p className="text-muted-foreground">
          Receita das <strong>diárias de hospedagem</strong> que caem no intervalo (check-in inclusivo, check-out
          exclusivo). O valor da reserva é rateado por diária; centavos residuais vão para a última diária.
        </p>
        <div className="space-y-2 font-mono text-xs">
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            Valor da diária = total_amount ÷ quantidade de diárias
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            Faturamento mensal = Σ (valor da diária × diárias do mês)
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="text-lg font-semibold">Exemplo (critério de aceite)</h3>
        <p>Reserva R$ 13.950,00 vendida em out/2026, check-in 13/10/2026, check-out 11/01/2027 (90 diárias):</p>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          <li>Out: vendas R$ 13.950 — faturamento R$ 2.945 (19 diárias)</li>
          <li>Nov: vendas R$ 0 — faturamento R$ 4.650</li>
          <li>Dez: vendas R$ 0 — faturamento R$ 4.805</li>
          <li>Jan/27: vendas R$ 0 — faturamento R$ 1.550</li>
        </ul>
        <p className="text-muted-foreground">A soma do faturamento nos quatro meses deve ser exatamente R$ 13.950,00.</p>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="text-lg font-semibold">Filtros de período</h3>
        <p className="text-muted-foreground">
          O mesmo intervalo vale para vendas e faturamento, mas cada indicador usa sua referência temporal (data da venda
          vs data da diária).
        </p>
        <ul className="list-disc pl-5 text-muted-foreground">
          <li>Hoje, ontem, últimos 7/30 dias, este mês, mês anterior, este ano, personalizado</li>
          <li>Critério de faturamento: Período (PMS) = diárias no intervalo; Pagamento/check-in = somente pagas</li>
        </ul>
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="text-lg font-semibold">Taxa de ocupação e capacidade</h3>
        <p className="text-muted-foreground">
          Diárias ocupadas = unidades distintas por noite (hospedagem válida, check-out exclusivo). Diárias disponíveis
          = inventário de hospedagem por dia, menos interdições.
        </p>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li>
            <strong>Interdição permanente</strong> (<code>is_blocked</code>): unidade fora do inventário em todo o
            período.
          </li>
          <li>
            <strong>Bloqueio no mapa</strong> (reserva <code>blocked</code> com quarto): só os dias do bloqueio.
          </li>
          <li>
            <strong>Manutenção</strong> (<code>maintenance_tickets</code>): do <code>opened_at</code> até a conclusão
            (ticket <code>completed</code>) ou até o fim do período se ainda <code>open</code> /{" "}
            <code>in_progress</code>. O status atual do quarto não bloqueia o mês inteiro.
          </li>
        </ul>
      </Card>

      <Card className="p-5 space-y-2">
        <h3 className="text-lg font-semibold">Regras de negócio</h3>
        <ul className="list-disc pl-5 text-muted-foreground space-y-1">
          <li>Reserva não entra duas vezes nas vendas.</li>
          <li>Uma reserva pode gerar faturamento em vários meses.</li>
          <li>Checkout não conta como diária.</li>
          <li>Canceladas/bloqueadas não entram.</li>
          <li>Alteração de valor ou datas recalcula a distribuição.</li>
        </ul>
      </Card>
    </div>
  );
}