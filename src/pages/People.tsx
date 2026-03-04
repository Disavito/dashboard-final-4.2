import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  ColumnDef, 
  useReactTable, 
  getCoreRowModel, 
  getPaginationRowModel, 
  getFilteredRowModel, 
  getSortedRowModel,
  SortingState,
  VisibilityState,
  flexRender
} from '@tanstack/react-table';
import { 
  PlusCircle, 
  Loader2, 
  Edit, 
  Trash2, 
  Search, 
  Download, 
  ArrowUpDown,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  XCircle,
  UserMinus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { SocioTitular } from '@/lib/types';
import SocioTitularRegistrationForm from '@/components/custom/SocioTitularRegistrationForm';
import ConfirmationDialog from '@/components/ui-custom/ConfirmationDialog';
import { cn } from '@/lib/utils';
import { useUser } from '@/context/UserContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useDebounce } from 'use-debounce';
import * as XLSX from 'xlsx';

type SocioStatus = 'Activo' | 'Inactivo' | 'Retirado' | 'Sin Registro';

interface EnrichedSocio extends SocioTitular {
  status: SocioStatus;
  receiptNumber: string;
  lastTransactionDate?: string;
  lastTransactionType?: string;
}

function People() {
  const [socios, setSocios] = useState<EnrichedSocio[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRegistrationDialogOpen, setIsRegistrationDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [socioToDelete, setSocioToDelete] = useState<EnrichedSocio | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch] = useDebounce(searchInput, 300);
  const [selectedLocalidad, setSelectedLocalidad] = useState<string>('all');
  const [selectedEstado, setSelectedEstado] = useState<string>('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [socioToEdit, setSocioToEdit] = useState<EnrichedSocio | null>(null);

  const { loading: userLoading } = useUser();

  const fetchSocios = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sociosData, error: sociosError } = await supabase
        .from('socio_titulares')
        .select('*')
        .order('nombres', { ascending: true });

      if (sociosError) throw sociosError;

      const { data: ingresosData, error: ingresosError } = await supabase
        .from('ingresos')
        .select('dni, receipt_number, transaction_type, amount, date, created_at')
        .order('date', { ascending: false });

      if (ingresosError) throw ingresosError;

      const ingresosMap = new Map<string, any[]>();
      ingresosData?.forEach(ingreso => {
        if (ingreso.dni) {
          const current = ingresosMap.get(ingreso.dni) || [];
          current.push(ingreso);
          ingresosMap.set(ingreso.dni, current);
        }
      });

      const enrichedSocios: EnrichedSocio[] = (sociosData || []).map(socio => {
        const socioIngresos = ingresosMap.get(socio.dni) || [];
        const lastTransaction = socioIngresos[0];
        
        let status: SocioStatus = 'Sin Registro';
        let receiptNumber = 'N/A';

        if (lastTransaction) {
          receiptNumber = lastTransaction.receipt_number;
          const type = lastTransaction.transaction_type?.toLowerCase() || '';
          const amount = lastTransaction.amount;

          if (type.includes('anulacion')) {
            status = 'Inactivo';
          } 
          else if (type.includes('devolucion') || amount < 0) {
            status = 'Retirado';
          }
          else if (amount > 0) {
            status = 'Activo';
          }
        }

        return {
          ...socio,
          status,
          receiptNumber,
          lastTransactionDate: lastTransaction?.date,
          lastTransactionType: lastTransaction?.transaction_type
        } as EnrichedSocio;
      });

      setSocios(enrichedSocios);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al cargar socios y procesar estados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSocios();
  }, [fetchSocios]);

  const localidades = useMemo(() => {
    const locs = new Set(socios.map(s => s.localidad).filter(Boolean));
    return Array.from(locs).sort();
  }, [socios]);

  const filteredData = useMemo(() => {
    let result = [...socios];

    if (selectedLocalidad !== 'all') {
      result = result.filter(s => s.localidad === selectedLocalidad);
    }

    if (selectedEstado !== 'all') {
      result = result.filter(s => s.status === selectedEstado);
    }

    const searchTerm = debouncedSearch.toLowerCase().trim();
    if (searchTerm) {
      const normalize = (text: any) => 
        String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

      const searchWords = normalize(searchTerm).split(/\s+/).filter(word => word.length > 0);

      result = result.filter(socio => {
        const searchableContent = normalize(`
          ${socio.nombres} 
          ${socio.apellidoPaterno} 
          ${socio.apellidoMaterno} 
          ${socio.dni} 
          ${socio.localidad} 
          ${socio.mz || ''} 
          ${socio.lote || ''} 
          ${socio.receiptNumber}
        `);

        return searchWords.every(word => searchableContent.includes(word));
      });
    }

    return result;
  }, [socios, debouncedSearch, selectedLocalidad, selectedEstado]);

  const columns: ColumnDef<EnrichedSocio>[] = useMemo(() => [
    {
      accessorKey: 'dni',
      header: ({ column }) => (
        <Button variant="ghost" className="pl-0 hover:bg-transparent font-semibold text-gray-700" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          DNI <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-mono text-sm text-gray-900">{row.getValue('dni')}</span>,
    },
    {
      accessorKey: 'nombres',
      header: 'Socio Titular',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-bold uppercase text-gray-900 leading-tight">
            {row.original.nombres} {row.original.apellidoPaterno}
          </span>
          <span className="text-[10px] text-gray-400 uppercase font-medium">
            {row.original.apellidoMaterno}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'localidad',
      header: 'Ubicación',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="uppercase text-[11px] font-bold text-gray-700">{row.getValue('localidad')}</span>
          <span className="text-[10px] font-mono text-gray-400">Mz: {row.original.mz || '-'} Lt: {row.original.lote || '-'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'receiptNumber',
      header: 'Último Mov.',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-blue-600 text-xs font-bold font-mono">{row.original.receiptNumber}</span>
          <span className="text-[9px] text-gray-400 uppercase font-black">{row.original.lastTransactionType || 'Sin registro'}</span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <Button variant="ghost" className="pl-0 hover:bg-transparent font-semibold text-gray-700" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          Estado <ArrowUpDown className="ml-2 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => {
        const status = row.original.status;
        
        const statusConfig = {
          'Activo': { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
          'Inactivo': { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: AlertCircle },
          'Retirado': { color: 'bg-red-100 text-red-700 border-red-200', icon: UserMinus },
          'Sin Registro': { color: 'bg-gray-100 text-gray-500 border-gray-200', icon: XCircle },
        };

        const config = statusConfig[status];
        const Icon = config.icon;

        return (
          <Badge 
            variant="outline" 
            className={cn(
              "font-black border px-3 py-1 rounded-full text-[10px] uppercase tracking-wider flex items-center gap-1.5 w-fit",
              config.color
            )}
          >
            <Icon className="w-3 h-3" />
            {status}
          </Badge>
        );
      }
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
            onClick={() => { setSocioToEdit(row.original); setIsEditDialogOpen(true); }}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
            onClick={() => { setSocioToDelete(row.original); setIsDeleteDialogOpen(true); }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ], []);

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    state: {
      sorting,
      columnVisibility,
      pagination,
    },
  });

  const exportToExcel = () => {
    const dataToExport = filteredData.map(socio => ({
      'DNI': socio.dni,
      'Nombres': socio.nombres,
      'Apellido Paterno': socio.apellidoPaterno,
      'Apellido Materno': socio.apellidoMaterno,
      'Localidad': socio.localidad,
      'Mz': socio.mz || '-',
      'Lote': socio.lote || '-',
      'N° Recibo': socio.receiptNumber,
      'Estado': socio.status
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Socios");
    XLSX.writeFile(workbook, `socios_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading || userLoading) return <div className="flex h-screen items-center justify-center bg-white"><Loader2 className="animate-spin h-12 w-12 text-[#9E7FFF]" /></div>;

  return (
    <div className="min-h-screen bg-[#F8F9FC] pb-10">
      <div className="w-full bg-white border-b border-gray-100 py-12 px-8 shadow-sm mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#9E7FFF]/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h1 className="text-4xl font-black text-gray-900 tracking-tight">Gestión de Socios</h1>
              <p className="text-gray-500 font-medium mt-1">Control de estados basado en historial de pagos y movimientos.</p>
            </div>
            <Button className="h-12 bg-[#9E7FFF] hover:bg-[#8B6EEF] text-white gap-2 rounded-2xl font-bold shadow-lg shadow-[#9E7FFF]/20 px-6" onClick={() => setIsRegistrationDialogOpen(true)}>
              <PlusCircle className="h-5 h-5" /> Registrar Nuevo Socio
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6 px-8">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm">
          <div className="relative w-full lg:w-[400px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input 
              placeholder="Buscar por DNI, nombre o recibo..." 
              className="pl-11 bg-gray-50 border-none focus:ring-2 focus:ring-[#9E7FFF]/20 h-12 rounded-xl font-medium" 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <Select value={selectedLocalidad} onValueChange={setSelectedLocalidad}>
              <SelectTrigger className="w-full md:w-[200px] h-12 bg-gray-50 border-none rounded-xl font-bold text-gray-700">
                <SelectValue placeholder="Comunidad" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todas las Comunidades</SelectItem>
                {localidades.map(loc => (
                  <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedEstado} onValueChange={setSelectedEstado}>
              <SelectTrigger className="w-full md:w-[180px] h-12 bg-gray-50 border-none rounded-xl font-bold text-gray-700">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="all">Todos los Estados</SelectItem>
                <SelectItem value="Activo">Activo</SelectItem>
                <SelectItem value="Inactivo">Inactivo</SelectItem>
                <SelectItem value="Retirado">Retirado</SelectItem>
                <SelectItem value="Sin Registro">Sin Registro</SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-12 border-gray-200 text-gray-600 gap-2 rounded-xl font-bold px-5">
                  <Download className="h-4 w-4" /> Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white border-gray-100 rounded-2xl shadow-xl p-2">
                <DropdownMenuItem onClick={exportToExcel} className="flex items-center gap-3 py-3 cursor-pointer focus:bg-emerald-50 focus:text-emerald-700 rounded-xl">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                  <span className="font-bold">Excel (.xlsx)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="hidden md:block bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-gray-50/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b border-gray-100">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="h-14 text-gray-400 font-black text-[10px] uppercase tracking-widest px-6">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="border-b border-gray-50 hover:bg-[#F0EEFF]/30 transition-colors group">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-4 px-6">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32 text-center text-gray-400 font-bold">No se encontraron socios con los filtros aplicados.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          
          <div className="flex items-center justify-between px-8 py-6 border-t border-gray-50 bg-white">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Mostrando {filteredData.length} de {socios.length} registros
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="h-10 px-4 rounded-xl font-bold border-gray-200">Anterior</Button>
              <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="h-10 px-4 rounded-xl font-bold border-gray-200">Siguiente</Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:hidden">
          {filteredData.length ? (
            filteredData.slice(pagination.pageIndex * pagination.pageSize, (pagination.pageIndex + 1) * pagination.pageSize).map((socio) => (
              <Card key={socio.id} className="w-full bg-white border-none shadow-sm rounded-[2rem] overflow-hidden">
                <div className="p-6 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">DNI {socio.dni}</span>
                      <h3 className="text-lg font-black text-gray-900 uppercase leading-tight mt-1">{socio.nombres} {socio.apellidoPaterno}</h3>
                    </div>
                    <Badge className={cn(
                      "font-black border px-3 py-1 rounded-full text-[9px] uppercase tracking-wider",
                      socio.status === 'Activo' ? "bg-emerald-100 text-emerald-700" : 
                      socio.status === 'Inactivo' ? "bg-amber-100 text-amber-700" : 
                      socio.status === 'Retirado' ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
                    )}>
                      {socio.status}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 py-4 border-y border-gray-50">
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Comunidad</p>
                      <p className="text-sm font-bold text-gray-700 uppercase">{socio.localidad}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Último Recibo</p>
                      <p className="text-sm font-bold text-blue-600 font-mono">{socio.receiptNumber}</p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" className="h-10 rounded-xl font-bold border-gray-100 text-blue-600" onClick={() => { setSocioToEdit(socio); setIsEditDialogOpen(true); }}>
                      <Edit className="h-4 w-4 mr-2" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" className="h-10 w-10 p-0 rounded-xl border-gray-100 text-red-400" onClick={() => { setSocioToDelete(socio); setIsDeleteDialogOpen(true); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <div className="text-center py-20 bg-white rounded-[2rem] border border-dashed border-gray-200">
              <p className="text-gray-400 font-bold">No se encontraron socios</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={isRegistrationDialogOpen} onOpenChange={setIsRegistrationDialogOpen}>
        <DialogContent className="max-w-2xl bg-white border-none rounded-[2.5rem] p-0 overflow-hidden">
          <SocioTitularRegistrationForm onClose={() => setIsRegistrationDialogOpen(false)} onSuccess={() => { setIsRegistrationDialogOpen(false); fetchSocios(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl bg-white border-none rounded-[2.5rem] p-0 overflow-hidden">
          {socioToEdit && <SocioTitularRegistrationForm socioId={socioToEdit.id} onClose={() => setIsEditDialogOpen(false)} onSuccess={() => { setIsEditDialogOpen(false); fetchSocios(); }} />}
        </DialogContent>
      </Dialog>

      <ConfirmationDialog 
        isOpen={isDeleteDialogOpen} 
        onClose={() => setIsDeleteDialogOpen(false)} 
        onConfirm={async () => {
          if (!socioToDelete) return;
          setIsDeleting(true);
          const { error } = await supabase.from('socio_titulares').delete().eq('id', socioToDelete.id);
          if (!error) { toast.success('Socio eliminado correctamente'); fetchSocios(); setIsDeleteDialogOpen(false); }
          setIsDeleting(false);
        }} 
        title="Eliminar Socio" 
        description="¿Estás seguro de eliminar este registro? Esta acción es irreversible y afectará el historial."
        isConfirming={isDeleting}
      />
    </div>
  );
}

export default People;
