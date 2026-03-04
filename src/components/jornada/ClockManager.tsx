import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  getJornadaByDate, 
  clockIn, 
  clockOut, 
  startLunch, 
  endLunch, 
  Colaborador, 
  calculateWorkedMinutesForJornada 
} from '@/lib/api/jornadaApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Coffee, 
  LogOut, 
  Play, 
  CheckCircle2, 
  AlertCircle,
  Calendar as CalendarIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ClockManagerProps {
  colaborador: Colaborador;
  targetDate?: Date;
  bypassTimeRestrictions?: boolean;
}

const ClockManager: React.FC<ClockManagerProps> = ({ 
  colaborador, 
  targetDate = new Date(), 
  bypassTimeRestrictions = false 
}) => {
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const isToday = format(targetDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
    if (!isToday) {
      setCurrentTime(targetDate);
      return;
    }

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  const { data: jornada, isLoading } = useQuery({
    queryKey: ['jornada', colaborador.id, format(targetDate, 'yyyy-MM-dd')],
    queryFn: () => getJornadaByDate(colaborador.id, targetDate),
  });

  const mutationOptions = {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jornada', colaborador.id] });
      queryClient.invalidateQueries({ queryKey: ['adminJornadas'] });
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    }
  };

  const clockInMutation = useMutation({
    mutationFn: () => clockIn(colaborador.id, bypassTimeRestrictions ? targetDate : undefined),
    ...mutationOptions,
    onSuccess: () => {
      toast.success('Jornada iniciada correctamente');
      mutationOptions.onSuccess();
    }
  });

  const clockOutMutation = useMutation({
    mutationFn: (id: number) => clockOut(id, bypassTimeRestrictions ? targetDate : undefined),
    ...mutationOptions,
    onSuccess: () => {
      toast.success('Jornada finalizada correctamente');
      mutationOptions.onSuccess();
    }
  });

  const startLunchMutation = useMutation({
    mutationFn: (id: number) => startLunch(id, bypassTimeRestrictions ? targetDate : undefined),
    ...mutationOptions
  });

  const endLunchMutation = useMutation({
    mutationFn: (id: number) => endLunch(id, bypassTimeRestrictions ? targetDate : undefined),
    ...mutationOptions
  });

  if (isLoading) return <div className="p-8 text-center">Cargando registro...</div>;

  const formatTime = (isoString: string | null | undefined) => {
    if (!isoString) return '--:--';
    return format(parseISO(isoString), 'HH:mm:ss');
  };

  const isFinished = !!jornada?.hora_fin_jornada;
  const onLunch = !!jornada?.hora_inicio_almuerzo && !jornada?.hora_fin_almuerzo;
  const hasStarted = !!jornada?.hora_inicio_jornada;

  return (
    <Card className={cn(
      "overflow-hidden border-none shadow-2xl",
      bypassTimeRestrictions ? "bg-amber-50/30 ring-1 ring-amber-200" : "bg-white"
    )}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-2xl font-black text-gray-900 uppercase tracking-tight">
              {bypassTimeRestrictions ? 'Registro Manual' : 'Control de Asistencia'}
            </CardTitle>
            <CardDescription className="font-bold text-[#9E7FFF] flex items-center gap-2 mt-1">
              <CalendarIcon className="h-4 w-4" />
              {format(targetDate, "EEEE, d 'de' MMMM", { locale: es })}
            </CardDescription>
          </div>
          {jornada && (
            <Badge variant={isFinished ? "default" : "secondary"} className="font-black uppercase px-3 py-1">
              {isFinished ? 'Finalizado' : onLunch ? 'En Almuerzo' : 'Trabajando'}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-8 pt-6">
        <div className="flex flex-col items-center justify-center py-6 bg-gray-50 rounded-[2.5rem] border border-gray-100">
          <span className="text-sm font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Hora del Registro</span>
          <div className="text-6xl font-black text-gray-900 font-mono tracking-tighter">
            {format(currentTime, 'HH:mm:ss')}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TimeBlock label="Inicio" time={formatTime(jornada?.hora_inicio_jornada)} icon={<Play className="w-3 h-3" />} active={hasStarted} />
          <TimeBlock label="Almuerzo" time={formatTime(jornada?.hora_inicio_almuerzo)} icon={<Coffee className="w-3 h-3" />} active={!!jornada?.hora_inicio_almuerzo} />
          <TimeBlock label="Fin Almuerzo" time={formatTime(jornada?.hora_fin_almuerzo)} icon={<CheckCircle2 className="w-3 h-3" />} active={!!jornada?.hora_fin_almuerzo} />
          <TimeBlock label="Fin Jornada" time={formatTime(jornada?.hora_fin_jornada)} icon={<LogOut className="w-3 h-3" />} active={isFinished} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!hasStarted ? (
            <Button 
              size="lg" 
              className="h-16 rounded-2xl bg-[#9E7FFF] hover:bg-[#8B6EEF] text-white font-black text-lg shadow-lg shadow-[#9E7FFF]/20"
              onClick={() => clockInMutation.mutate()}
              disabled={clockInMutation.isPending}
            >
              <Play className="mr-2 h-6 w-6" /> INICIAR JORNADA
            </Button>
          ) : !isFinished ? (
            <>
              {!jornada?.hora_inicio_almuerzo ? (
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="h-16 rounded-2xl border-2 border-amber-200 text-amber-600 hover:bg-amber-50 font-black text-lg"
                  onClick={() => startLunchMutation.mutate(jornada.id)}
                  disabled={startLunchMutation.isPending}
                >
                  <Coffee className="mr-2 h-6 w-6" /> INICIAR ALMUERZO
                </Button>
              ) : !jornada?.hora_fin_almuerzo ? (
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="h-16 rounded-2xl border-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50 font-black text-lg"
                  onClick={() => endLunchMutation.mutate(jornada.id)}
                  disabled={endLunchMutation.isPending}
                >
                  <CheckCircle2 className="mr-2 h-6 w-6" /> FIN ALMUERZO
                </Button>
              ) : <div />}

              <Button 
                variant="destructive" 
                size="lg" 
                className="h-16 rounded-2xl font-black text-lg shadow-lg shadow-red-200"
                onClick={() => clockOutMutation.mutate(jornada.id)}
                disabled={clockOutMutation.isPending}
              >
                <LogOut className="mr-2 h-6 w-6" /> FINALIZAR JORNADA
              </Button>
            </>
          ) : (
            <div className="col-span-2 p-6 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center gap-3 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" />
              <span className="font-black uppercase tracking-tight">Jornada completada: {calculateWorkedMinutesForJornada(jornada)} min trabajados</span>
            </div>
          )}
        </div>

        {bypassTimeRestrictions && (
          <div className="p-4 bg-amber-100/50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 font-medium">
              <span className="font-bold uppercase block mb-1">Modo Administrador</span>
              Estás registrando tiempos para el día {format(targetDate, 'dd/MM/yyyy')}. 
              Los registros usarán la fecha seleccionada en lugar de la hora actual del sistema.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const TimeBlock = ({ label, time, icon, active }: { label: string, time: string, icon: React.ReactNode, active: boolean }) => (
  <div className={cn(
    "p-4 rounded-2xl border transition-all",
    active ? "bg-white border-[#9E7FFF]/20 shadow-sm" : "bg-gray-50 border-gray-100 opacity-50"
  )}>
    <div className="flex items-center gap-2 mb-1">
      <div className={cn("p-1 rounded-md", active ? "bg-[#F0EEFF] text-[#9E7FFF]" : "bg-gray-200 text-gray-400")}>
        {icon}
      </div>
      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{label}</span>
    </div>
    <div className={cn("text-lg font-mono font-bold", active ? "text-gray-900" : "text-gray-400")}>
      {time}
    </div>
  </div>
);

export default ClockManager;
