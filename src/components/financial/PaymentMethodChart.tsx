import { Pie, PieChart, ResponsiveContainer, Tooltip, Legend, Cell } from "recharts";
import { formatCurrency } from "@/lib/reservationUtils";
import { formatPaymentMethod } from "@/lib/financialUtils";

interface PaymentMethodChartProps {
  data?: Record<string, number>;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(var(--accent))",
  "hsl(var(--muted))",
  "hsl(var(--destructive))",
];

export const PaymentMethodChart = ({ data = {} }: PaymentMethodChartProps) => {
  const chartData = Object.entries(data).map(([method, amount]) => ({
    name: formatPaymentMethod(method),
    value: amount,
  }));

  if (chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground">
        Nenhum dado disponível
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name}: ${(Number(percent ?? 0) * 100).toFixed(0)}%`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
          }}
          formatter={(value: number) => formatCurrency(value)}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
};

