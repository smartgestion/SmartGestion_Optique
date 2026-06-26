import React, { useEffect, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Plus, Search, FileEdit, Trash2, Users, Building2, User, ArrowLeft,
  ChevronLeft, ChevronRight, Mail, Phone, MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

import { toast } from 'sonner'
import { ClientForm } from '@/components/forms/ClientForm'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

interface Client {
  id: number;
  code: string;
  nom: string;
  type: string;
  email: string;
  telephone: string;
  ice: string | null;
  adresse?: string;
  created_at?: string;
}

const ITEMS_PER_PAGE = 10;

export function ClientsList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchClients = async () => {
    if (!user?.id) {
      setClients([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        toast.error(t('clients.toast_load_error'));
        setClients([]);
        setIsLoading(false);
        return;
      }

      setClients(data || []);
    } catch (error: any) {
      console.error('ERROR:', error);
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchClients();
    }
  }, [user?.id]);

  const handleDelete = async () => {
    if (!clientToDelete || !user?.id) return;
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientToDelete)
        .eq('user_id', user.id);

      if (error) throw error;
      toast.success(t('clients.toast_deleted'));
      fetchClients();
    } catch (error) {
      toast.error(t('clients.toast_load_error'));
    } finally {
      setDeleteConfirmOpen(false);
      setClientToDelete(null);
    }
  };

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setShowForm(true);
  };

  const openNewForm = () => {
    setEditingClient(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingClient(null);
  };

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const query = searchQuery.toLowerCase();
    return clients.filter((client) =>
      client.nom?.toLowerCase().includes(query) ||
      client.code?.toLowerCase().includes(query) ||
      client.email?.toLowerCase().includes(query) ||
      client.telephone?.includes(query)
    );
  }, [clients, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / ITEMS_PER_PAGE));
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const clientsCount = clients.length;
  const entreprisesCount = clients.filter(c => c.type === 'entreprise').length;
  const particuliersCount = clients.filter(c => c.type === 'particulier').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title={t('shared.confirm_delete.title_client')}
        description={t('shared.confirm_delete.body_client')}
      />

      {showForm ? (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={closeForm}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="text-2xl font-bold text-foreground">
                {editingClient ? t('clients.dialog_edit') : t('clients.dialog_create')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {editingClient
                  ? t('clients.dialog_subtitle_edit', { name: editingClient.nom })
                  : t('clients.dialog_subtitle_create')}
              </p>
            </div>
          </div>
          <div className="rounded-[6px] border border-slate-200 bg-white p-8 dark:bg-slate-900 dark:border-white/10">
            <ClientForm
              initialData={editingClient}
              onSuccess={() => {
                closeForm();
                fetchClients();
              }}
            />
          </div>
        </div>
      ) : (
        <>
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-[6px] bg-blue-50 border border-blue-200/50 dark:bg-emerald-500/10 dark:border-emerald-500/20">
            <Users className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">{t('clients.page_title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('clients.page_subtitle')}
            </p>
          </div>
        </div>

            <Button
              onClick={openNewForm}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-[4px] h-10 px-5 shadow-none"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('clients.new_button')}
            </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column - Table */}
        <div className="lg:col-span-3 space-y-4">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none dark:text-slate-500" />
            <Input
              type="text"
              placeholder={t('clients.search_ph')}
              className="pl-9 h-10 bg-white border-slate-200 rounded-[4px] focus:border-slate-300 shadow-none text-sm dark:bg-[#0F172A] dark:border-white/10 dark:text-white dark:placeholder:text-slate-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Table */}
          <Card className="border border-slate-200 shadow-none rounded-[6px] overflow-hidden dark:bg-slate-900/60 dark:border-white/10">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-slate-100 dark:border-white/5">
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 w-[120px] dark:text-slate-400">{t('clients.col_code')}</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 dark:text-slate-400">{t('clients.col_client')}</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 dark:text-slate-400">{t('clients.col_type')}</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 dark:text-slate-400">{t('clients.col_contact')}</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 dark:text-slate-400">{t('clients.col_ice')}</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 text-right dark:text-slate-400">{t('clients.col_actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="h-8 w-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                        <p className="text-sm text-muted-foreground font-medium">{t('clients.loading')}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="bg-slate-50 rounded-[6px] p-4 border border-slate-100 dark:bg-slate-900/40 dark:border-white/5">
                          <Users className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="text-sm text-slate-500 font-medium dark:text-slate-400">
                          {searchQuery ? t('clients.empty_filtered') : t('clients.empty_all')}
                        </p>
                        {!searchQuery && (
                          <Button
                            variant="outline"
                            className="rounded-[4px] text-sm"
                            onClick={openNewForm}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            {t('clients.create_first')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedClients.map((client) => {
                    const initials = (client.nom || '?').charAt(0).toUpperCase();

                    return (
                      <TableRow
                        key={client.id}
                        className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors dark:border-white/5 dark:hover:bg-white/[0.02]"
                      >
                        <TableCell className="px-4 py-5">
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {client.code || `C${client.id}`}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-5">
                          <div className="flex items-center gap-2.5">
                            <Avatar size="sm" className="h-7 w-7 border border-slate-200 dark:border-white/10">
                              <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${client.nom}`} />
                              <AvatarFallback className="text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-semibold text-slate-800 dark:text-white">{client.nom || '-'}</p>
                              {client.adresse && (
                                <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 dark:text-slate-500">
                                  <MapPin className="h-3 w-3" />
                                  {client.adresse}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-5">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium",
                            client.type === 'entreprise'
                              ? "bg-sky-50 text-sky-700 border border-sky-200/50 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200/50 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20"
                          )}>
                            {client.type === 'entreprise' ? (
                              <Building2 className="h-3 w-3 mr-1" />
                            ) : (
                              <User className="h-3 w-3 mr-1" />
                            )}
                            {client.type === 'entreprise' ? t('clients.type_company') : t('clients.type_individual')}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-5">
                          <div className="space-y-0.5">
                            {client.email && (
                              <p className="text-xs text-slate-500 flex items-center gap-1.5 dark:text-slate-400">
                                <Mail className="h-3 w-3 text-slate-400 shrink-0 dark:text-slate-500" />
                                {client.email}
                              </p>
                            )}
                            {client.telephone && (
                              <p className="text-xs text-slate-500 flex items-center gap-1.5 dark:text-slate-400">
                                <Phone className="h-3 w-3 text-slate-400 shrink-0 dark:text-slate-500" />
                                {client.telephone}
                              </p>
                            )}
                            {!client.email && !client.telephone && (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-5">
                          <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                            {client.ice || '-'}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-5 text-right">
                          <div className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-[4px] dark:text-slate-500 dark:hover:text-white dark:hover:bg-white/5"
                              onClick={() => handleEdit(client)}
                              title={t('shared.actions.edit')}
                            >
                              <FileEdit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-[4px] dark:text-slate-500 dark:hover:text-red-400 dark:hover:bg-red-500/10"
                              onClick={() => {
                                setClientToDelete(client.id);
                                setDeleteConfirmOpen(true);
                              }}
                              title={t('shared.actions.delete')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {!isLoading && paginatedClients.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-white/5">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredClients.length)} {t('shared.pagination.of')} {filteredClients.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-[4px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5"
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <Button
                      key={page}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-8 min-w-[32px] rounded-[4px] text-sm font-medium",
                        page === currentPage
                          ? "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-white"
                          : "text-slate-400 hover:text-slate-600 hover:bg-slate-50 dark:text-slate-500 dark:hover:text-white dark:hover:bg-white/5"
                      )}
                      onClick={() => handlePageChange(page)}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-[4px] text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5"
                    disabled={currentPage === totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                  >
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column - Summary */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border border-slate-200 shadow-none rounded-[6px] dark:bg-slate-900/60 dark:border-white/10">
            <CardHeader className="px-4 py-4 border-b border-slate-100 dark:border-white/5">
              <CardTitle className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('clients.sidebar_title')}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 py-4 space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-9 w-9 rounded-[6px] bg-blue-50 border border-blue-200/50 shrink-0 dark:bg-emerald-500/10 dark:border-emerald-500/20">
                  <Users className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('clients.sidebar_total')}</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white" dir="ltr">{clientsCount}</p>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-white/5 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-sky-500 dark:text-sky-400" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t('clients.sidebar_companies')}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300" dir="ltr">{entreprisesCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t('clients.sidebar_individuals')}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300" dir="ltr">{particuliersCount}</span>
                </div>
              </div>

              {clientsCount > 0 && (
                <div className="border-t border-slate-100 dark:border-white/5 pt-4">
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                    <div
                      className="h-full bg-sky-400 transition-all"
                      style={{ width: `${(entreprisesCount / clientsCount) * 100}%` }}
                    />
                    <div
                      className="h-full bg-emerald-400 transition-all"
                      style={{ width: `${(particuliersCount / clientsCount) * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {((entreprisesCount / clientsCount) * 100).toFixed(0)}% {t('clients.sidebar_companies').toLowerCase()}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500">
                      {((particuliersCount / clientsCount) * 100).toFixed(0)}% {t('clients.sidebar_individuals').toLowerCase()}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
        </>
      )}
    </div>
  );
}
