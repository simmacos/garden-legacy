import type { Model, ModelStatic } from "sequelize";

/**
 * Aggiunge al database le colonne del modello che mancano. `model.sync()` crea le tabelle nuove ma non
 * modifica quelle esistenti: così un aggiornamento che aggiunge un campo non richiede un ALTER TABLE a mano.
 * Solo colonne facoltative (nullable) e solo aggiunte, mai modifiche o cancellazioni: i dati non si toccano.
 * Idempotente: se la colonna c'è già non fa nulla. Ritorna i nomi delle colonne aggiunte.
 */
export async function ensureColumns(model: ModelStatic<Model>, columns: string[]): Promise<string[]> {
    const queryInterface = model.sequelize!.getQueryInterface();
    const table = model.getTableName();
    const existing = await queryInterface.describeTable(table);

    const added: string[] = [];
    for (const name of columns) {
        if (name in existing) continue;
        const attribute = model.getAttributes()[name];
        if (!attribute) throw new Error(`Model ${model.name} has no attribute "${name}"`);
        if (attribute.allowNull !== true) throw new Error(`Column ${name} must be nullable to be added automatically`);
        await queryInterface.addColumn(table, name, attribute);
        added.push(name);
    }
    return added;
}
