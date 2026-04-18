import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Upload, X, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { useWebCheckin } from "@/hooks/useWebCheckin";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

interface DocumentUploadStepProps {
  webCheckin: any;
  token: string;
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export function DocumentUploadStep({
  webCheckin,
  token,
  data,
  onNext,
  onBack,
  isFirstStep,
}: DocumentUploadStepProps) {
  const { t } = useTranslation();
  const { saveDocuments } = useWebCheckin();
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  const [lgpdModalOpen, setLgpdModalOpen] = useState(false);

  // Filtrar apenas hóspedes válidos (com nome preenchido)
  const allGuests = data.guests || webCheckin?.guest_data?.guests || webCheckin?.guests || [];
  const guests = allGuests.filter((guest: any) => guest && guest.name && guest.name.trim() !== "");

  // Carregar documentos salvos quando o componente montar ou quando webCheckin mudar
  useEffect(() => {
    // Flag para evitar resetar se já temos dados no estado
    let hasLoadedData = false;
    
    // Verificar se webCheckin.documents é um array (vem da tabela) ou objeto (vem do JSONB)
    const documentsFromWebCheckin = webCheckin?.documents;
    
    // Se for array e tiver itens, pode ser da tabela ou JSONB já formatado
    if (Array.isArray(documentsFromWebCheckin) && documentsFromWebCheckin.length > 0) {
      // Verificar se já está no formato correto (tem document_front_url)
      if (documentsFromWebCheckin[0]?.document_front_url || documentsFromWebCheckin[0]?.selfie_url) {
        setDocuments(documentsFromWebCheckin);
        hasLoadedData = true;
      } else {
        // Se não, converter formato da tabela para formato do formulário
        const formattedDocuments = documentsFromWebCheckin.map((doc: any) => ({
          guest_name: doc.guest_name || "",
          document_type: doc.document_type || "cpf",
          document_number: doc.document_number || "",
          document_front_url: doc.document_front_url || "",
          document_back_url: doc.document_back_url || "",
          selfie_url: doc.selfie_url || "",
        }));
        setDocuments(formattedDocuments);
        hasLoadedData = true;
      }
    }
    
    // Tentar carregar de webCheckin.document_data (JSONB alternativo)
    if (!hasLoadedData && webCheckin?.document_data && Array.isArray(webCheckin.document_data) && webCheckin.document_data.length > 0) {
      setDocuments(webCheckin.document_data);
      hasLoadedData = true;
    }
    
    // Se não tiver dados salvos, usar dados do prop data (se vier de navegação)
    if (!hasLoadedData && data?.documents && Array.isArray(data.documents) && data.documents.length > 0) {
      setDocuments(data.documents);
      hasLoadedData = true;
    }
    
    // Se não tiver nenhum dado salvo, manter o estado atual (não resetar)
  }, [webCheckin?.documents, webCheckin?.document_data, data?.documents]);

  const handleFileUpload = async (
    guestIndex: number,
    documentType: "front" | "back" | "selfie",
    file: File
  ) => {
    const guest = guests[guestIndex];
    if (!guest) return;

    const key = `${guestIndex}-${documentType}`;
    setUploading((prev) => ({ ...prev, [key]: true }));

    try {
      // Upload para Supabase Storage
      const fileExt = file.name.split(".").pop();
      const fileName = `${webCheckin.id}/${guestIndex}-${documentType}-${Date.now()}.${fileExt}`;
      const filePath = `web-checkin/${fileName}`;

      // Tentar fazer upload diretamente (mais eficiente)
      // Se falhar, então verificamos se o bucket existe
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      // Se o upload falhou, verificar o tipo de erro e mostrar mensagem apropriada
      if (uploadError) {
        console.error("Erro detalhado do upload:", uploadError);
        
        // Verificar se é erro de bucket não encontrado
        if (uploadError.message?.includes("Bucket") || uploadError.message?.includes("bucket") || uploadError.message?.includes("not found")) {
          // Tentar verificar se o bucket realmente não existe
          const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
          
          if (!bucketsError) {
            const documentsBucket = buckets?.find((b) => b.name === "documents");
            if (!documentsBucket) {
              const errorMessage = `Bucket 'documents' não encontrado.\n\n` +
                `Por favor, crie o bucket no Supabase Dashboard:\n\n` +
                `1. Acesse Storage > Buckets\n` +
                `2. Clique em "New bucket"\n` +
                `3. Nome: "documents"\n` +
                `4. Public: false (privado)\n` +
                `5. File size limit: 10485760 (10MB)\n` +
                `6. Allowed MIME types: image/jpeg, image/jpg, image/png, image/webp, image/gif, application/pdf\n\n` +
                `Depois, configure as políticas de acesso:\n` +
                `- SELECT: bucket_id = 'documents' (anon, authenticated)\n` +
                `- INSERT: bucket_id = 'documents' (anon, authenticated)\n\n` +
                `Veja o arquivo APLICAR_MIGRATION_STORAGE_BUCKET.md para mais detalhes.`;
              alert(errorMessage);
              throw new Error("Bucket 'documents' não encontrado. Crie o bucket no Supabase Dashboard para habilitar uploads.");
            }
          }
        }
        
        // Verificar se é erro de política RLS (Row Level Security)
        if (uploadError.message?.includes("row-level security") || uploadError.message?.includes("violates") || uploadError.message?.includes("policy")) {
          // Apenas logar o erro no console, sem mostrar alerta ao usuário
          console.error("Erro de política de segurança (RLS):", uploadError);
          throw new Error("Erro ao fazer upload do documento. Verifique as configurações do servidor.");
        }
        
        // Se não for erro conhecido, lançar o erro original
        throw uploadError;
      }

      // Obter URL pública (ou signed URL se o bucket for privado)
      let fileUrl: string;
      
      // Verificar se o bucket é público ou privado
      const { data: buckets } = await supabase.storage.listBuckets();
      const documentsBucket = buckets?.find((b) => b.name === "documents");
      const isPublic = documentsBucket?.public ?? false;
      
      if (isPublic) {
        const {
          data: { publicUrl },
        } = supabase.storage.from("documents").getPublicUrl(filePath);
        fileUrl = publicUrl;
      } else {
        // Se o bucket for privado, gerar uma signed URL válida por 1 ano
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from("documents")
          .createSignedUrl(filePath, 31536000); // 1 ano em segundos
        
        if (signedUrlError) {
          console.error("Erro ao gerar signed URL:", signedUrlError);
          // Fallback: tentar usar public URL mesmo sendo privado
          const {
            data: { publicUrl },
          } = supabase.storage.from("documents").getPublicUrl(filePath);
          fileUrl = publicUrl;
        } else {
          fileUrl = signedUrlData.signedUrl;
        }
      }

      // Atualizar documentos - garantir que o documento seja associado ao hóspede correto
      const updatedDocuments = [...documents];
      if (!updatedDocuments[guestIndex]) {
        updatedDocuments[guestIndex] = {
          guest_name: guest.name,
          document_type: guest.document_type || "cpf",
          document_number: guest.document_number || "",
          is_main_guest: guest.is_main_guest || false,
        };
      } else {
        // Garantir que o guest_name está correto (caso tenha mudado)
        updatedDocuments[guestIndex].guest_name = guest.name;
        updatedDocuments[guestIndex].is_main_guest = guest.is_main_guest || false;
      }

      if (documentType === "front") {
        updatedDocuments[guestIndex].document_front_url = fileUrl;
      } else if (documentType === "back") {
        updatedDocuments[guestIndex].document_back_url = fileUrl;
      } else if (documentType === "selfie") {
        updatedDocuments[guestIndex].selfie_url = fileUrl;
      }

      setDocuments(updatedDocuments);
    } catch (error: any) {
      console.error("Erro ao fazer upload:", error);
      alert("Erro ao fazer upload do arquivo. Tente novamente.");
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleSubmit = () => {
    // Validação: verificar se todos os hóspedes válidos têm documentos obrigatórios
    const missingDocuments: string[] = [];
    
    guests.forEach((guest: any, index: number) => {
      const doc = documents[index];
      if (!doc?.document_front_url) {
        missingDocuments.push(`${guest.name || `Hóspede ${index + 1}`} - Documento frente`);
      }
      if (!doc?.selfie_url) {
        missingDocuments.push(`${guest.name || `Hóspede ${index + 1}`} - Selfie`);
      }
    });
    
    if (missingDocuments.length > 0) {
      alert(t("webCheckin.documents.errors.missingDocuments", { missing: missingDocuments.join("\n") }));
      return;
    }

    // Filtrar apenas documentos de hóspedes válidos antes de salvar
    const validDocuments = documents
      .map((doc: any, index: number) => {
        const guest = guests[index];
        if (!guest || !guest.name || guest.name.trim() === "") {
          return null; // Ignorar documentos de hóspedes inválidos
        }
        return {
          ...doc,
          guest_name: guest.name,
          is_main_guest: guest.is_main_guest || false,
        };
      })
      .filter((doc: any) => doc !== null); // Remover documentos nulos

    saveDocuments.mutate(
      { token, documents: validDocuments },
      {
        onSuccess: () => {
          onNext({ documents: validDocuments });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-4">
          {t("webCheckin.documents.title")}
        </h2>
        <div className="inline-flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 mb-4">
          <div className="flex-shrink-0 mt-0.5">
            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-blue-600 text-xs font-bold">!</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-700 leading-relaxed">
              {t("webCheckin.documents.required")}
            </p>
            <button
              type="button"
              onClick={() => setLgpdModalOpen(true)}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              {t("webCheckin.documents.lgpdLink")}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {guests.map((guest: any, index: number) => (
          <Card key={index} className="p-6">
            <h3 className="font-semibold text-slate-900 mb-4">
              {guest.is_main_guest ? t("webCheckin.guests.mainGuest") : `${t("webCheckin.guests.guest")} ${index + 1}`} - {guest.name}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Frente do Documento */}
              <div>
                <Label>
                  {t("webCheckin.documents.front")} <span className="text-red-500">*</span>
                </Label>
                <div className="mt-2">
                  {documents[index]?.document_front_url ? (
                    <div className="relative">
                      <img
                        src={documents[index].document_front_url}
                        alt="Frente"
                        className="w-full h-32 object-cover rounded border"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1"
                        onClick={() => {
                          const updated = [...documents];
                          delete updated[index].document_front_url;
                          setDocuments(updated);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : uploading[`${index}-front`] ? (
                    <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50">
                      <Loader2 className="h-8 w-8 text-blue-600 mb-2 animate-spin" />
                      <span className="text-sm text-blue-700 font-medium">{t("webCheckin.documents.uploading")}</span>
                      <span className="text-xs text-blue-600 mt-1">{t("webCheckin.documents.waitProcessing")}</span>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                      <Upload className="h-8 w-8 text-slate-400 mb-2" />
                      <span className="text-sm text-slate-600">{t("webCheckin.documents.clickToUpload")}</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(index, "front", file);
                        }}
                        disabled={uploading[`${index}-front`]}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Verso do Documento */}
              <div>
                <Label>{t("webCheckin.documents.back")}</Label>
                <div className="mt-2">
                  {documents[index]?.document_back_url ? (
                    <div className="relative">
                      <img
                        src={documents[index].document_back_url}
                        alt="Verso"
                        className="w-full h-32 object-cover rounded border"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1"
                        onClick={() => {
                          const updated = [...documents];
                          delete updated[index].document_back_url;
                          setDocuments(updated);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : uploading[`${index}-back`] ? (
                    <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50">
                      <Loader2 className="h-8 w-8 text-blue-600 mb-2 animate-spin" />
                      <span className="text-sm text-blue-700 font-medium">{t("webCheckin.documents.uploading")}</span>
                      <span className="text-xs text-blue-600 mt-1">{t("webCheckin.documents.waitProcessing")}</span>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                      <Upload className="h-8 w-8 text-slate-400 mb-2" />
                      <span className="text-sm text-slate-600">{t("webCheckin.documents.clickToUpload")}</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(index, "back", file);
                        }}
                        disabled={uploading[`${index}-back`]}
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Selfie */}
              <div>
                <Label>
                  {t("webCheckin.documents.selfie")} <span className="text-red-500">*</span>
                </Label>
                <div className="mt-2">
                  {documents[index]?.selfie_url ? (
                    <div className="relative">
                      <img
                        src={documents[index].selfie_url}
                        alt="Selfie"
                        className="w-full h-32 object-cover rounded border"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1"
                        onClick={() => {
                          const updated = [...documents];
                          delete updated[index].selfie_url;
                          setDocuments(updated);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : uploading[`${index}-selfie`] ? (
                    <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-blue-300 rounded-lg bg-blue-50">
                      <Loader2 className="h-8 w-8 text-blue-600 mb-2 animate-spin" />
                      <span className="text-sm text-blue-700 font-medium">{t("webCheckin.documents.uploading")}</span>
                      <span className="text-xs text-blue-600 mt-1">{t("webCheckin.documents.waitProcessing")}</span>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                      <Upload className="h-8 w-8 text-slate-400 mb-2" />
                      <span className="text-sm text-slate-600">{t("webCheckin.documents.clickToUpload")}</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        capture="user"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(index, "selfie", file);
                        }}
                        disabled={uploading[`${index}-selfie`]}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm text-amber-800">
          <strong>{t("webCheckin.documents.important")}</strong> {t("webCheckin.documents.importantText")}
        </p>
      </div>

      {/* Modal LGPD */}
      <Dialog open={lgpdModalOpen} onOpenChange={setLgpdModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("webCheckin.documents.lgpdTitle")}</DialogTitle>
            <DialogDescription>
              {t("webCheckin.documents.lgpdDescription")}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            <div>
              <h3 className="font-semibold text-lg mb-3">{t("webCheckin.documents.legalBasis")}</h3>
              <p className="text-sm text-slate-700 mb-4">
                {t("webCheckin.documents.legalBasisText")}
              </p>
              
              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">1. {t("webCheckin.documents.decree")}</h4>
                  <p className="text-sm text-slate-700">
                    {t("webCheckin.documents.decreeText")}
                  </p>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">2. {t("webCheckin.documents.ordinance")}</h4>
                  <p className="text-sm text-slate-700">
                    {t("webCheckin.documents.ordinanceText")}
                  </p>
                  <ul className="list-disc list-inside text-sm text-slate-700 mt-2 space-y-1">
                    <li>{t("webCheckin.documents.fullName")}</li>
                    <li>{t("webCheckin.documents.idDocument")}</li>
                    <li>{t("webCheckin.documents.nationality")}</li>
                    <li>{t("webCheckin.documents.entryExit")}</li>
                  </ul>
                </div>
                
                <div className="bg-slate-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">3. {t("webCheckin.documents.stateLaws")}</h4>
                  <p className="text-sm text-slate-700">
                    {t("webCheckin.documents.stateLawsText")}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-3">{t("webCheckin.documents.lgpdCompliance")}</h3>
              <p className="text-sm text-slate-700 mb-4">
                {t("webCheckin.documents.lgpdComplianceText")}
              </p>
              
              <div className="space-y-3">
                <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
                  <h4 className="font-semibold mb-2">{t("webCheckin.documents.article7II")}</h4>
                  <p className="text-sm text-slate-700">
                    {t("webCheckin.documents.article7IIText")}
                  </p>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-500">
                  <h4 className="font-semibold mb-2">{t("webCheckin.documents.article7V")}</h4>
                  <p className="text-sm text-slate-700">
                    {t("webCheckin.documents.article7VText")}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-3">{t("webCheckin.documents.dataProtection")}</h3>
              <p className="text-sm text-slate-700 mb-3">{t("webCheckin.documents.dataProtectionText")}</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>{t("webCheckin.documents.dataUsage")}</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>{t("webCheckin.documents.security")}</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>{t("webCheckin.documents.noSharing")}</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>{t("webCheckin.documents.storage")}</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <span>{t("webCheckin.documents.rights")}</span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-3">{t("webCheckin.documents.alternatives")}</h3>
              <p className="text-sm text-slate-700 mb-2">
                {t("webCheckin.documents.alternativesText")}
              </p>
              <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                <li>{t("webCheckin.documents.presentPhysical")}</li>
                <li>{t("webCheckin.documents.presentialCheckin")}</li>
              </ul>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-2 text-red-900">{t("webCheckin.documents.refusal")}</h3>
              <p className="text-sm text-red-800">
                {t("webCheckin.documents.refusalText")}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          {t("webCheckin.documents.back")}
        </Button>
        <Button onClick={handleSubmit} disabled={saveDocuments.isPending}>
          {saveDocuments.isPending ? t("webCheckin.documents.saving") : t("webCheckin.documents.continue")}
        </Button>
      </div>
    </div>
  );
}

