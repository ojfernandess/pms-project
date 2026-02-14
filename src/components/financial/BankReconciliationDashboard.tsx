/**
 * Dashboard de Conciliação Bancária
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBankReconciliation } from "@/hooks/useBankReconciliation";
import { formatCurrency } from "@/lib/financialUtils";
import { Loader2, Upload, RefreshCw, Building2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BankAccountDialog } from "./BankAccountDialog";
import { ImportTransactionsDialog } from "./ImportTransactionsDialog";

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  auto_matched: "Conciliado (Auto)",
  manual_matched: "Conciliado (Manual)",
  divergent: "Divergente",
  ignored: "Ignorado",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  auto_matched: "bg-green-100 text-green-800",
  manual_matched: "bg-blue-100 text-blue-800",
  divergent: "bg-red-100 text-red-800",
  ignored: "bg-gray-100 text-gray-800",
};

export const BankReconciliationDashboard = () => {
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const filters = {
    bankAccountId: selectedBankAccount !== "all" ? selectedBankAccount : undefined,
    status: statusFilter !== "all" ? statusFilter as any : undefined,
  };

  const {
    bankAccounts,
    transactions,
    summary,
    isLoading,
    matchTransactions,
    isMatching,
  } = useBankReconciliation(filters);

  const handleAutoMatch = () => {
    matchTransactions(selectedBankAccount !== "all" ? selectedBankAccount : undefined);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Se não houver contas bancárias, mostrar mensagem
  if (!isLoading && bankAccounts.length === 0 && selectedBankAccount === "all") {
    return (
      <div className="space-y-6">
        <Card className="p-8 text-center">
          <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-semibold mb-2">Nenhuma conta bancária cadastrada</p>
          <p className="text-muted-foreground mb-4">
            Cadastre uma conta bancária para começar a conciliação
          </p>
          <Button onClick={() => setAccountDialogOpen(true)}>
            <Building2 className="h-4 w-4 mr-2" />
            Cadastrar Primeira Conta
          </Button>
        </Card>
        <BankAccountDialog
          open={accountDialogOpen}
          onOpenChange={setAccountDialogOpen}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cards de Resumo */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold mt-1">{summary.total}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(summary.total_amount)}
                </p>
              </div>
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendente</p>
                <p className="text-2xl font-bold mt-1 text-yellow-600">{summary.pending}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conciliado</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {summary.auto_matched + summary.manual_matched}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(summary.matched_amount)}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Divergente</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{summary.divergent}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </Card>
        </div>
      )}

      {/* Filtros e Ações */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <Select value={selectedBankAccount} onValueChange={setSelectedBankAccount}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Selecione a conta bancária" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Contas</SelectItem>
              {bankAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.bank_name} - {account.account_number}
                  {account.is_default && " (Padrão)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="auto_matched">Conciliado (Auto)</SelectItem>
              <SelectItem value="manual_matched">Conciliado (Manual)</SelectItem>
              <SelectItem value="divergent">Divergente</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleAutoMatch}
              disabled={isMatching}
            >
              {isMatching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Conciliando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Conciliar Automático
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
            >
              <Upload className="h-4 w-4 mr-2" />
              Importar Extrato
            </Button>
            <Button onClick={() => setAccountDialogOpen(true)}>
              <Building2 className="h-4 w-4 mr-2" />
              Nova Conta
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabela de Transações */}
      <Card>
        <div className="p-4 border-b">
          <h3 className="text-lg font-semibold">Transações Bancárias</h3>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            Nenhuma transação encontrada
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell>
                    {format(new Date(transaction.transaction_date), "PPP", { locale: ptBR })}
                  </TableCell>
                  <TableCell>{transaction.description || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={transaction.transaction_type === 'credit' ? 'default' : 'destructive'}>
                      {transaction.transaction_type === 'credit' ? 'Crédito' : 'Débito'}
                    </Badge>
                  </TableCell>
                  <TableCell className={transaction.transaction_type === 'credit' ? 'text-green-600' : 'text-red-600'}>
                    {transaction.transaction_type === 'credit' ? '+' : '-'}
                    {formatCurrency(transaction.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[transaction.reconciliation_status]}>
                      {statusLabels[transaction.reconciliation_status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {transaction.import_source && (
                      <Badge variant="outline">{transaction.import_source.toUpperCase()}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Dialogs */}
      <BankAccountDialog
        open={accountDialogOpen}
        onOpenChange={setAccountDialogOpen}
      />
      <ImportTransactionsDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        bankAccounts={bankAccounts}
      />
    </div>
  );
};

