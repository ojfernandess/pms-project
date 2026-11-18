import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { formatCurrency } from "@/lib/reservationUtils";

interface CashFlowChartProps {
  data?: Array<{
    date: string;
    inflows?: number;
    outflows?: number;
    /** @deprecated use inflows */
    revenue?: number;
    /** @deprecated use outflows */
    payments?: number;
  }>;
}

export const CashFlowChart = ({ data = [] }: CashFlowChartProps) => {
  let accumulatedBalance = 0;
  const formattedData = data.map((item) => {
    const inflows = item.inflows ?? item.revenue ?? 0;
    const outflows = item.outflows ?? item.payments ?? 0;
    accumulatedBalance = accumulatedBalance + inflows - outflows;
    return {
      date: new Date(item.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      inflows,
      outflows,
      balance: accumulatedBalance,
    };
  });

  if (formattedData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        Nenhum dado disponível
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
          formatter={(value: number, name: string) => [
            formatCurrency(value),
            name === "inflows" || name === "revenue"
              ? "Entradas"
              : name === "outflows" || name === "payments"
                ? "Saídas"
                : "Saldo",
          ]}
        />
        <Legend />
        <Line type="monotone" dataKey="inflows" stroke="hsl(var(--success))" strokeWidth={2} name="Entradas" />
        <Line type="monotone" dataKey="outflows" stroke="hsl(var(--destructive))" strokeWidth={2} name="Saídas" />
        <Line
          type="monotone"
          dataKey="balance"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          name="Saldo"
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

