import { describe, expect, it } from 'vitest';
import type { LineupPlayer } from '../types';
import { layoutFootball, layoutRugby } from './pitch';

const pl = (number: string, position: string): LineupPlayer => ({ id: number, name: `Joueur ${number}`, number, position, subbedIn: false, subbedOut: false });

describe('composition sur le terrain', () => {
  it('foot 4-3-3 (France ce soir) : gardien, 4 défenseurs de gauche à droite, 3 milieux, 3 attaquants', () => {
    const xi = [pl('16', 'G'), pl('15', 'CD-L'), pl('4', 'CD-R'), pl('3', 'LB'), pl('2', 'RB'), pl('6', 'CM'), pl('14', 'LM'), pl('8', 'RM'), pl('10', 'F'), pl('11', 'LF'), pl('7', 'RF')];
    const placed = layoutFootball(xi, '4-3-3');
    const line = (l: number) => placed.filter((p) => p.line === l).sort((a, b) => a.x - b.x).map((p) => p.player.position);
    expect(line(0)).toEqual(['G']);
    expect(line(1)).toEqual(['LB', 'CD-L', 'CD-R', 'RB']);
    expect(line(2)).toEqual(['LM', 'CM', 'RM']);
    expect(line(3)).toEqual(['LF', 'F', 'RF']);
  });
  it('foot 5-3-2 (Turquie ce soir)', () => {
    const xi = [pl('1', 'G'), pl('5', 'CD'), pl('4', 'CD-L'), pl('6', 'CD-R'), pl('3', 'LB'), pl('2', 'RB'), pl('8', 'CM'), pl('11', 'CM-L'), pl('7', 'CM-R'), pl('9', 'CF-L'), pl('10', 'CF-R')];
    const placed = layoutFootball(xi, '5-3-2');
    expect(placed.filter((p) => p.line === 1).length).toBe(5);
    expect(placed.filter((p) => p.line === 3).sort((a, b) => a.x - b.x).map((p) => p.player.position)).toEqual(['CF-L', 'CF-R']);
  });
  it('formation absente : regroupement par poste, sans perdre de joueur', () => {
    const xi = [pl('1', 'G'), pl('2', 'RB'), pl('3', 'LB'), pl('5', 'CD'), pl('6', 'CD'), pl('8', 'CM'), pl('10', 'AM'), pl('9', 'F'), pl('7', 'RW'), pl('11', 'LW'), pl('4', 'DM')];
    expect(layoutFootball(xi).length).toBe(11);
  });
  it('rugby : les 15 titulaires d\'après leur numéro, les remplaçants à part', () => {
    const xv = Array.from({ length: 23 }, (_, i) => pl(String(i + 1), ''));
    const placed = layoutRugby(xv);
    expect(placed.length).toBe(15);
    expect(placed.find((p) => p.player.number === '15')!.line).toBeLessThan(placed.find((p) => p.player.number === '2')!.line);
  });
});
