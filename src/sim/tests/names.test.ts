import { describe, it, expect } from 'vitest';
import { nameProfileForArea, randomPlayerName } from '../../generators/names';
import { buildTexasLeague } from '../league';

const HISPANIC_SURNAMES = /^(Garcia|Rodriguez|Martinez|Hernandez|Lopez|Gonzalez|Perez|Sanchez|Ramirez|Torres|Flores|Rivera|Gomez|Diaz|Reyes|Morales|Cruz|Ortiz|Gutierrez|Chavez|Ramos|Ruiz|Alvarez|Mendoza|Castillo|Jimenez|Moreno|Romero|Herrera|Medina|Aguilar|Vasquez|Castro|Vargas|Salinas|Guerrero|Cantu|Trevino|Villarreal|Garza|Saenz|Benavides|Zamora|Cavazos|Pena|Rios|Soto|Delgado|Escobar|Ybarra)/;

describe('Player names', () => {
  it('produce a wide variety of full names', () => {
    const names = Array.from({ length: 2000 }, () => {
      const n = randomPlayerName();
      return `${n.firstName} ${n.lastName}`;
    });
    expect(new Set(names).size).toBeGreaterThan(1700);
  });

  it('lean Hispanic in border regions', () => {
    expect(nameProfileForArea('Rio Grande Valley Upper')).toBe('BORDER');
    expect(nameProfileForArea('Laredo, Eagle Pass & Del Rio')).toBe('BORDER');
    expect(nameProfileForArea('Katy ISD')).toBe('DEFAULT');
    const share = (profile: 'BORDER' | 'DEFAULT') =>
      Array.from({ length: 2000 }, () => randomPlayerName(profile).lastName).filter((n) => HISPANIC_SURNAMES.test(n)).length / 2000;
    expect(share('BORDER')).toBeGreaterThan(0.7);
    expect(share('DEFAULT')).toBeLessThan(0.45);
  });

  it('never repeat a full name on a roster, and suffixes are rare', () => {
    const { teams } = buildTexasLeague();
    let suffixed = 0;
    let players = 0;
    for (const team of teams) {
      const full = team.roster.map((p) => `${p.firstName} ${p.lastName}`);
      expect(new Set(full).size).toBe(full.length);
      players += full.length;
      suffixed += full.filter((n) => / (Jr\.|II|III|IV)$/.test(n)).length;
    }
    expect(suffixed / players).toBeGreaterThan(0.01);
    expect(suffixed / players).toBeLessThan(0.1);
  });
});
