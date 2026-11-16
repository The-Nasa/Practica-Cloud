import { validateOpeningIntervals, InvalidOpeningIntervalsError } from './opening-hours';
describe('Horarios semanales', () => {
  it('acepta turnos contiguos y fin de día', () => {
    expect(() => validateOpeningIntervals([{ weekday: 1, opensAt: '09:00', closesAt: '12:00' }, { weekday: 1, opensAt: '12:00', closesAt: '24:00' }])).not.toThrow();
  });
  it('rechaza solapamiento y turnos que cruzan medianoche', () => {
    expect(() => validateOpeningIntervals([{ weekday: 1, opensAt: '09:00', closesAt: '13:00' }, { weekday: 1, opensAt: '12:00', closesAt: '18:00' }])).toThrow(InvalidOpeningIntervalsError);
    expect(() => validateOpeningIntervals([{ weekday: 1, opensAt: '22:00', closesAt: '02:00' }])).toThrow(InvalidOpeningIntervalsError);
  });
});
