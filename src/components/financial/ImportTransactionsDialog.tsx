/**
 * Dialog para importar transações bancárias
 */

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBankReconciliation } from "@/hooks/useBankReconciliation";
import { Loader2, Upload } from "lucide-react";
import type { BankAccount } from "@/services/financial/bankReconciliationService";
import { toast } from "sonner";

interface ImportTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bankAccounts: BankAccount[];
}

export const ImportTransactionsDialog = ({
  open,
  onOpenChange,
  bankAccounts,
}: ImportTransactionsDialogProps) => {
  const { importTransactions, isImporting } = useBankReconciliation();
  const [selectedAccount, setSelectedAccount] = useState("");
  const [importSource, setImportSource] = useState<'csv' | 'ofx' | 'cnab' | 'manual'>('csv');
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const parseCSV = (csvText: string) => {
    const lines = csvText.split('\n');
    const transactions: Array<{
      transaction_date: string;
      amount: number;
      description: string;
      transaction_type: 'credit' | 'debit';
    }> = [];

    // Pular header se existir
    const startLine = lines[0].includes('data') || lines[0].includes('Data') ? 1 : 0;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = line.split(',').map(col => col.trim().replace(/^"|"$/g, ''));
      
      if (columns.length >= 3) {
        const date = columns[0];
        const amount = parseFloat(columns[1].replace(/[^\d.,-]/g, '').replace(',', '.'));
        const description = columns[2] || '';
        const type = amount >= 0 ? 'credit' : 'debit';

        if (date && !isNaN(amount)) {
          transactions.push({
            transaction_date: date,
            amount: Math.abs(amount),
            description,
            transaction_type: type,
          });
        }
      }
    }

    return transactions;
  };

  const handleImport = async () => {
    if (!selectedAccount || !file) {
      toast.error("Selecione uma conta e um arquivo");
      return;
    }

    try {
      const fileText = await file.text();
      const transactions = parseCSV(fileText);

      if (transactions.length === 0) {
        toast.error("Nenhuma transação encontrada no arquivo");
        return;
      }

      importTransactions(
        {
          bankAccountId: selectedAccount,
          transactions,
          importSource,
          fileName: file.name,
        },
        {
          onSuccess: () => {
            onOpenChange(false);
            setFile(null);
            setSelectedAccount("");
          },
        }
      );
    } catch (error: any) {
      toast.error(`Erro ao processar arquivo: ${error.message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Importar Extrato Bancário</DialogTitle>
          <DialogDescription>
            Importe transações de um arquivo CSV, OFX ou CNAB
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="bank_account">Conta Bancária *</Label>
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.bank_name} - {account.account_number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="import_source">Formato do Arquivo *</Label>
            <Select value={importSource} onValueChange={(value: any) => setImportSource(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="ofx">OFX</SelectItem>
                <SelectItem value="cnab">CNAB</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="file">Arquivo *</Label>
            <Input
              id="file"
              type="file"
              accept=".csv,.ofx,.txt"
              onChange={handleFileChange}
            />
            {file && (
              <p className="text-sm text-muted-foreground mt-1">
                Arquivo selecionado: {file.name}
              </p>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="font-semibold mb-1">Formato CSV esperado:</p>
            <p>Data, Valor, Descrição</p>
            <p className="text-xs mt-1">Exemplo: 2025-01-15, 1000.00, Depósito</p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setFile(null);
              setSelectedAccount("");
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={isImporting || !selectedAccount || !file}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Importar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

