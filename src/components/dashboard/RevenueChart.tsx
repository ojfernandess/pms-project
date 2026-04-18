import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/reservationUtils";

interface RevenueChartProps {
  data?: Array<{ date: string; revenue: number }>;
}

export const RevenueChart = ({ data = [] }: RevenueChartProps) => {
  // Os dados já vêm formatados do hook (apenas dia do mês)
  const formattedData = data;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={formattedData}>
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
            borderRadius: "8px"
          }}
          formatter={(value: number) => [formatCurrency(value), "Faturamento"]}
        />
        <Bar 
          dataKey="revenue" 
          fill="hsl(var(--primary))" 
          radius={[8, 8, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};
