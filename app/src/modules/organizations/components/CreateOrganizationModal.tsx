import React from 'react';
import { Dialog } from '@shared/components';
import { useOrganizationForm } from '../hooks/useOrganizationForm';
import type { Organization } from '../types';

interface CreateOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newOrganization: Organization) => void;
}

export function CreateOrganizationModal({
  isOpen,
  onClose,
  onCreated,
}: CreateOrganizationModalProps) {
  const { formData, isLoading, handleInputChange, handleCreate, resetForm } = useOrganizationForm();

  const handleSubmit = async () => {
    const created = await handleCreate();
    if (created) {
      onCreated(created);
      resetForm();
      onClose();
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => { if (!open) handleClose(); }}
      title="Cadastrar Nova Organização"
      description="Formulário para cadastro de organização"
      footer={(
        <>
          <button type="button" className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100" onClick={handleClose}>
            Cancelar
          </button>
          <button type="button" className="ui-button-primary" disabled={isLoading} onClick={handleSubmit}>
            {isLoading ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      )}
    >
      <div className="u-stack u-gap-4">
        <label className="u-stack u-gap-2"><span className="users-section-title">Nome da Organização</span><input name="name" value={formData.name} onChange={handleInputChange} className="ui-input" placeholder="Ex: Castelo Contabilidade" /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Slug (identificador único)</span><input name="slug" value={formData.slug} onChange={handleInputChange} className="ui-input" placeholder="Ex: castelo-contabilidade" /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">CNPJ</span><input name="cnpj" value={formData.cnpj} onChange={handleInputChange} className="ui-input" placeholder="00000000000000" maxLength={18} /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Email do Criador</span><input name="email_created_by" type="email" value={formData.email_created_by} onChange={handleInputChange} className="ui-input" placeholder="admin@exemplo.com" /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">URL do Logo (opcional)</span><input name="logo_url" value={formData.logo_url || ''} onChange={handleInputChange} className="ui-input" placeholder="https://exemplo.com/logo.png" /></label>
        <label className="u-stack u-gap-2"><span className="users-section-title">Plano de Assinatura</span><input name="subscription_plan" value={formData.subscription_plan} onChange={handleInputChange} className="ui-input" placeholder="trial" /></label>
      </div>
    </Dialog>
  );
}
