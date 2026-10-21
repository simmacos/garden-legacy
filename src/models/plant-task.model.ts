import { DataTypes } from "sequelize";

export default {
    name: "plantTask",
    define: {
        plantId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: "plants", key: "id" },
            onDelete: "CASCADE"
        },
        name: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        intervalDays: {
            type: DataTypes.SMALLINT.UNSIGNED,
            allowNull: true,
            defaultValue: null
        },
        lastDoneAt: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            defaultValue: null
        },
        // Lavoro una tantum ("On a date"): con una data il promemoria è quella data, non ultima + frequenza.
        // Colonna aggiunta dopo: ensureColumns() la crea all'avvio sui database esistenti.
        dueDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            defaultValue: null
        }
    },
    options: {
        tableName: "plant_tasks",
        timestamps: true,
        indexes: [
            { fields: ["plantId"] }
        ]
    }
};
