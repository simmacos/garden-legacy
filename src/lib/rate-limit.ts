/**
 * Limitatore dei tentativi falliti a finestra scorrevole, in memoria (si azzera al riavvio).
 * Dopo `max` fallimenti nella finestra `windowMs` la chiave è bloccata finché il più vecchio esce dalla finestra.
 * Mentre è bloccata i tentativi non vanno conteggiati (si controlla `retryAfter` prima di provare).
 */
export class FailureLimiter {
    private readonly hits = new Map<string, number[]>();

    public constructor(
        private readonly max: number,
        private readonly windowMs: number,
        private readonly now: () => number = Date.now
    ) {}

    /** Secondi da attendere prima di poter riprovare; 0 se non è bloccata. */
    public retryAfter(key: string): number {
        const list = this.recent(key);
        if (list.length < this.max) return 0;
        return Math.max(1, Math.ceil((list[list.length - this.max]! + this.windowMs - this.now()) / 1000));
    }

    public fail(key: string): void {
        const list = this.recent(key);
        list.push(this.now());
        this.hits.set(key, list);
    }

    public reset(key: string): void {
        this.hits.delete(key);
    }

    /** Toglie le chiavi senza fallimenti recenti (da chiamare ogni tanto per non far crescere la memoria). */
    public sweep(): void {
        for (const key of [...this.hits.keys()]) {
            if (!this.recent(key).length) this.hits.delete(key);
        }
    }

    private recent(key: string): number[] {
        const limit = this.now() - this.windowMs;
        const list = (this.hits.get(key) ?? []).filter(t => t > limit);
        if (list.length) this.hits.set(key, list);
        else this.hits.delete(key);
        return list;
    }
}
