export interface Evidence {
  subject: string;
  signal: string;
  weight: number;
  source: string;
  scope: string;
  message?: string;
}

export class EvidenceGraph {
  #items: Evidence[] = [];
  add(evidence: Evidence): void { this.#items.push({ ...evidence }); }
  list(): Evidence[] { return this.#items.map((item) => ({ ...item })); }
  explain(subject: string, scope: string): Evidence[] { return this.#items.filter((item) => item.subject === subject && item.scope === scope).map((item) => ({ ...item })); }
  score(subject: string, scope: string): number {
    const raw = this.#items.filter((item) => item.subject === subject && item.scope === scope).reduce((total, item) => total + item.weight, 0);
    return Math.max(0, Math.min(1, Math.round(raw * 1000) / 1000));
  }
  subjects(scope: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const item of this.#items) { if (item.scope !== scope) continue; out[item.subject] = this.score(item.subject, scope); }
    return out;
  }
}
