import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAllColaboradores } from '@/lib/api/jornadaApi';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Users, UserSearch, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import ClockManager from './ClockManager';

const AdminClockManager: React.FC = () => {
  const [selectedColaboradorId, setSelectedColaboradorId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { data: colaboradores, isLoading: isLoadingColaboradores } = useQuery({
    queryKey: ['allColaboradores'],
    queryFn: getAllColaboradores,
  });

  const selectedColaborador = colaboradores?.find(c => c.id === selectedColaboradorId) || null;

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-xl bg-white rounded-[2rem]">
        <CardHeader>
          <CardTitle className="text-xl font-black uppercase tracking-tight">Configuración de Registro Manual</CardTitle>
          <CardDescription className="font-medium">Selecciona el colaborador y la fecha para gestionar su asistencia.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-gray-400 tracking-widest ml-1">Colaborador</label>
              <Select
                onValueChange={setSelectedColaboradorId}
                disabled={isLoadingColaboradores}
              >
                <SelectTrigger className="h-12 rounded-xl border-gray-100 bg-gray-50 font-bold">
                  <Users className="mr-2 h-4 w-4 text-[#9E7FFF]" />
                  <SelectValue placeholder={isLoadingColaboradores ? "Cargando..." : "Seleccionar colaborador"} />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {colaboradores?.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="font-medium">
                      {c.name} {c.apellidos}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase text-gray-400 tracking-widest ml-1">Fecha del Registro</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={"outline"}
                    className={cn(
                      "w-full h-12 justify-start text-left font-bold rounded-xl border-gray-100 bg-gray-50",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-[#9E7FFF]" />
                    {selectedDate ? format(selectedDate, "PPP", { locale: es }) : <span>Seleccionar fecha</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl overflow-hidden border-none shadow-2xl" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    initialFocus
                    disabled={(date) => date > new Date()} // No permitir fechas futuras
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedColaborador ? (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <ClockManager 
            colaborador={selectedColaborador} 
            targetDate={selectedDate}
            bypassTimeRestrictions={true} 
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center p-20 border-2 border-dashed border-gray-200 rounded-[3rem] bg-gray-50/50">
            <div className="w-20 h-20 bg-white rounded-[2rem] shadow-sm flex items-center justify-center mb-6">
              <UserSearch className="h-10 w-10 text-gray-300" />
            </div>
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Esperando Selección</h3>
            <p className="text-gray-400 font-medium max-w-xs">Elige un colaborador y una fecha para comenzar el registro manual de asistencia.</p>
        </div>
      )}
    </div>
  );
};

export default AdminClockManager;
