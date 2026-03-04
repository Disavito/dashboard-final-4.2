import { supabase } from '../supabaseClient';
import { Tables, TablesInsert, TablesUpdate } from '../database.types';
import { format, parseISO, differenceInMinutes, setHours, setMinutes, setSeconds } from 'date-fns';

export type Jornada = Tables<'registros_jornada'>;
export type Colaborador = Tables<'colaboradores'>;

/**
 * Combina una fecha base con una hora específica (HH:mm)
 */
const combineDateAndTime = (baseDate: Date, timeStr: string): string => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  let date = setHours(baseDate, hours);
  date = setMinutes(date, minutes);
  date = setSeconds(date, 0);
  return date.toISOString();
};

export const calculateWorkedMinutesForJornada = (jornada: Jornada): number => {
  if (!jornada.hora_inicio_jornada || !jornada.hora_fin_jornada) return 0;
  const inicio = parseISO(jornada.hora_inicio_jornada);
  const fin = parseISO(jornada.hora_fin_jornada);
  let totalMinutes = differenceInMinutes(fin, inicio);
  if (jornada.hora_inicio_almuerzo && jornada.hora_fin_almuerzo) {
    const inicioAlmuerzo = parseISO(jornada.hora_inicio_almuerzo);
    const finAlmuerzo = parseISO(jornada.hora_fin_almuerzo);
    totalMinutes -= Math.max(0, differenceInMinutes(finAlmuerzo, inicioAlmuerzo));
  }
  return Math.max(0, totalMinutes);
};

export const getColaboradorProfile = async (userId: string): Promise<Colaborador | null> => {
  const { data, error } = await supabase.from('colaboradores').select('*').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

export const getAllColaboradores = async (): Promise<Colaborador[]> => {
  const { data, error } = await supabase.from('colaboradores').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const getAdminJornadas = async (filters: { startDate: string; endDate: string; colaboradorId?: string }) => {
  let query = supabase.from('registros_jornada').select(`*, colaboradores (id, name, apellidos, dni)`).gte('fecha', filters.startDate).lte('fecha', filters.endDate).order('fecha', { ascending: false });
  if (filters.colaboradorId && filters.colaboradorId !== 'todos') query = query.eq('colaborador_id', filters.colaboradorId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const getJornadaByDate = async (colaboradorId: string, date: Date): Promise<Jornada | null> => {
  const fecha = format(date, 'yyyy-MM-dd');
  const { data, error } = await supabase.from('registros_jornada').select('*').eq('colaborador_id', colaboradorId).eq('fecha', fecha).single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

/**
 * Inicia la jornada. Permite pasar una fecha/hora específica para registros manuales.
 */
export const clockIn = async (
  colaboradorId: string, 
  customDate?: Date,
  justificacion?: string, 
  observaciones?: string
): Promise<Jornada> => {
  const timestamp = customDate || new Date();
  const newJornada: TablesInsert<'registros_jornada'> = {
    colaborador_id: colaboradorId,
    fecha: format(timestamp, 'yyyy-MM-dd'),
    hora_inicio_jornada: timestamp.toISOString(),
    justificacion_inicio: justificacion || null,
    observaciones_inicio: observaciones || null,
  };
  const { data, error } = await supabase.from('registros_jornada').insert(newJornada).select().single();
  if (error || !data) throw new Error(error?.message || "Error al iniciar jornada");
  return data;
};

export const clockOut = async (jornadaId: number, customDate?: Date, justificacion?: string, observaciones?: string): Promise<Jornada> => {
  const timestamp = customDate || new Date();
  const { data, error } = await supabase.from('registros_jornada').update({ 
    hora_fin_jornada: timestamp.toISOString(),
    justificacion_fin: justificacion || null,
    observaciones_fin: observaciones || null
  }).eq('id', jornadaId).select().single();
  if (error || !data) throw new Error(error?.message || "Error al finalizar jornada");
  return data;
};

export const startLunch = async (jornadaId: number, customDate?: Date) => {
  const timestamp = customDate || new Date();
  const { data, error } = await supabase.from('registros_jornada').update({ hora_inicio_almuerzo: timestamp.toISOString() }).eq('id', jornadaId).select().single();
  if (error) throw error;
  return data;
};

export const endLunch = async (jornadaId: number, customDate?: Date) => {
  const timestamp = customDate || new Date();
  const { data, error } = await supabase.from('registros_jornada').update({ hora_fin_almuerzo: timestamp.toISOString() }).eq('id', jornadaId).select().single();
  if (error) throw error;
  return data;
};

export const adminUpdateJornada = async (jornadaId: number, updates: TablesUpdate<'registros_jornada'>): Promise<Jornada> => {
  const { data, error } = await supabase.from('registros_jornada').update(updates).eq('id', jornadaId).select().single();
  if (error || !data) throw new Error(error?.message || "Error al actualizar jornada");
  return data;
};

/**
 * Crea un registro completo de una vez (útil para registros manuales rápidos)
 */
export const createFullJornadaManual = async (
  colaboradorId: string,
  date: Date,
  times: { inicio: string; inicioAlmuerzo?: string; finAlmuerzo?: string; fin: string }
) => {
  const newJornada: TablesInsert<'registros_jornada'> = {
    colaborador_id: colaboradorId,
    fecha: format(date, 'yyyy-MM-dd'),
    hora_inicio_jornada: combineDateAndTime(date, times.inicio),
    hora_inicio_almuerzo: times.inicioAlmuerzo ? combineDateAndTime(date, times.inicioAlmuerzo) : null,
    hora_fin_almuerzo: times.finAlmuerzo ? combineDateAndTime(date, times.finAlmuerzo) : null,
    hora_fin_jornada: combineDateAndTime(date, times.fin),
    justificacion_inicio: 'Registro manual administrativo',
    justificacion_fin: 'Registro manual administrativo'
  };

  const { data, error } = await supabase.from('registros_jornada').insert(newJornada).select().single();
  if (error) throw error;
  return data;
};
